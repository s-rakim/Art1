"""The portal's connection to the Bazaar API.

Every page is built from API calls made here, on the server, with the signed
in person's own access token. The API checks that token and the person's role
on every request, so the portal can never do more than the person could do
with the Next.js site.

Response shapes are typed in api_types.py, generated from backend/openapi.json
(python scripts/gen_api_types.py).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, cast

import httpx
from django.conf import settings

from . import api_types as t

log = logging.getLogger("portal.api")

_client: httpx.Client | None = None


def client() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(
            base_url=settings.API_URL,
            timeout=settings.API_TIMEOUT,
            headers={"Accept": "application/json", "User-Agent": "bazaar-portal"},
            follow_redirects=False,
        )
    return _client


@dataclass
class ApiError(Exception):
    status: int
    code: str
    message: str
    details: Any = None

    def __str__(self) -> str:
        return self.message


def _raise_for(resp: httpx.Response) -> None:
    if resp.is_success:
        return
    code, message, details = "error", "Something went wrong. Try again in a moment.", None
    try:
        body = resp.json()
        err = body.get("error") if isinstance(body, dict) else None
        if isinstance(err, dict):
            code = str(err.get("code") or code)
            message = str(err.get("message") or message)
            details = err.get("details")
        elif isinstance(body, dict) and "detail" in body:
            details = body["detail"]
            message = "Some of the details aren't right."
    except ValueError:
        pass
    if resp.status_code >= 500:
        log.warning("api %s %s -> %s", resp.request.method, resp.request.url.path, resp.status_code)
        message = "The shop is having trouble right now. Try again in a moment."
    raise ApiError(resp.status_code, code, message, details)


class Api:
    """One person's view of the API. Pass token=None for public pages."""

    def __init__(self, token: str | None = None, client_ip: str | None = None):
        self.token = token
        self.client_ip = client_ip

    def _headers(self) -> dict[str, str]:
        h: dict[str, str] = {}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        if self.client_ip:
            # The API trusts forwarded addresses from the compose network, so
            # its per-visitor rate limits see the real visitor, not the portal.
            h["X-Forwarded-For"] = self.client_ip
        return h

    def request(self, method: str, path: str, *, params: dict | None = None, json: Any = None,
                files: Any = None, data: dict | None = None) -> Any:
        if not path.startswith("/") or ".." in path or "//" in path:
            raise ValueError(f"bad API path {path!r}")
        clean_params = {k: v for k, v in (params or {}).items() if v not in (None, "")}
        try:
            resp = client().request(method, path, params=clean_params, json=json, files=files, data=data,
                                    headers=self._headers())
        except httpx.TimeoutException:
            raise ApiError(504, "timeout", "The shop took too long to answer. Try again.") from None
        except httpx.HTTPError as exc:
            log.warning("api %s %s failed: %s", method, path, type(exc).__name__)
            raise ApiError(502, "unreachable", "The shop can't be reached right now. Try again shortly.") from None
        _raise_for(resp)
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    def get(self, path: str, **params: Any) -> Any:
        return self.request("GET", path, params=params)

    def post(self, path: str, json: Any = None, **kw: Any) -> Any:
        return self.request("POST", path, json=json, **kw)

    def patch(self, path: str, json: Any = None) -> Any:
        return self.request("PATCH", path, json=json)

    def put(self, path: str, json: Any = None, **kw: Any) -> Any:
        return self.request("PUT", path, json=json, **kw)

    def delete(self, path: str) -> Any:
        return self.request("DELETE", path)

    # Typed shortcuts for the calls the portal makes most.
    def me(self) -> t.Me:
        return cast(t.Me, self.get("/me"))

    def products(self, **params: Any) -> t.ProductPage:
        return cast(t.ProductPage, self.get("/products", **params))

    def product(self, slug: str) -> t.ProductDetail:
        return cast(t.ProductDetail, self.get(f"/products/{seg(slug)}"))

    def cart(self) -> t.Cart:
        return cast(t.Cart, self.get("/cart"))

    def site_settings(self) -> t.SiteSettings:
        return cast(t.SiteSettings, self.get("/admin/settings"))


def seg(value: Any) -> str:
    """A single, safe path segment. IDs and slugs from forms or URLs go through
    here so nobody can steer a request to another endpoint."""
    s = str(value)
    if not s or len(s) > 200 or not all(c.isalnum() or c in "-_." for c in s) or s in {".", ".."}:
        raise ApiError(404, "not_found", "That page doesn't exist.")
    return s
