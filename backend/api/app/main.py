import logging
import re
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.openapi.utils import get_openapi
from starlette.types import ASGIApp, Receive, Scope, Send

from . import errors
from .common import SearchClient
from .config import get_settings
from .db import create_pool
from .realtime import Hub
from .realtime import router as realtime_router
from .routers import admin, catalog, me, rider, seller, shop
from .security import BodySizeLimit, RateLimiter, RateLimitMiddleware, SecurityHeaders

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("api")
logging.getLogger("httpx").setLevel(logging.WARNING)


class MaintenanceMode:
    """While the admin has the site in maintenance, only reads, admin
    routes, the status endpoint and payment webhooks get through."""

    def __init__(self, app: ASGIApp, prefix: str):
        self.app = app
        self.prefix = prefix
        self._cached: tuple[float, bool] = (0.0, False)

    async def _enabled(self, scope: Scope) -> bool:
        now = time.monotonic()
        if now - self._cached[0] < 5:
            return self._cached[1]
        try:
            pool = scope["app"].state.pool
            on = bool(await pool.fetchval("select maintenance_mode from app_settings"))
        except Exception:
            on = self._cached[1]
        self._cached = (now, on)
        return on

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] == "http" and scope["method"] not in ("GET", "HEAD", "OPTIONS"):
            path = scope.get("path", "")
            exempt = path.startswith((f"{self.prefix}/admin", f"{self.prefix}/webhooks"))
            if not exempt and await self._enabled(scope):
                body = (b'{"error":{"code":"maintenance","message":"We are doing some maintenance. '
                        b'Please try again shortly."}}')
                await send({"type": "http.response.start", "status": 503,
                            "headers": [(b"content-type", b"application/json"), (b"retry-after", b"120")]})
                await send({"type": "http.response.body", "body": body})
                return
        await self.app(scope, receive, send)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.pool = await create_pool(settings)
    app.state.search = SearchClient(settings.search_url)
    app.state.limiter = RateLimiter(settings.redis_url)
    app.state.hub = Hub()
    await app.state.hub.start(settings.database_url)
    log.info("api ready (%s)", settings.environment)
    try:
        yield
    finally:
        await app.state.hub.stop()
        await app.state.search.close()
        await app.state.limiter.close()
        await app.state.pool.close()


def create_app() -> FastAPI:
    settings = get_settings()
    prefix = settings.api_prefix
    docs = settings.expose_docs or not settings.is_production

    app = FastAPI(
        title="The Bazaar API",
        version="1.0.0",
        description=(
            "The Bazaar, a multi-vendor market: catalogue, cart, checkout, orders, store space rental, "
            "rider hiring and dispatch, and live updates over /ws/live. Everyone signs in on one page "
            "with email and password through Supabase Auth; GET /me says which role the account has "
            "and where to send it. Authenticate with a Supabase access token "
            "as `Authorization: Bearer <token>`. Money is integer cents with a currency code. "
            "Errors look like `{\"error\": {\"code\": \"...\", \"message\": \"...\"}}`."
        ),
        lifespan=lifespan,
        openapi_url=f"{prefix}/openapi.json",
        docs_url=f"{prefix}/docs" if docs else None,
        redoc_url=None,
    )
    errors.install(app)

    for r in (catalog.router, me.router, shop.router, seller.router, rider.router, admin.router, admin.public,
              realtime_router):
        app.include_router(r, prefix=prefix)

    @app.get("/healthz", include_in_schema=False)
    async def healthz():
        return {"ok": True}

    @app.get("/readyz", include_in_schema=False)
    async def readyz():
        await app.state.pool.fetchval("select 1")
        return {"ok": True}

    # Starlette runs middleware outermost-last: the body cap and headers wrap
    # everything, rate limiting runs before any database work.
    app.add_middleware(MaintenanceMode, prefix=prefix)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,  # bearer tokens, not cookies
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )
    app.add_middleware(RateLimitMiddleware, limiter=_LazyLimiter(app), per_minute=settings.rate_limit_ip,
                       exempt=("/healthz", "/readyz", f"{prefix}/webhooks"))
    app.add_middleware(SecurityHeaders, hsts=settings.is_production, docs_paths=(f"{prefix}/docs",))
    if settings.trusted_hosts != ["*"]:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts + ["localhost", "api"])
    # Image uploads may be bigger than ordinary JSON bodies; nothing else is.
    product = rf"{re.escape(prefix)}/seller/products/[0-9a-fA-F-]{{36}}"
    image_paths = re.compile(product + r"/images(/[0-9a-fA-F-]{36})?")
    video_path = re.compile(product + r"/video")
    app.add_middleware(BodySizeLimit, max_bytes=settings.max_body_bytes,
                       larger=[(image_paths, settings.max_image_bytes + 64_000),
                               (video_path, settings.max_video_bytes + settings.max_image_bytes + 64_000)])
    return app


class _LazyLimiter:
    """The limiter is created in lifespan; middleware is built before that."""

    def __init__(self, app: FastAPI):
        self.app = app

    async def hit(self, key: str, limit: int):
        return await self.app.state.limiter.hit(key, limit)


def export_openapi(app: FastAPI) -> dict:
    return get_openapi(title=app.title, version=app.version, description=app.description, routes=app.routes)


app = create_app()
