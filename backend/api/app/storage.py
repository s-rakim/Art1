"""Product images: checking, cleaning and storing them in Supabase Storage.

Uploaded files are never stored as sent. Each one is opened with Pillow,
which has to recognise it as a JPEG, PNG, WebP or AVIF from its contents
(the filename and the browser's Content-Type are ignored), and is then
re-encoded to WebP at a sane size. Re-encoding drops EXIF data, including
the GPS position phones write into photos, and anything smuggled after the
image data, so a file that is also valid HTML or a script never reaches the
bucket as such.

Files go under stores/<store id>/ and only that store's prefix is accepted
when a product's image URLs are saved, so one store can't attach, replace
or delete another store's pictures.
"""

import asyncio
import io
import uuid
import warnings
from urllib.parse import urlsplit

import httpx
from PIL import Image, ImageOps, UnidentifiedImageError

from .config import Settings
from .errors import ApiError

ACCEPTED_FORMATS = {"JPEG", "PNG", "WEBP", "AVIF"}
MAX_PIXELS = 40_000_000  # about 7300 x 5500: any real product photo, no decompression bombs


def configured(settings: Settings) -> bool:
    return bool(_base(settings) and settings.supabase_service_role_key)


def _base(settings: Settings) -> str:
    return (settings.storage_url or settings.supabase_url).rstrip("/")


def public_url(settings: Settings, path: str, bucket: str | None = None) -> str:
    return f"{_base(settings)}/storage/v1/object/public/{bucket or settings.storage_bucket}/{path}"


def store_prefix(settings: Settings, store_id: uuid.UUID) -> str:
    return public_url(settings, f"stores/{store_id}/")


def path_in_store(settings: Settings, store_id: uuid.UUID, url: str, bucket: str | None = None) -> str | None:
    """The storage path of a file this store uploaded, or None."""
    if not configured(settings):
        return None
    prefix = public_url(settings, f"stores/{store_id}/", bucket)
    if not url.startswith(prefix):
        return None
    rest = url[len(prefix):]
    if not rest or "/" in rest or ".." in rest or "?" in rest or "#" in rest:
        return None
    return f"stores/{store_id}/{rest}"


def url_allowed(settings: Settings, store_id: uuid.UUID, url: str) -> bool:
    if path_in_store(settings, store_id, url):
        return True
    host = (urlsplit(url).hostname or "").lower()
    return bool(host) and host in {h.lower() for h in settings.image_url_hosts}


def _clean(data: bytes, max_side: int) -> bytes:
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        try:
            with Image.open(io.BytesIO(data)) as probe:
                if probe.format not in ACCEPTED_FORMATS:
                    raise ApiError(415, "unsupported_image", "Upload a JPEG, PNG, WebP or AVIF image.")
                width, height = probe.size
                if width * height > MAX_PIXELS or width < 1 or height < 1:
                    raise ApiError(422, "image_too_big", "That image has too many pixels.")
                probe.verify()
            with Image.open(io.BytesIO(data)) as img:
                img.load()
                img = ImageOps.exif_transpose(img)
                if img.mode not in ("RGB", "RGBA"):
                    img = img.convert("RGBA" if "A" in img.getbands() or "transparency" in img.info else "RGB")
                img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
                out = io.BytesIO()
                img.save(out, format="WEBP", quality=85, method=4)
                return out.getvalue()
        except ApiError:
            raise
        except (UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning,
                OSError, ValueError, SyntaxError):
            raise ApiError(415, "unsupported_image", "That file isn't an image we can read.") from None


async def clean_image(data: bytes, settings: Settings) -> bytes:
    if not data:
        raise ApiError(422, "empty_file", "The file is empty.")
    if len(data) > settings.max_image_bytes:
        raise ApiError(413, "image_too_large", f"Images can be up to {settings.max_image_bytes // 1_000_000} MB.")
    # Decoding is CPU work; keep it off the event loop.
    return await asyncio.to_thread(_clean, data, settings.image_max_side)


def _headers(settings: Settings) -> dict:
    key = settings.supabase_service_role_key
    return {"Authorization": f"Bearer {key}", "apikey": key}


async def put_object(settings: Settings, path: str, data: bytes, content_type: str, bucket: str | None = None) -> None:
    url = f"{_base(settings)}/storage/v1/object/{bucket or settings.storage_bucket}/{path}"
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            url,
            headers={**_headers(settings), "Content-Type": content_type, "x-upsert": "false",
                     "Cache-Control": "max-age=31536000"},
            content=data,
        )
    if resp.status_code >= 300:
        raise ApiError(502, "upload_failed", "Could not store the image. Try again.")


async def delete_objects(settings: Settings, paths: list[str], bucket: str | None = None) -> None:
    """Best effort: a leftover file is harmless, a failed request must not
    undo the change the vendor just made."""
    if not paths or not configured(settings):
        return
    url = f"{_base(settings)}/storage/v1/object/{bucket or settings.storage_bucket}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.request("DELETE", url, headers=_headers(settings), json={"prefixes": paths})
    except httpx.HTTPError:
        pass


