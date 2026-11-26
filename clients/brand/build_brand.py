"""Builds the shared look for the Django portal and the C# hub from the Next.js app.

The web app in /frontend is the single source of truth for The Bazaar's look:
its Nextcloud-derived colour tokens and component classes live in
frontend/src/app/globals.css, the logo files in frontend/public/img
and the wallpapers in frontend/public/img. Rather than keep copies that drift,
both clients run this script at image build time and get:

    bazaar.css          tokens + component classes as plain CSS (no Tailwind)
    map.js, vendor/     the live map (Leaflet 1.9.4, BSD-2) both clients draw
    layout.css          the page frame (header, navigation, tables, maps) both clients share
    logo.svg            the awning mark, white, for the blue header
    logo-dark.svg       the same mark in the primary blue, for light surfaces
    img/background*.webp  the wallpapers, copied as they are

Usage: python3 build_brand.py <frontend dir> <output dir>
"""

import re
import shutil
import sys
from pathlib import Path


def plain_css(source: str) -> str:
    css = source.replace('@import "tailwindcss";', "")
    css = css.replace("--color-*: initial;", "")

    # Tailwind's @theme block becomes :root. Keyframes nested in it move out.
    theme = re.search(r"@theme static \{", css)
    if not theme:
        raise SystemExit("globals.css: no @theme block found; has the frontend changed shape?")
    start = theme.end()
    depth, i = 1, start
    while depth:
        depth += {"{": 1, "}": -1}.get(css[i], 0)
        i += 1
    body = css[start : i - 1]
    keyframes = []
    for m in list(re.finditer(r"@keyframes [\w-]+ \{", body))[::-1]:
        d, j = 1, m.end()
        while d:
            d += {"{": 1, "}": -1}.get(body[j], 0)
            j += 1
        keyframes.insert(0, body[m.start() : j].strip())
        body = body[: m.start()] + body[j:]
    css = css[: theme.start()] + ":root {" + body + "}\n\n" + "\n\n".join(keyframes) + css[i:]

    # @utility glass { ... } is an ordinary class outside Tailwind.
    css = re.sub(r"@utility ([\w-]+) \{", r".\1 {", css)
    # The wallpaper paths are relative to wherever this stylesheet is served.
    css = css.replace('url("/img/', 'url("img/')
    if re.search(r"@apply|theme\(|@variant|@custom-variant", css):
        raise SystemExit("globals.css uses Tailwind-only syntax this script doesn't translate yet")
    header = "/* Generated from frontend/src/app/globals.css by clients/brand/build_brand.py. Do not edit. */\n"
    return header + re.sub(r"\n{3,}", "\n\n", css).strip() + "\n"


def main(frontend: Path, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    (out / "bazaar.css").write_text(plain_css((frontend / "src/app/globals.css").read_text()))
    kit = Path(__file__).parent
    for name in ("layout.css", "map.js"):
        shutil.copyfile(kit / name, out / name)
    shutil.copytree(kit / "vendor", out / "vendor", dirs_exist_ok=True)
    # Logo, header tile and wallpapers, exactly as the web app serves them.
    (out / "img").mkdir(exist_ok=True)
    wanted = ["logo.png", "logo-tile.png", "background.webp", "background-dark.webp"]
    for name in wanted:
        src = frontend / "public/img" / name
        if not src.exists():
            raise SystemExit(f"frontend/public/img/{name} is missing")
        shutil.copyfile(src, out / "img" / name)
    print(f"brand assets written to {out}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]))
