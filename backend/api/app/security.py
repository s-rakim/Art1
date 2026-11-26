"""Transport level protections: body size cap, security headers, rate limits."""

import ipaddress
import logging
import re
import time
from collections import defaultdict
from typing import Annotated

from fastapi import Depends, Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .auth import AccountUser
from .config import Settings, get_settings
from .errors import ApiError

log = logging.getLogger("api.security")


# ---------------------------------------------------------------------------
# Request body size
# ---------------------------------------------------------------------------


class BodySizeLimit:
    """Rejects bodies over the limit, whether or not Content-Length is honest.
    `larger` gives specific paths (image uploads) their own, bigger cap."""

    def __init__(self, app: ASGIApp, max_bytes: int, larger: list[tuple[re.Pattern, int]] | None = None):
        self.app = app
        self.max_bytes = max_bytes
        self.larger = larger or []

    def _limit(self, scope: Scope) -> int:
        path = scope.get("path", "")
        for pattern, limit in self.larger:
            if pattern.fullmatch(path):
                return limit
        return self.max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        max_bytes = self._limit(scope)

        for name, value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    if int(value) > max_bytes:
                        return await _too_large(send)
                except ValueError:
                    return await _too_large(send)

        seen = 0

        async def limited_receive() -> Message:
            nonlocal seen
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > max_bytes:
                    raise _BodyTooLarge()
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _BodyTooLarge:
            await _too_large(send)


class _BodyTooLarge(Exception):
    pass


async def _too_large(send: Send):
    body = b'{"error":{"code":"payload_too_large","message":"Request body is too large."}}'
    await send(
        {
            "type": "http.response.start",
            "status": 413,
            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
        }
    )
    await send({"type": "http.response.body", "body": body})


# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------

_API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"


class SecurityHeaders:
    def __init__(self, app: ASGIApp, hsts: bool, docs_paths: tuple[str, ...]):
        self.app = app
        self.hsts = hsts
        self.docs_paths = docs_paths

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope.get("path", "")
        is_docs = path.startswith(self.docs_paths)
        authed = any(k == b"authorization" for k, _ in scope.get("headers", []))

        async def send_with_headers(message: Message):
            if message["type"] == "http.response.start":
                headers = [(k, v) for k, v in message.get("headers", []) if k.lower() != b"server"]
                headers += [
                    (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"DENY"),
                    (b"referrer-policy", b"no-referrer"),
                    (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=()"),
                    (b"cross-origin-opener-policy", b"same-origin"),
                    (b"cross-origin-resource-policy", b"same-site"),
                ]
                if not is_docs:
                    headers.append((b"content-security-policy", _API_CSP.encode()))
                if self.hsts:
                    headers.append((b"strict-transport-security", b"max-age=63072000; includeSubDomains"))
                # Never let a shared cache keep a personalised response.
                if authed and not any(k.lower() == b"cache-control" for k, _ in headers):
                    headers.append((b"cache-control", b"private, no-store"))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------


class RateLimiter:
    """Fixed one-minute windows. Redis when configured so the limit holds
    across workers and replicas; an in-process dict otherwise."""

    def __init__(self, redis_url: str = ""):
        self._redis = None
        if redis_url:
            import redis.asyncio as redis

            self._redis = redis.from_url(redis_url, socket_timeout=0.5, socket_connect_timeout=0.5)
        self._local: dict[str, list[float | int]] = defaultdict(lambda: [0.0, 0])

    async def hit(self, key: str, limit: int) -> tuple[bool, int]:
        window = int(time.time() // 60)
        if self._redis is not None:
            try:
                k = f"rl:{key}:{window}"
                pipe = self._redis.pipeline()
                pipe.incr(k)
                pipe.expire(k, 70)
                count, _ = await pipe.execute()
                return count <= limit, max(limit - count, 0)
            except Exception:  # Redis down: fall back rather than fail open or closed globally
                log.warning("rate limiter: redis unavailable, using local counters")
        slot = self._local[key]
        if slot[0] != window:
            slot[0], slot[1] = window, 0
        slot[1] += 1
        if len(self._local) > 50_000:
            self._local.clear()
        return slot[1] <= limit, max(limit - int(slot[1]), 0)

    async def close(self):
        if self._redis is not None:
            await self._redis.aclose()


def client_ip(request: Request) -> str:
    # uvicorn runs with --proxy-headers behind Caddy, so this is the real
    # client address, not the proxy's.
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp, limiter: RateLimiter, per_minute: int, exempt: tuple[str, ...],
                 internal_per_minute: int | None = None, internal_networks: list[str] | None = None):
        self.app = app
        self.limiter = limiter
        self.per_minute = per_minute
        self.exempt = exempt
        self.internal_per_minute = internal_per_minute or per_minute
        self.internal = [ipaddress.ip_network(n, strict=False) for n in internal_networks or []]

    def _is_internal(self, ip: str) -> bool:
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            return False
        return any(addr in net for net in self.internal)

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http" or scope.get("path", "").startswith(self.exempt):
            return await self.app(scope, receive, send)
        ip = scope["client"][0] if scope.get("client") else "unknown"
        # uvicorn has already swapped in the forwarded client address, so a
        # private address here means a container on the compose network
        # calling directly (the web app rendering a public page).
        if self._is_internal(ip):
            ok, _ = await self.limiter.hit("internal", self.internal_per_minute)
        else:
            ok, _ = await self.limiter.hit(f"ip:{ip}", self.per_minute)
        if not ok:
            body = b'{"error":{"code":"rate_limited","message":"Too many requests. Slow down a little."}}'
            await send(
                {
                    "type": "http.response.start",
                    "status": 429,
                    "headers": [(b"content-type", b"application/json"), (b"retry-after", b"60")],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return
        await self.app(scope, receive, send)


def sensitive_limit(bucket: str):
    """Tighter per-user limit for endpoints worth abusing: checkout, reviews,
    store applications, payouts, uploads."""

    async def dependency(
        request: Request,
        user: AccountUser,
        settings: Annotated[Settings, Depends(get_settings)],
    ):
        limit = settings.rate_limit_rider_location if bucket == "rider-location" else settings.rate_limit_sensitive
        ok, _ = await request.app.state.limiter.hit(f"{bucket}:{user.id}", limit)
        if not ok:
            raise ApiError(429, "rate_limited", "Too many attempts. Try again in a minute.", {"Retry-After": "60"})

    return Depends(dependency)
