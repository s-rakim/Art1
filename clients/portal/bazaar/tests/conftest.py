"""Portal tests run against a fake API and a fake Supabase auth server, both
plain httpx MockTransports, so they need no network and no backend."""

import json
import os
import time

os.environ.setdefault("PORTAL_TESTING", "1")
os.environ.setdefault("PORTAL_PREFIX", "/")
os.environ.setdefault("SUPABASE_URL", "https://auth.test")
os.environ.setdefault("SUPABASE_ANON_KEY", "anon-test-key")
os.environ.setdefault("API_URL_INTERNAL", "http://api.test/api/v1")

import httpx
import pytest

from bazaar import api, auth

ACCESS = "access-token-SHOULD-NEVER-REACH-THE-BROWSER"
REFRESH = "refresh-token-SHOULD-NEVER-REACH-THE-BROWSER"


class FakeBackend:
    def __init__(self):
        self.role = "customer"
        self.calls: list[tuple[str, str, dict | None]] = []
        self.password = "correct horse"
        self.cart_lines = [1, 2, 3]
        self.settings = {
            "currency": "GHS", "standard_shipping_cents": 1500, "express_shipping_cents": 3000,
            "free_shipping_over_cents": None, "rider_fee_cents": 1000, "tax_rate": 0.125,
            "contact_name": None, "contact_email": None, "contact_phone": None, "contact_whatsapp": None,
            "contact_note": None, "maintenance_mode": False, "maintenance_message": None,
            "vendor_signups_open": True, "rider_signups_open": True, "updated_at": "2026-11-25T10:00:00Z",
        }

    # Supabase GoTrue
    def gotrue(self, request: httpx.Request) -> httpx.Response:
        assert request.headers["apikey"] == "anon-test-key"
        body = json.loads(request.content or b"{}")
        if request.url.path == "/auth/v1/token" and request.url.params["grant_type"] == "password":
            if body.get("password") != self.password:
                return httpx.Response(400, json={"error_code": "invalid_credentials"})
            return httpx.Response(200, json={"access_token": ACCESS, "refresh_token": REFRESH,
                                             "expires_at": int(time.time()) + 3600, "user": {"id": "u1"}})
        if request.url.path == "/auth/v1/token":
            return httpx.Response(200, json={"access_token": ACCESS + "-2", "refresh_token": REFRESH + "-2",
                                             "expires_in": 3600, "user": {"id": "u1"}})
        if request.url.path == "/auth/v1/logout":
            return httpx.Response(204)
        return httpx.Response(404)

    # The Bazaar API
    def api(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path.removeprefix("/api/v1")
        body = json.loads(request.content) if request.content and request.headers.get("content-type", "").startswith("application/json") else None
        self.calls.append((request.method, path, body))
        authed = request.headers.get("authorization", "").startswith("Bearer access-token")
        if path == "/me":
            if not authed:
                return httpx.Response(401, json={"error": {"code": "unauthorized", "message": "Sign in."}})
            return httpx.Response(200, json={"id": "u1", "email": "ama@example.com", "full_name": "Ama Owusu",
                                             "first_name": "Ama", "avatar_url": None, "role": self.role,
                                             "signup_as": "customer", "home": "/", "rider_status": None, "store": None})
        if path == "/products":
            return httpx.Response(200, json={"items": [{"id": "p1", "slug": "kente-scarf", "title": "Kente scarf",
                "brand": None, "image_url": None, "price_cents": 4550, "compare_at_cents": None, "currency": "GHS",
                "rating": 0, "review_count": 0, "sold_count": 0, "store": {"slug": "osu", "name": "Osu Weavers"},
                "category_slug": None, "sponsored": False}], "total": 1, "page": 1, "page_size": 24, "facets": {}})
        if path == "/categories":
            return httpx.Response(200, json=[])
        if path == "/cart" and request.method == "GET":
            items = [{"id": f"l{n}", "variant_id": f"v{n}", "product_id": f"p{n}", "product_slug": f"thing-{n}",
                      "title": f"Thing {n}", "variant_title": "Default", "image_url": None, "quantity": n,
                      "unit_price_cents": 1000, "line_total_cents": 1000 * n, "available": True, "stock": 9,
                      "store": {"slug": "osu", "name": "Osu Weavers"}} for n in self.cart_lines]
            return httpx.Response(200, json={"id": "c1", "items": items, "item_count": sum(self.cart_lines),
                                             "subtotal_cents": 1000 * sum(self.cart_lines),
                                             "shipping_estimate_cents": 1500, "currency": "GHS"})
        if path == "/me/addresses":
            return httpx.Response(200, json=[{"id": "a1", "full_name": "Ama Owusu", "line1": "1 Oxford St",
                                              "line2": None, "city": "Accra", "country": "GH", "phone": "024",
                                              "is_default": True}])
        if path == "/checkout":
            return httpx.Response(201, json={"order_id": "o1", "order_number": "BZ-1001"})
        if path == "/wishlist" and request.method == "GET":
            return httpx.Response(200, json={"items": [], "total": 0, "page": 1, "page_size": 48})
        if path.startswith("/wishlist") or (path.startswith("/cart/items/") and request.method == "DELETE"):
            return httpx.Response(204)
        if path == "/cart/items" and request.method == "POST":
            return httpx.Response(201, json={"id": "c1", "items": [], "item_count": body["quantity"],
                                             "subtotal_cents": 0, "shipping_estimate_cents": 0, "currency": "GHS"})
        if path == "/admin/settings":
            if self.role != "admin":
                return httpx.Response(403, json={"error": {"code": "forbidden", "message": "Admins only."}})
            if request.method == "PATCH":
                self.settings.update({k: v for k, v in body.items() if v is not None})
            return httpx.Response(200, json=self.settings)
        if path in ("/admin/plans", "/admin/placement-slots"):
            return httpx.Response(200, json=[])
        return httpx.Response(404, json={"error": {"code": "not_found", "message": "Not found."}})


@pytest.fixture
def backend(monkeypatch):
    fake = FakeBackend()
    monkeypatch.setattr(api, "_client", httpx.Client(base_url="http://api.test/api/v1",
                                                     transport=httpx.MockTransport(fake.api)))
    monkeypatch.setattr(auth, "_http", httpx.Client(transport=httpx.MockTransport(fake.gotrue)))
    from django.core.cache import cache
    cache.clear()
    return fake


@pytest.fixture
def signed_in(client, backend):
    def _as(role: str = "customer"):
        backend.role = role
        r = client.post("/account/login", {"email": "ama@example.com", "password": "correct horse"})
        assert r.status_code == 302, r.content
        return client
    return _as
