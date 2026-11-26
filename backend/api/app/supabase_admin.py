"""Mirrors a user's role into Supabase app_metadata so the frontend can gate
pages without an extra round trip. app_metadata can only be written with the
service role key, so a user can never grant themselves a role this way, and
the API itself always authorises from the profiles table, not the token."""

import logging
import uuid

import httpx

from .config import Settings

log = logging.getLogger("api.supabase")

ROLE_TO_APP_ROLES = {
    "customer": ["customer"],
    "seller": ["customer", "vendor"],
    "rider": ["customer", "rider"],
    "admin": ["admin"],
    "rider_applicant": ["rider_applicant"],
}


def service_headers(settings: Settings) -> dict:
    """Headers for calling Supabase as the service role. A legacy
    service_role key is a JWT and goes in both headers. A newer secret key
    (sb_secret_...) is not a JWT: it goes in apikey only, and Supabase's
    gateway swaps it for a short-lived service token."""
    key = settings.supabase_service_role_key
    if key.startswith("eyJ"):
        return {"Authorization": f"Bearer {key}", "apikey": key}
    return {"apikey": key}


async def sync_app_roles(settings: Settings, user_id: uuid.UUID, role: str) -> None:
    if not (settings.supabase_url and settings.supabase_service_role_key):
        return
    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}"
    headers = service_headers(settings)
    body = {"app_metadata": {"roles": ROLE_TO_APP_ROLES.get(role, ["customer"])}}
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.put(url, headers=headers, json=body)
        if resp.status_code >= 300:
            log.warning("could not sync roles for %s: HTTP %s", user_id, resp.status_code)
    except httpx.HTTPError as exc:
        log.warning("could not sync roles for %s: %s", user_id, exc)
