"""Supabase token verification and role checks.

A request is authenticated by a Supabase access token in the Authorization
header. We verify it ourselves on every request (signature, expiry, audience,
issuer, algorithm allowlist) and then load the caller's role from our own
profiles table. The role inside the token is never trusted for authorisation:
it is only as fresh as the token, and app_metadata is merely mirrored from the
database for the frontend's convenience.
"""

import asyncio
import logging
import uuid
from dataclasses import dataclass
from typing import Annotated

import asyncpg
import jwt
from fastapi import Depends, Request

from .config import Settings, get_settings
from .db import get_conn
from .errors import ApiError, forbidden

log = logging.getLogger("api.auth")

_ASYMMETRIC_ALGS = ["ES256", "RS256"]
_jwk_client: jwt.PyJWKClient | None = None


@dataclass(frozen=True)
class User:
    id: uuid.UUID
    email: str | None
    role: str
    aal: str

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


def _unauthorized(message: str = "Sign in to continue.") -> ApiError:
    return ApiError(401, "unauthorized", message, headers={"WWW-Authenticate": "Bearer"})


def _jwks(settings: Settings) -> jwt.PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        url = settings.supabase_url.rstrip("/") + "/auth/v1/.well-known/jwks.json"
        _jwk_client = jwt.PyJWKClient(url, cache_keys=True, lifespan=600, timeout=5)
    return _jwk_client


async def decode_token(token: str, settings: Settings) -> dict:
    if len(token) > 8192:
        raise _unauthorized("Invalid token.")
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        raise _unauthorized("Invalid token.") from None

    alg = header.get("alg")
    options = {"require": ["exp", "sub", "aud"], "verify_aud": True}
    issuer = settings.supabase_url.rstrip("/") + "/auth/v1" if settings.supabase_url else None

    try:
        if alg == "HS256" and settings.supabase_jwt_secret:
            key = settings.supabase_jwt_secret
            algorithms = ["HS256"]
        elif alg in _ASYMMETRIC_ALGS and settings.supabase_url:
            signing_key = await asyncio.to_thread(_jwks(settings).get_signing_key_from_jwt, token)
            key = signing_key.key
            algorithms = _ASYMMETRIC_ALGS
        else:
            # Covers "none", HS512, a symmetric token when only JWKS is
            # configured, and anything else unexpected.
            raise _unauthorized("Invalid token.")
        claims = jwt.decode(
            token,
            key,
            algorithms=algorithms,
            audience=settings.supabase_jwt_audience,
            issuer=issuer,
            options=options,
            leeway=10,
        )
    except ApiError:
        raise
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Your session has expired.") from None
    except (jwt.PyJWTError, jwt.PyJWKClientError):
        raise _unauthorized("Invalid token.") from None

    # Supabase also signs anon and service_role keys with the same secret.
    # Those are not users.
    if claims.get("role") != "authenticated":
        raise _unauthorized("Invalid token.")
    return claims


async def _load_user(conn: asyncpg.Connection, claims: dict) -> User:
    try:
        uid = uuid.UUID(str(claims["sub"]))
    except ValueError:
        raise _unauthorized("Invalid token.") from None

    email = claims.get("email") or None
    meta = claims.get("user_metadata") or {}
    full_name = meta.get("full_name") or meta.get("name")
    if isinstance(full_name, str):
        full_name = full_name[:120]
    else:
        full_name = None

    rec = await conn.fetchrow(
        """
        insert into profiles (id, email, full_name)
        values ($1, $2, $3)
        on conflict (id) do update
           set email = excluded.email
         where profiles.email is distinct from excluded.email
        returning role
        """,
        uid,
        email,
        full_name,
    )
    if rec is None:
        rec = await conn.fetchrow("select role from profiles where id = $1", uid)
    return User(id=uid, email=email, role=rec["role"], aal=str(claims.get("aal") or "aal1"))


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization")
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _unauthorized("Invalid authorization header.")
    return token.strip()


async def optional_user(
    request: Request,
    conn: Annotated[asyncpg.Connection, Depends(get_conn)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User | None:
    token = _bearer(request)
    if token is None:
        return None
    user = await _load_user(conn, await decode_token(token, settings))
    request.state.user_id = str(user.id)
    return user


async def current_user(user: Annotated[User | None, Depends(optional_user)]) -> User:
    if user is None:
        raise _unauthorized()
    return user


async def admin_user(
    user: Annotated[User, Depends(current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    if not user.is_admin:
        raise forbidden("Admins only.")
    if settings.admin_require_mfa and user.aal != "aal2":
        raise forbidden("Admin actions need a session verified with a second factor.")
    return user


CurrentUser = Annotated[User, Depends(current_user)]
OptionalUser = Annotated[User | None, Depends(optional_user)]
AdminUser = Annotated[User, Depends(admin_user)]