async def store_image(settings: Settings, store_id: uuid.UUID, data: bytes) -> str:
    """Clean, store and return the public URL."""
    if not configured(settings):
        raise ApiError(503, "uploads_disabled", "Image uploads are not configured on this server.")
    cleaned = await clean_image(data, settings)
    path = f"stores/{store_id}/{uuid.uuid4().hex}.webp"
    await put_object(settings, path, cleaned, "image/webp")
    return public_url(settings, path)


# ---------------------------------------------------------------------------
# Videos
# ---------------------------------------------------------------------------
#
# Re-encoding video would need ffmpeg in the image and a lot of CPU, so
# videos are checked structurally instead:
#
#   * MP4 and MOV (ISO base media): the file must be a clean chain of boxes
#     from the first byte to the last, start with an ftyp box naming a known
#     video brand, and contain both moov (the index) and mdat (the media).
#     Anything glued on before or after, which is how polyglot files are
#     built, breaks the chain. The length is read from mvhd and capped.
#   * WebM: an EBML header whose DocType is "webm".
#
# Whatever the browser claimed, the file is stored as video/mp4 or
# video/webm under a random name in the store's folder of a video-only
# bucket, so it is only ever served as a video.

_MP4_BRANDS = {b"isom", b"iso2", b"iso3", b"iso4", b"iso5", b"iso6", b"mp41", b"mp42", b"avc1", b"M4V ",
               b"M4VH", b"M4VP", b"qt  ", b"dash", b"msnv", b"mmp4", b"3gp5", b"3gp6"}
_CONTAINERS = {b"moov", b"trak", b"mdia", b"minf", b"stbl", b"edts", b"udta"}


def _bad_video(message: str = "Upload an MP4, MOV or WebM video.") -> ApiError:
    return ApiError(415, "unsupported_video", message)


def _mp4_boxes(data: bytes, start: int, end: int):
    pos = start
    while pos < end:
        if end - pos < 8:
            raise _bad_video("That video file is damaged.")
        size = int.from_bytes(data[pos:pos + 4], "big")
        kind = data[pos + 4:pos + 8]
        header = 8
        if size == 1:
            if end - pos < 16:
                raise _bad_video("That video file is damaged.")
            size = int.from_bytes(data[pos + 8:pos + 16], "big")
            header = 16
        elif size == 0:
            size = end - pos
        if size < header or pos + size > end:
            raise _bad_video("That video file is damaged.")
        yield kind, pos + header, pos + size
        pos += size


def _mp4_duration(data: bytes, start: int, end: int) -> float | None:
    for kind, body, stop in _mp4_boxes(data, start, end):
        if kind == b"mvhd" and stop - body >= 32:
            version = data[body]
            if version == 1 and stop - body >= 32:
                timescale = int.from_bytes(data[body + 20:body + 24], "big")
                duration = int.from_bytes(data[body + 24:body + 32], "big")
            else:
                timescale = int.from_bytes(data[body + 12:body + 16], "big")
                duration = int.from_bytes(data[body + 16:body + 20], "big")
            return duration / timescale if timescale else None
    return None


def inspect_video(data: bytes, max_seconds: int) -> tuple[str, float | None]:
    """Returns (content type, duration in seconds) or raises."""
    if data[:4] == b"\x1a\x45\xdf\xa3":
        head = data[:64]
        if b"\x42\x82" in head and b"webm" in head:
            return "video/webm", None
        raise _bad_video()
    if data[4:8] != b"ftyp" or data[8:12] not in _MP4_BRANDS:
        raise _bad_video()
    seen: dict[bytes, tuple[int, int]] = {}
    for kind, body, stop in _mp4_boxes(data, 0, len(data)):
        seen.setdefault(kind, (body, stop))
    if b"moov" not in seen or b"mdat" not in seen:
        raise _bad_video("That video has no playable track.")
    duration = _mp4_duration(data, *seen[b"moov"])
    if duration is not None and duration > max_seconds:
        raise ApiError(422, "video_too_long", f"Videos can be up to {max_seconds} seconds long.")
    return "video/mp4", duration


async def store_video(settings: Settings, store_id: uuid.UUID, data: bytes) -> tuple[str, str, float | None]:
    """Check, store and return (public URL, content type, duration)."""
    if not configured(settings):
        raise ApiError(503, "uploads_disabled", "Uploads are not configured on this server.")
    if not data:
        raise ApiError(422, "empty_file", "The file is empty.")
    if len(data) > settings.max_video_bytes:
        raise ApiError(413, "video_too_large", f"Videos can be up to {settings.max_video_bytes // 1_000_000} MB.")
    content_type, duration = await asyncio.to_thread(inspect_video, data, settings.max_video_seconds)
    ext = "webm" if content_type == "video/webm" else "mp4"
    path = f"stores/{store_id}/{uuid.uuid4().hex}.{ext}"
    await put_object(settings, path, data, content_type, bucket=settings.video_bucket)
    return public_url(settings, path, settings.video_bucket), content_type, duration
