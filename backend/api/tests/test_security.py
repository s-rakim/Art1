"""Attacks we expect people to try, and what should happen."""

import base64
import json
import time
import uuid

import asyncpg
import jwt
import pytest
from conftest import ADDRESS, API, JWT_SECRET, add_product, hire_rider, make_token, open_store

# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------


def _b64(d: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()


def _unsigned(claims: dict) -> str:
    return f"{_b64({'alg': 'none', 'typ': 'JWT'})}.{_b64(claims)}."


def _claims(**kw):
    now = int(time.time())
    c = {"sub": str(uuid.uuid4()), "aud": "authenticated", "role": "authenticated", "exp": now + 600, "iat": now}
    c.update(kw)
    return c


@pytest.mark.parametrize(
    "token",
    [
        _unsigned(_claims()),                                                     # alg=none
        jwt.encode(_claims(), JWT_SECRET, algorithm="HS512"),                     # algorithm not allowed
        jwt.encode(_claims(), "wrong-secret-wrong-secret-wrong-secret!!", algorithm="HS256"),
        jwt.encode(_claims(exp=int(time.time()) - 120), JWT_SECRET, algorithm="HS256"),  # expired
        jwt.encode(_claims(aud="somebody-else"), JWT_SECRET, algorithm="HS256"),
        jwt.encode(_claims(role="anon"), JWT_SECRET, algorithm="HS256"),          # the anon key
        jwt.encode(_claims(role="service_role"), JWT_SECRET, algorithm="HS256"),  # service key as a user
        jwt.encode(_claims(sub="not-a-uuid"), JWT_SECRET, algorithm="HS256"),
        jwt.encode({k: v for k, v in _claims().items() if k != "exp"}, JWT_SECRET, algorithm="HS256"),
        "garbage",
        "a" * 9000,
    ],
)
async def test_bad_tokens_rejected(client, token):
    r = await client.get(f"{API}/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


async def test_wrong_auth_scheme(client):
    r = await client.get(f"{API}/me", headers={"Authorization": "Basic Zm9vOmJhcg=="})
    assert r.status_code == 401


async def test_role_in_token_is_ignored(actor, client):
    """Putting admin in the token's metadata changes nothing: roles come from
    the database."""
    uid = uuid.uuid4()
    token = make_token(uid, app_metadata={"roles": ["admin"]}, user_metadata={"role": "admin"})
    r = await client.get(f"{API}/admin/stats", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Roles
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/admin/stats"),
        ("GET", "/admin/stores"),
        ("GET", "/admin/income"),
        ("PATCH", "/admin/settings"),
        ("GET", "/admin/deliveries"),
        ("POST", "/admin/billing/run"),
    ],
)
async def test_customers_cannot_reach_admin(actor, method, path):
    a = actor()
    r = await a.client.request(method, f"{API}{path}", headers=a.headers, json={})
    assert r.status_code == 403


async def test_admin_needs_auth(client):
    r = await client.get(f"{API}/admin/stats")
    assert r.status_code == 401


async def test_customer_is_not_a_seller_or_rider(actor):
    a = actor()
    assert (await a.get(f"{API}/seller/me")).status_code == 403
    assert (await a.get(f"{API}/seller/orders")).status_code == 403
    assert (await a.post(f"{API}/rider/location", json={"lat": 1, "lng": 1})).status_code == 403
    assert (await a.get(f"{API}/rider/deliveries")).status_code == 403


async def test_pending_store_cannot_publish(actor):
    s = actor()
    r = await s.post(
        f"{API}/seller/applications",
        json={"store_name": "Not Yet", "country": "GH", "support_email": "a@example.com",
              "business": {"legal_name": "X"}},
    )
    assert r.status_code == 201
    r = await s.post(
        f"{API}/seller/products",
        json={"title": "Thing", "status": "active", "variants": [{"sku": "NY-1", "price_cents": 100}]},
    )
    assert r.status_code == 403
    # Drafts are fine.
    r = await s.post(
        f"{API}/seller/products",
        json={"title": "Thing", "status": "draft", "variants": [{"sku": "NY-2", "price_cents": 100}]},
    )
    assert r.status_code == 201


async def test_rider_applicant_cannot_ride(actor):
    r_ = actor()
    r = await r_.post(f"{API}/rider/applications",
                      json={"full_name": "Yaw", "phone": "+233200000000", "city": "Accra", "vehicle": "bicycle"})
    assert r.status_code == 201
    r = await r_.post(f"{API}/rider/location", json={"lat": 5.6, "lng": -0.2})
    assert r.status_code == 403


async def test_no_public_admin_signup(actor, admin):
    a = actor()
    r = await a.patch(f"{API}/me", json={"role": "admin"})
    assert r.status_code == 422  # unknown field
    r = await a.patch(f"{API}/admin/users/{a.id}", json={"role": "admin"})
    assert r.status_code == 403


async def test_admin_cannot_demote_self(admin):
    r = await admin.patch(f"{API}/admin/users/{admin.id}", json={"role": "customer"})
    assert r.status_code == 409


# ---------------------------------------------------------------------------
# Other people's things (IDOR)
# ---------------------------------------------------------------------------


@pytest.fixture
async def world(actor, admin):
    seller_a = await open_store(actor, admin)
    seller_b = await open_store(actor, admin)
    product_a = await add_product(seller_a, stock=5)
    buyer_a, buyer_b = actor(), actor()
    r = await buyer_a.post(
        f"{API}/checkout",
        json={"items": [{"variant_id": product_a["variants"][0]["id"], "quantity": 1}], "shipping_address": ADDRESS},
    )
    order_id = r.json()["order_id"]
    so = (await seller_a.get(f"{API}/seller/orders")).json()["items"][0]
    rider_a = await hire_rider(actor, admin)
    rider_b = await hire_rider(actor, admin)
    r = await seller_a.post(f"{API}/seller/orders/{so['id']}/dispatch", json={"rider_id": str(rider_a.id)})
    delivery_id = r.json()["delivery"]["id"]
    return {
        "seller_a": seller_a, "seller_b": seller_b, "product_a": product_a, "buyer_a": buyer_a,
        "buyer_b": buyer_b, "order_id": order_id, "store_order_id": so["id"], "rider_a": rider_a,
        "rider_b": rider_b, "delivery_id": delivery_id,
    }


async def test_buyers_cannot_see_each_others_orders(world):
    b, oid = world["buyer_b"], world["order_id"]
    assert (await b.get(f"{API}/orders/{oid}")).status_code == 404
    assert (await b.get(f"{API}/orders/{oid}/tracking")).status_code == 404
    assert (await b.post(f"{API}/orders/{oid}/cancel")).status_code == 404
    listing = (await b.get(f"{API}/orders")).json()
    assert listing["total"] == 0


async def test_sellers_cannot_touch_each_others_stuff(world):
    sb = world["seller_b"]
    pid = world["product_a"]["id"]
    vid = world["product_a"]["variants"][0]["id"]
    so = world["store_order_id"]
    assert (await sb.get(f"{API}/seller/products/{pid}")).status_code == 404
    assert (await sb.patch(f"{API}/seller/products/{pid}", json={"title": "Pwned"})).status_code == 404
    assert (await sb.delete(f"{API}/seller/products/{pid}")).status_code == 404
    assert (await sb.patch(f"{API}/seller/variants/{vid}", json={"price_cents": 1})).status_code == 404
    assert (await sb.post(f"{API}/seller/products/{pid}/variants",
                          json={"sku": "X-1", "price_cents": 1})).status_code == 404
    assert (await sb.get(f"{API}/seller/orders/{so}")).status_code == 404
    assert (await sb.patch(f"{API}/seller/orders/{so}", json={"status": "shipped"})).status_code == 404
    assert (await sb.post(f"{API}/seller/orders/{so}/confirm-payment")).status_code == 404
    assert (await sb.post(f"{API}/seller/orders/{so}/dispatch",
                          json={"rider_id": str(world["rider_b"].id)})).status_code == 404
    assert (await sb.post(f"{API}/seller/deliveries/{world['delivery_id']}/cancel")).status_code == 409


async def test_riders_cannot_take_each_others_jobs(world):
    rb, did = world["rider_b"], world["delivery_id"]
    assert (await rb.get(f"{API}/rider/deliveries/{did}")).status_code == 404
    assert (await rb.patch(f"{API}/rider/deliveries/{did}", json={"action": "accept"})).status_code == 404
    assert (await rb.patch(f"{API}/rider/deliveries/{did}",
                           json={"action": "delivered", "code": "123456"})).status_code == 404


async def test_handover_code_locks_after_five_guesses(world):
    ra, did = world["rider_a"], world["delivery_id"]
    await ra.patch(f"{API}/rider/deliveries/{did}", json={"action": "accept"})
    await ra.patch(f"{API}/rider/deliveries/{did}", json={"action": "picked_up"})
    real = (await world["buyer_a"].get(f"{API}/orders/{world['order_id']}/tracking")).json()["handover_code"]
    guesses = [f"{n:06d}" for n in range(10) if f"{n:06d}" != real][:5]
    for g in guesses:
        r = await ra.patch(f"{API}/rider/deliveries/{did}", json={"action": "delivered", "code": g})
        assert r.status_code == 422
    r = await ra.patch(f"{API}/rider/deliveries/{did}", json={"action": "delivered", "code": real})
    assert r.status_code == 423


async def test_seller_cannot_buy_own_products(actor, admin):
    s = await open_store(actor, admin)
    p = await add_product(s)
    r = await s.post(
        f"{API}/checkout",
        json={"items": [{"variant_id": p["variants"][0]["id"], "quantity": 1}], "shipping_address": ADDRESS},
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "own_store_item"


async def test_review_requires_purchase(actor, admin):
    s = await open_store(actor, admin)
    p = await add_product(s)
    r = await actor().post(f"{API}/products/{p['slug']}/reviews", json={"rating": 1, "body": "fake"})
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Tampering and input validation
# ---------------------------------------------------------------------------


async def test_client_cannot_send_prices_or_owners(actor, admin):
    s = await open_store(actor, admin)
    p = await add_product(s, price=5000)
    vid = p["variants"][0]["id"]
    buyer = actor()
    r = await buyer.post(
        f"{API}/checkout",
        json={"items": [{"variant_id": vid, "quantity": 1, "price_cents": 1}], "shipping_address": ADDRESS},
    )
    assert r.status_code == 422
    r = await buyer.post(f"{API}/checkout", json={"items": [{"variant_id": vid, "quantity": 1}],
                                                  "shipping_address": ADDRESS, "total_cents": 1})
    assert r.status_code == 422
    r = await s.post(f"{API}/seller/products", json={
        "title": "x" * 5, "store_id": str(uuid.uuid4()), "variants": [{"sku": "A1", "price_cents": 1}]})
    assert r.status_code == 422
    r = await s.patch(f"{API}/seller/me", json={"status": "active", "plan_id": str(uuid.uuid4())})
    assert r.status_code == 422


@pytest.mark.parametrize(
    "patch",
    [
        {"logo_url": "javascript:alert(1)"},
        {"logo_url": "http://insecure.example.com/x.png"},
        {"logo_url": "https://ok.example.com/\"><script>"},
        {"banner_color": "red"},
        {"banner_color": "#12345"},
        {"accent_color": "#12345g"},
        {"pickup": {"lat": 91, "lng": 0}},
    ],
)
async def test_store_profile_validation(actor, admin, patch):
    s = await open_store(actor, admin)
    r = await s.patch(f"{API}/seller/me", json=patch)
    assert r.status_code == 422


async def test_negative_and_huge_quantities(actor, admin):
    s = await open_store(actor, admin)
    p = await add_product(s)
    b = actor()
    for q in (0, -1, 1000, "1; drop table orders"):
        r = await b.post(f"{API}/cart/items", json={"variant_id": p["variants"][0]["id"], "quantity": q})
        assert r.status_code == 422


@pytest.mark.parametrize("q", ["' or 1=1 --", "%", "_", "\\", "a'; drop table products; --", "ü" * 100])
async def test_search_input_is_harmless(client, q):
    r = await client.get(f"{API}/products", params={"q": q})
    assert r.status_code == 200
    r = await client.get(f"{API}/search/suggest", params={"q": q[:80]})
    assert r.status_code == 200


async def test_sort_is_whitelisted(client):
    r = await client.get(f"{API}/products", params={"sort": "price_asc; drop table products"})
    assert r.status_code == 422


async def test_deep_paging_capped(client):
    r = await client.get(f"{API}/products", params={"page": 1001})
    assert r.status_code == 422


async def test_body_size_limit(actor):
    a = actor()
    r = await a.client.post(f"{API}/me/addresses", headers={**a.headers, "Content-Type": "application/json"},
                             content=b"{" + b" " * 300_000 + b"}")
    assert r.status_code == 413


async def test_errors_do_not_leak_internals(client):
    r = await client.get(f"{API}/orders/not-a-uuid")
    body = r.text
    assert "Traceback" not in body and "asyncpg" not in body and "SELECT" not in body.upper()


# ---------------------------------------------------------------------------
# HTTP hygiene
# ---------------------------------------------------------------------------


async def test_security_headers(client):
    r = await client.get(f"{API}/plans")
    h = r.headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert "default-src 'none'" in h["content-security-policy"]
    assert h["referrer-policy"] == "no-referrer"
    assert "server" not in h


async def test_personal_responses_not_cached(actor):
    a = actor()
    r = await a.get(f"{API}/me")
    assert "no-store" in r.headers["cache-control"]


async def test_cors_allowlist(client):
    ok = await client.options(f"{API}/plans", headers={"Origin": "https://shop.example.com",
                                                        "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "https://shop.example.com"
    assert "access-control-allow-credentials" not in ok.headers
    bad = await client.options(f"{API}/plans", headers={"Origin": "https://evil.example.net",
                                                         "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers


async def test_stripe_webhook_closed_when_not_configured(client):
    r = await client.post(f"{API}/webhooks/stripe", content=b"{}", headers={"Stripe-Signature": "t=1,v1=x"})
    assert r.status_code == 404


async def test_sensitive_rate_limit(app, actor):
    from app.config import Settings, get_settings

    tight = Settings(**{**get_settings().model_dump(), "rate_limit_sensitive": 3})
    app.dependency_overrides[get_settings] = lambda: tight
    try:
        a = actor()
        codes = []
        for _ in range(5):
            r = await a.post(f"{API}/rider/applications",
                             json={"full_name": "Spam", "phone": "+10000000", "city": "X", "vehicle": "car"})
            codes.append(r.status_code)
        assert codes[-1] == 429
    finally:
        app.dependency_overrides.clear()


async def test_maintenance_mode_blocks_writes(admin, actor, app):
    r = await admin.patch(f"{API}/admin/settings", json={"maintenance_mode": True, "maintenance_message": "Back soon"})
    assert r.status_code == 200
    mw = _find_middleware(app)
    mw._cached = (0.0, False)  # skip the 5 second cache
    try:
        a = actor()
        r = await a.post(f"{API}/me/addresses", json=ADDRESS)
        assert r.status_code == 503
        assert (await a.get(f"{API}/plans")).status_code == 200
    finally:
        await admin.patch(f"{API}/admin/settings", json={"maintenance_mode": False})
        mw._cached = (0.0, False)


def _find_middleware(app):
    from app.main import MaintenanceMode

    node = app.middleware_stack
    while node is not None:
        if isinstance(node, MaintenanceMode):
            return node
        node = getattr(node, "app", None)
    raise AssertionError("maintenance middleware not found")


# ---------------------------------------------------------------------------
# The database itself, as Supabase's public roles would see it
# ---------------------------------------------------------------------------


async def _as(db: asyncpg.Connection, role: str, sub: str | None, sql: str, *args):
    async with db.transaction():
        await db.execute(f"set local role {role}")
        if sub:
            await db.execute("select set_config('request.jwt.claim.sub', $1, true)", sub)
        return await db.fetch(sql, *args)


async def test_anon_cannot_call_functions(db):
    for sql in (
        "select place_order(gen_random_uuid(), '{}'::jsonb)",
        "select mark_order_paid(gen_random_uuid(), 'x', null)",
        "select mark_store_order_paid(gen_random_uuid(), 'store')",
        "select cancel_order(gen_random_uuid())",
        "select bill_rent()",
    ):
        for role in ("anon", "authenticated"):
            with pytest.raises(asyncpg.InsufficientPrivilegeError):
                await _as(db, role, None, sql)


async def test_anon_cannot_write_or_read_private_tables(db, world):
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        await _as(db, "anon", None, "insert into store_plans (code, name, commission_rate) values ('x', 'x', 0)")
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        await _as(db, "authenticated", None, "update products set title = 'pwned'")
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        await _as(db, "anon", None, "select * from store_balances")
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        await _as(db, "anon", None, "select application from stores")
    for table in ("orders", "profiles", "riders", "deliveries", "rider_locations", "payouts", "addresses"):
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await _as(db, "anon", None, f"select * from {table}")


async def test_authenticated_sees_only_own_orders(db, world):
    mine = await _as(db, "authenticated", str(world["buyer_a"].id), "select id from orders")
    theirs = await _as(db, "authenticated", str(world["buyer_b"].id), "select id from orders")
    assert [str(r["id"]) for r in mine] == [world["order_id"]]
    assert theirs == []
    # Delivery data is API only, even for the people involved.
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        await _as(db, "authenticated", str(world["rider_a"].id), "select * from deliveries")


async def test_public_catalogue_visible_to_anon(db, world):
    rows = await _as(db, "anon", None, "select id from products where id = $1", uuid.UUID(world["product_a"]["id"]))
    assert len(rows) == 1


async def test_every_table_has_rls(db):
    rows = await db.fetch(
        """select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity"""
    )
    assert [r["relname"] for r in rows] == []
