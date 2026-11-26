"""Settings for The Bazaar's Django portal.

The portal is a thin, server-rendered client of the Bazaar API. It has no
database of its own: who you are and what you may do come from the API, and
the only thing it keeps is your session (in Redis), which holds your Supabase
tokens so they never reach the browser.
"""

import os
from pathlib import Path
from urllib.parse import urlparse

from django.core.exceptions import ImproperlyConfigured
from django.utils.csp import CSP

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def env_bool(name: str, default: bool = False) -> bool:
    return env(name, "true" if default else "false").lower() in {"1", "true", "yes", "on"}


DEBUG = env_bool("PORTAL_DEBUG")
TESTING = env_bool("PORTAL_TESTING")
# Set only while the image is built (collectstatic), when no secrets exist yet.
BUILDING = env_bool("PORTAL_BUILD")

SECRET_KEY = env("PORTAL_SECRET_KEY")
if not SECRET_KEY:
    if DEBUG or TESTING or BUILDING:
        SECRET_KEY = "dev-only-not-secret-" + "x" * 40
    else:
        raise ImproperlyConfigured("Set PORTAL_SECRET_KEY (openssl rand -hex 32).")
elif len(SECRET_KEY) < 32:
    raise ImproperlyConfigured("PORTAL_SECRET_KEY must be at least 32 characters.")

SITE_DOMAIN = env("SITE_DOMAIN", "localhost")
# Where the portal is mounted on the site. Caddy strips it before the request
# arrives, Django adds it back to every link it writes.
PREFIX = "/" + env("PORTAL_PREFIX", "/portal").strip("/")
FORCE_SCRIPT_NAME = PREFIX if PREFIX != "/" else None

ALLOWED_HOSTS = [SITE_DOMAIN, "portal", "localhost", "127.0.0.1"] + (["testserver"] if TESTING else [])
CSRF_TRUSTED_ORIGINS = [f"https://{SITE_DOMAIN}"] + (["http://localhost:8001"] if DEBUG else [])

STORE_NAME = env("STORE_NAME", "The Bazaar")
# Sign-in attempts allowed per 10 minutes, per visitor address and per email.
LOGIN_LIMIT = int(env("PORTAL_LOGIN_LIMIT", "8"))
# The Next.js shop on the same domain, for "back to the shop" links.
SHOP_URL = env("SHOP_URL", "/")
HUB_URL = env("HUB_URL", "/hub/")

API_URL = env("API_URL_INTERNAL", "http://api:8000/api/v1").rstrip("/")
API_TIMEOUT = float(env("PORTAL_API_TIMEOUT", "15"))
SUPABASE_URL = env("SUPABASE_URL").rstrip("/")
SUPABASE_ANON_KEY = env("SUPABASE_ANON_KEY")

MAP_CENTER = env("MAP_CENTER", "5.6037,-0.1870")
MAP_TILES = env("PORTAL_MAP_TILES", "https://tile.openstreetmap.org/{z}/{x}/{y}.png")
MAP_ATTRIBUTION = env("PORTAL_MAP_ATTRIBUTION", "© OpenStreetMap contributors")

INSTALLED_APPS = [
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "bazaar",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.middleware.csp.ContentSecurityPolicyMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "bazaar.middleware.PortalMiddleware",
]

ROOT_URLCONF = "portal.urls"
WSGI_APPLICATION = "portal.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.template.context_processors.csrf",
                "django.contrib.messages.context_processors.messages",
                "bazaar.context.portal",
            ],
        },
    },
]

# No database: the API owns all data.
DATABASES: dict = {}

REDIS_URL = env("PORTAL_REDIS_URL")
if REDIS_URL:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": REDIS_URL}}
elif DEBUG or TESTING or BUILDING:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
else:
    raise ImproperlyConfigured("Set PORTAL_REDIS_URL so sessions survive restarts and work across workers.")

# Sessions live server side; the cookie is only a random key.
SESSION_ENGINE = "django.contrib.sessions.backends.cache"
SESSION_COOKIE_NAME = "bazaar_portal"
SESSION_COOKIE_PATH = PREFIX if PREFIX != "/" else "/"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_AGE = 60 * 60 * 12
SESSION_EXPIRE_AT_BROWSER_CLOSE = True

# The CSRF secret sits in the session too, so there is no readable cookie.
CSRF_USE_SESSIONS = True
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SECURE = not DEBUG
CSRF_FAILURE_VIEW = "bazaar.views.errors.csrf_failure"

MESSAGE_STORAGE = "django.contrib.messages.storage.session.SessionStorage"

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
# Caddy terminates TLS and redirects http to https, and sets HSTS for the domain.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = False
USE_X_FORWARDED_HOST = False

# Uploads go straight through to the API. These caps match the API's own.
DATA_UPLOAD_MAX_MEMORY_SIZE = 2_500_000
FILE_UPLOAD_MAX_MEMORY_SIZE = 2_500_000
DATA_UPLOAD_MAX_NUMBER_FIELDS = 400
DATA_UPLOAD_MAX_NUMBER_FILES = 12
MAX_IMAGE_BYTES = int(env("MAX_IMAGE_BYTES", "8000000"))
MAX_VIDEO_BYTES = int(env("MAX_VIDEO_BYTES", "50000000"))
FILE_UPLOAD_TEMP_DIR = env("PORTAL_UPLOAD_TMP", "/tmp")


def _origin(url: str) -> str | None:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else None


_media_hosts = [h for h in [_origin(SUPABASE_URL), _origin(MAP_TILES.replace("{s}", "a"))] if h]
_media_hosts += [f"https://{h.strip()}" for h in env("IMAGE_HOST").split(",") if h.strip()]

# Every script and style is a file under /static. Nothing inline, nothing from
# another site, so an injected <script> has nowhere to run.
SECURE_CSP = {
    "default-src": [CSP.NONE],
    "script-src": [CSP.SELF],
    "style-src": [CSP.SELF],
    "img-src": [CSP.SELF, "data:", "blob:", *_media_hosts],
    "media-src": [CSP.SELF, "blob:", *_media_hosts],
    "font-src": [CSP.SELF],
    "connect-src": [CSP.SELF],
    "form-action": [CSP.SELF],
    "frame-ancestors": [CSP.NONE],
    "base-uri": [CSP.NONE],
    "object-src": [CSP.NONE],
    "manifest-src": [CSP.SELF],
}

STATIC_URL = (PREFIX.rstrip("/") + "/static/") if PREFIX != "/" else "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [d for d in [Path(env("PORTAL_BRAND_DIR", str(BASE_DIR / "brand")))] if d.exists()]
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
        if not (DEBUG or TESTING)
        else "django.contrib.staticfiles.storage.StaticFilesStorage"
    },
}
WHITENOISE_MAX_AGE = 60 * 60 * 24 * 30

LANGUAGE_CODE = "en"
TIME_ZONE = env("PORTAL_TIME_ZONE", "UTC")
USE_I18N = False
USE_TZ = True

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {"django.security": {"level": "WARNING"}, "httpx": {"level": "WARNING"}},
}
