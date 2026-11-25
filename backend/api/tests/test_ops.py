"""Rider hiring, one login for every role, vendor images and stock, live
events, nearest-rider dispatch and who may see which rider."""

import asyncio
import io
import json
import uuid

import asyncpg
import pytest
from PIL import Image

from app import storage
from app.auth import User
from app.config import get_settings
from app.dispatch import sweep


async def run_sweep(app):
    async with app.state.pool.acquire() as conn:
        return await sweep(conn, get_settings())
from app.realtime import Hub, can_watch, personal_topics

import jwt as pyjwt
from conftest import (ADDRESS, API, JWT_SECRET, Actor, add_product, hire_rider, make_token, open_store,
                      till_message)

# Far from the Accra fixtures the other tests use, so riders they leave on
# shift are never the closest to these shops.
SHOP = {"lat": 41.9028, "lng": 12.4964, "label": "Via del Corso"}
BUYER_AT = {**ADDRESS, "city": "Rome", "country": "IT", "lat": 41.89, "lng": 12.49}


def rider_signup(client, name="Rita Rider") -> Actor:
    a = Actor(client, name)
    a.headers = {"Authorization": "Bearer " + make_token(
        a.id, a.email, user_metadata={"full_name": name, "requested_role": "rider"})}
    return a


APPLICATION = {"full_name": "Rita Rossi", "phone": "+39 333 123 4567", "city": "Rome", "vehicle": "motorbike"}


# ---------------------------------------------------------------------------
# Sign-up, one login page, hiring
# ---------------------------------------------------------------------------


async def test_rider_signup_is_locked_until_hired(client, admin):
    rita = rider_signup(client)
    me = (await rita.get(f"{API}/me")).json()
    assert me["role"] == "rider_applicant" and me["home"] == "/rider/apply" and me["rider_status"] is None

    # Nothing but the hiring form until an admin says yes.
    for url in ("/cart", "/orders", "/wishlist", "/me/addresses", "/rider/deliveries"):
        r = await rita.get(f"{API}{url}")
        assert r.status_code == 403 and r.json()["error"]["code"] == "rider_not_hired", url
    r = await rita.post(f"{API}/seller/applications", json={
        "store_name": "Sneaky", "country": "IT", "support_email": "a@example.com", "plan_code": "starter"})
    assert r.status_code == 403

    r = await rita.get(f"{API}/rider/me")
    assert r.status_code == 404 and r.json()["error"]["code"] == "no_application"
    r = await rita.post(f"{API}/rider/applications", json=APPLICATION)
    assert r.status_code == 201 and r.json()["status"] == "applicant"
    assert (await rita.get(f"{API}/me")).json()["rider_status"] == "applicant"

    queue = (await admin.get(f"{API}/admin/rider-applications?page_size=100")).json()["items"]
    assert any(x["id"] == str(rita.id) for x in queue)
    assert (await admin.get(f"{API}/admin/stats")).json()["pending_riders"] >= 1

    r = await admin.post(f"{API}/admin/rider-applications/{rita.id}/approve", json={"note": "Welcome"})
    assert r.status_code == 200 and r.json()["status"] == "active"
    me = (await rita.get(f"{API}/me")).json()
    assert me["role"] == "rider" and me["home"] == "/rider"
    assert (await rita.get(f"{API}/rider/deliveries")).status_code == 200
    assert (await rita.get(f"{API}/cart")).status_code == 200

    # Let go: back to waiting, not to shopping.
    r = await admin.patch(f"{API}/admin/riders/{rita.id}", json={"status": "suspended"})
    assert r.status_code == 200
    me = (await rita.get(f"{API}/me")).json()
    assert me["role"] == "rider_applicant" and me["rider_status"] == "suspended"
    assert (await rita.get(f"{API}/cart")).status_code == 403


async def test_rejected_rider_stays_out_and_shopper_applicant_keeps_shopping(client, actor, admin):
    rita = rider_signup(client)
    await rita.post(f"{API}/rider/applications", json=APPLICATION)
    r = await admin.post(f"{API}/admin/rider-applications/{rita.id}/reject", json={"note": "No licence"})
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    me = (await rita.get(f"{API}/me")).json()
    assert me["role"] == "rider_applicant" and me["rider_status"] == "rejected"
    assert (await rita.get(f"{API}/rider/me")).json()["review_note"] == "No licence"

    shopper = actor()
    await shopper.post(f"{API}/rider/applications", json=APPLICATION)
    me = (await shopper.get(f"{API}/me")).json()
    assert me["role"] == "customer" and me["rider_status"] == "applicant"
    assert (await shopper.get(f"{API}/cart")).status_code == 200


async def test_only_admins_decide_applications(client, actor):
    rita = rider_signup(client)
    await rita.post(f"{API}/rider/applications", json=APPLICATION)
    for who in (actor(), rita):
        r = await who.post(f"{API}/admin/rider-applications/{rita.id}/approve", json={})
        assert r.status_code == 403


async def test_signup_metadata_cannot_grant_roles(client):
    for asked in ("admin", "vendor", "seller", "rider_applicant"):
        a = Actor(client)
        a.headers = {"Authorization": "Bearer " + make_token(a.id, a.email, user_metadata={"requested_role": asked})}
        me = (await a.get(f"{API}/me")).json()
        assert me["role"] == "customer", asked


async def test_email_is_the_login(client):
    """Phone-number sign-ins (if someone turns phone auth on in Supabase)
    are refused: accounts are email accounts."""
    uid = uuid.uuid4()
    base = pyjwt.decode(make_token(uid), JWT_SECRET, algorithms=["HS256"], audience="authenticated")
    for email in (None, "", "+233201234567", "x" * 300 + "@example.com"):
        claims = {**base, "phone": "+233201234567"}
        if email is None:
            claims.pop("email")
        else:
            claims["email"] = email
        token = pyjwt.encode(claims, JWT_SECRET, algorithm="HS256")
        r = await client.get(f"{API}/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 403 and r.json()["error"]["code"] == "email_required", email


async def test_me_routes_every_role(actor, admin):
    seller = await open_store(actor, admin)
    assert (await seller.get(f"{API}/me")).json()["home"] == "/seller"
    assert (await admin.get(f"{API}/me")).json()["home"] == "/admin"
    assert (await actor().get(f"{API}/me")).json()["home"] == "/"


# ---------------------------------------------------------------------------
# Vendor images
# ---------------------------------------------------------------------------


class FakeStorage:
    def __init__(self):
        self.objects: dict[str, bytes] = {}
        self.deleted: list[str] = []

    async def put(self, settings, path, data, content_type, bucket=None):
        assert content_type in ("image/webp", "video/mp4", "video/webm")
        self.objects[f"{bucket}:{path}" if bucket else path] = data

    async def delete(self, settings, paths, bucket=None):
        self.deleted.extend(f"{bucket}:{p}" if bucket else p for p in paths)


@pytest.fixture
def fake_storage(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "storage_url", "https://storage.test")
    monkeypatch.setattr(settings, "supabase_service_role_key", "service-key")
    fake = FakeStorage()
    monkeypatch.setattr(storage, "put_object", fake.put)
    monkeypatch.setattr(storage, "delete_objects", fake.delete)
    return fake


def png(size=(64, 48), color=(200, 40, 40), gps=False) -> bytes:
    img = Image.new("RGB", size, color)
    out = io.BytesIO()
    if gps:
        exif = Image.Exif()
        exif[0x8825] = {1: "N", 2: (5.0, 36.0, 13.0)}  # GPSInfo
        exif[0x010F] = "PhoneMaker"
        img.save(out, format="JPEG", exif=exif.tobytes())
    else:
        img.save(out, format="PNG")
    return out.getvalue()


def upload(data: bytes, name="photo.png", ctype="image/png"):
    return {"file": (name, data, ctype)}


async def test_vendor_manages_product_images(actor, admin, fake_storage):
    seller = await open_store(actor, admin)
    product = await add_product(seller, images=[])
    pid = product["id"]
    base = f"https://storage.test/storage/v1/object/public/product-images/stores/{seller.store_id}/"

    r = await seller.post(f"{API}/seller/products/{pid}/images", files=upload(png(gps=True), "p.jpg", "image/jpeg"),
                          data={"alt": "Front"})
    assert r.status_code == 201, r.text
    first = r.json()["images"][0]
    assert first["url"].startswith(base) and first["url"].endswith(".webp") and first["alt"] == "Front"
    stored = fake_storage.objects[first["url"][len(base) - len(f"stores/{seller.store_id}/"):].split("product-images/")[-1]]
    assert stored[:4] == b"RIFF" and stored[8:12] == b"WEBP"
    with Image.open(io.BytesIO(stored)) as im:
        assert not im.getexif().get(0x8825) and b"PhoneMaker" not in stored

    big = png(size=(5000, 3000))
    r = await seller.post(f"{API}/seller/products/{pid}/images", files=upload(big))
    assert r.status_code == 201
    second = r.json()["images"][1]
    path2 = "stores/" + second["url"].split("/stores/")[1]
    with Image.open(io.BytesIO(fake_storage.objects[path2])) as im:
        assert max(im.size) == 2000

    # Replace keeps the position and removes the old file.
    r = await seller.client.put(f"{API}/seller/products/{pid}/images/{first['id']}", headers=seller.headers,
                                files=upload(png(color=(0, 0, 255))))
    assert r.status_code == 200
    replaced = r.json()["images"][0]
    assert replaced["id"] == first["id"] and replaced["url"] != first["url"] and replaced["alt"] == "Front"
    assert "stores/" + first["url"].split("/stores/")[1] in fake_storage.deleted

    r = await seller.client.put(f"{API}/seller/products/{pid}/image-order", headers=seller.headers,
                                json={"image_ids": [second["id"], first["id"]]})
    assert [i["id"] for i in r.json()["images"]] == [second["id"], first["id"]]
    r = await seller.client.put(f"{API}/seller/products/{pid}/image-order", headers=seller.headers,
                                json={"image_ids": [second["id"]]})
    assert r.status_code == 422

    r = await seller.patch(f"{API}/seller/products/{pid}/images/{second['id']}", json={"alt": "Side"})
    assert r.json()["images"][0]["alt"] == "Side"

    r = await seller.delete(f"{API}/seller/products/{pid}/images/{second['id']}")
    assert r.status_code == 200 and [i["id"] for i in r.json()["images"]] == [first["id"]]
    assert path2 in fake_storage.deleted

    # The public product page shows the new picture.
    public = (await seller.client.get(f"{API}/products/{product['slug']}")).json()
    assert public["images"][0]["url"] == replaced["url"]


async def test_image_uploads_are_checked(actor, admin, fake_storage, monkeypatch):
    seller = await open_store(actor, admin)
    other = await open_store(actor, admin)
    pid = (await add_product(seller, images=[]))["id"]
    other_pid = (await add_product(other, images=[]))["id"]

    bad = [
        (b"<html><script>alert(1)</script></html>", "x.png", "image/png"),
        (b"GIF89a" + b"\x00" * 50, "x.gif", "image/gif"),
        (b"%PDF-1.7\n", "x.jpg", "image/jpeg"),
        (b"\x89PNG\r\n\x1a\n" + b"\x00" * 40, "broken.png", "image/png"),
    ]
    for data, name, ctype in bad:
        r = await seller.post(f"{API}/seller/products/{pid}/images", files=upload(data, name, ctype))
        assert r.status_code == 415, (name, r.text)
    r = await seller.post(f"{API}/seller/products/{pid}/images", files=upload(b"", "empty.png"))
    assert r.status_code == 422

    monkeypatch.setattr(get_settings(), "max_image_bytes", 2000)
    r = await seller.post(f"{API}/seller/products/{pid}/images", files=upload(png(size=(400, 400), color=(1, 2, 3))
                                                                              + b"\x00" * 3000))
    assert r.status_code == 413
    monkeypatch.setattr(get_settings(), "max_image_bytes", 8_000_000)

    # Another store's product, and a stranger.
    r = await seller.post(f"{API}/seller/products/{other_pid}/images", files=upload(png()))
    assert r.status_code == 404
    r = await actor().post(f"{API}/seller/products/{pid}/images", files=upload(png()))
    assert r.status_code == 403
    assert not fake_storage.objects

    # Twelve pictures at most.
    for _ in range(12):
        assert (await seller.post(f"{API}/seller/products/{pid}/images", files=upload(png()))).status_code == 201
    r = await seller.post(f"{API}/seller/products/{pid}/images", files=upload(png()))
    assert r.status_code == 409 and r.json()["error"]["code"] == "too_many_images"

    # Image URLs saved with the product must be this store's uploads.
    theirs = f"https://storage.test/storage/v1/object/public/product-images/stores/{other.store_id}/a.webp"
    for url in ("https://evil.example.net/track.gif", theirs,
                f"https://storage.test/storage/v1/object/public/product-images/stores/{seller.store_id}/../x.webp"):
        r = await seller.patch(f"{API}/seller/products/{pid}", json={"images": [{"url": url}]})
        assert r.status_code == 422 and r.json()["error"]["code"] == "image_not_allowed", url
    mine = f"https://storage.test/storage/v1/object/public/product-images/stores/{seller.store_id}/a.webp"
    r = await seller.patch(f"{API}/seller/products/{pid}", json={"images": [{"url": mine}]})
    assert r.status_code == 200
    # The twelve files the product no longer uses are cleaned up.
    assert len([p for p in fake_storage.deleted if p.startswith(f"stores/{seller.store_id}/")]) == 12


async def test_blocked_product_images_are_frozen(actor, admin, fake_storage):
    seller = await open_store(actor, admin)
    pid = (await add_product(seller))["id"]
    await admin.patch(f"{API}/admin/products/{pid}", json={"status": "blocked"})
    r = await seller.post(f"{API}/seller/products/{pid}/images", files=upload(png()))
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Stock
# ---------------------------------------------------------------------------


async def test_bulk_inventory_update(actor, admin):
    seller = await open_store(actor, admin)
    a = (await add_product(seller, stock=10))["variants"][0]
    b = (await add_product(seller, stock=4, title="Wax print shirt"))["variants"][0]
    other = await open_store(actor, admin)
    theirs = (await add_product(other))["variants"][0]

    r = await seller.patch(f"{API}/seller/inventory", json={"items": [
        {"variant_id": a["id"], "stock": 25, "reason": "Delivery from the tailor"},
        {"variant_id": b["id"], "adjust_by": -1, "reason": "Damaged"},
    ]})
    assert r.status_code == 200, r.text
    got = {i["variant_id"]: i for i in r.json()["items"]}
    assert got[a["id"]]["stock_before"] == 10 and got[a["id"]]["stock"] == 25
    assert got[b["id"]]["stock"] == 3

    # All or nothing.
    r = await seller.patch(f"{API}/seller/inventory", json={"items": [
        {"variant_id": a["id"], "stock": 1}, {"variant_id": b["id"], "adjust_by": -50}]})
    assert r.status_code == 409 and r.json()["error"]["code"] == "stock_negative"
    r = await seller.patch(f"{API}/seller/inventory", json={"items": [
        {"variant_id": a["id"], "stock": 1}, {"variant_id": theirs["id"], "stock": 0}]})
    assert r.status_code == 404
    rows = (await seller.get(f"{API}/seller/inventory?q={a['sku']}")).json()["items"]
    assert rows[0]["stock"] == 25
    assert (await other.get(f"{API}/seller/products/{(await other.get(f'{API}/seller/products')).json()['items'][0]['id']}")
            ).json()["variants"][0]["stock"] == 10

    for body in ({"items": []},
                 {"items": [{"variant_id": a["id"]}]},
                 {"items": [{"variant_id": a["id"], "stock": 1, "adjust_by": 1}]},
                 {"items": [{"variant_id": a["id"], "adjust_by": 0}]},
                 {"items": [{"variant_id": a["id"], "stock": -1}]},
                 {"items": [{"variant_id": a["id"], "stock": 1}, {"variant_id": a["id"], "stock": 2}]},
                 {"items": [{"variant_id": a["id"], "stock": 1, "store_id": str(uuid.uuid4())}]}):
        assert (await seller.patch(f"{API}/seller/inventory", json=body)).status_code == 422, body

    # Single variant edits land in the history too.
    await seller.patch(f"{API}/seller/variants/{a['id']}", json={"stock": 30})
    hist = (await seller.get(f"{API}/seller/inventory/history?variant_id={a['id']}")).json()["items"]
    assert [(h["stock_before"], h["stock_after"]) for h in hist] == [(25, 30), (10, 25)]
    assert hist[1]["reason"] == "Delivery from the tailor" and hist[1]["by"] == "Sam Seller"
    assert (await other.get(f"{API}/seller/inventory/history?variant_id={a['id']}")).json()["items"] == []


# ---------------------------------------------------------------------------
# Live events
# ---------------------------------------------------------------------------


class Listener:
    def __init__(self, dsn):
        self.dsn = dsn
        self.events: list[dict] = []

    async def __aenter__(self):
        self.conn = await asyncpg.connect(self.dsn)
        await self.conn.add_listener("live_events", lambda *a: self.events.append(json.loads(a[3])))
        return self

    async def __aexit__(self, *exc):
        await self.conn.close()

    async def settle(self):
        await asyncio.sleep(0.2)

    def of(self, type_):
        return [e for e in self.events if e["event"]["type"] == type_]


async def test_changes_announce_themselves_to_the_right_people(database, client, actor, admin, monkeypatch):
    monkeypatch.setattr(get_settings(), "auto_dispatch", True)
    async with Listener(database) as live:
        rita = rider_signup(client)
        await rita.post(f"{API}/rider/applications", json=APPLICATION)
        await live.settle()
        app_ev = live.of("application")[-1]
        assert set(app_ev["to"]) == {f"user:{rita.id}", "ops"} and app_ev["event"]["status"] == "applicant"

        seller = await open_store(actor, admin)
        await seller.patch(f"{API}/seller/me", json={"pickup": SHOP})
        product = await add_product(seller, stock=5)
        rider = await hire_rider(actor, admin, lat=41.905, lng=12.50)
        buyer = actor()
        live.events.clear()
        r = await buyer.post(f"{API}/checkout", json={
            "items": [{"variant_id": product["variants"][0]["id"], "quantity": 1}],
            "shipping_address": BUYER_AT, "payment_method": "cod"})
        assert r.status_code == 201
        await live.settle()

        order_ev = live.of("order")[0]
        assert f"user:{buyer.id}" in order_ev["to"] and f"store:{seller.store_id}" in order_ev["to"]
        stock_ev = live.of("stock")[0]
        assert stock_ev["to"] == [f"store:{seller.store_id}"] and stock_ev["event"]["stock"] == 4
        job = live.of("job")[0]
        assert set(job["to"]) == {f"rider:{rider.id}", f"store:{seller.store_id}", f"user:{buyer.id}", "ops"}
        status = live.of("status")[0]
        assert status["to"] == [f"delivery:{job['event']['delivery_id']}", "admin"]
        # Nobody else's topics, and nothing from a sale on the public feed.
        everyone = {t for e in live.events for t in e["to"]}
        assert not any(t.startswith("user:") and t != f"user:{buyer.id}" for t in everyone)
        assert "catalog" not in everyone

        live.events.clear()
        await seller.patch(f"{API}/seller/products/{product['id']}", json={"title": "Linen dress, sand"})
        draft = await add_product(seller, status="draft", title="Secret drop")
        await seller.patch(f"{API}/seller/products/{draft['id']}", json={"title": "Still secret"})
        await live.settle()
        cat = live.of("catalog")
        assert [c["event"]["product_id"] for c in cat] == [product["id"]]


async def test_hub_routes_each_event_once_to_its_topics():
    hub = Hub()
    mine, theirs = asyncio.Queue(), asyncio.Queue()
    hub.subscribe("user:a", mine)
    hub.subscribe("catalog", mine)
    hub.subscribe("user:b", theirs)
    hub._on_notify(None, 0, "live_events", json.dumps({"to": ["user:a", "catalog"], "event": {"type": "x"}}))
    hub._on_notify(None, 0, "live_events", "not json")
    hub._on_notify(None, 0, "live_events", json.dumps({"to": "user:b", "event": {}}))
    assert mine.qsize() == 1 and theirs.qsize() == 0
    hub.unsubscribe_all(mine)
    hub._on_notify(None, 0, "live_events", json.dumps({"to": ["user:a"], "event": {"type": "y"}}))
    assert mine.qsize() == 1


async def test_who_may_follow_a_rider(db, client, actor, admin, monkeypatch):
    monkeypatch.setattr(get_settings(), "auto_dispatch", True)
    seller = await open_store(actor, admin)
    await seller.patch(f"{API}/seller/me", json={"pickup": SHOP})
    product = await add_product(seller)
    rider = await hire_rider(actor, admin, lat=41.906, lng=12.497)
    buyer = actor()
    r = await buyer.post(f"{API}/checkout", json={
        "items": [{"variant_id": product["variants"][0]["id"], "quantity": 1}], "shipping_address": BUYER_AT})
    order_id = r.json()["order_id"]
    did = (await db.fetchval(
        "select d.id from deliveries d join store_orders so on so.id = d.store_order_id where so.order_id = $1",
        uuid.UUID(order_id)))
    assert did is not None

    other_store = await open_store(actor, admin)
    stranger, other_rider = actor(), await hire_rider(actor, admin, lat=41.0, lng=12.0)
    for who, ok in ((buyer, True), (seller, True), (rider, True), (stranger, False), (other_store, False),
                    (other_rider, False)):
        assert await can_watch(db, who.id, "", did) is ok

    def user(a, role):
        return User(id=a.id, email=a.email, role=role, aal="aal1")

    assert set(await personal_topics(db, user(seller, "seller"))) == {f"user:{seller.id}", "catalog",
                                                                      f"store:{seller.store_id}"}
    assert set(await personal_topics(db, user(rider, "rider"))) == {f"user:{rider.id}", "catalog", f"rider:{rider.id}",
                                                                    "riders"}
    assert "ops" in await personal_topics(db, user(admin, "admin"))
    applicant = rider_signup(client)
    await applicant.get(f"{API}/me")
    assert set(await personal_topics(db, user(applicant, "rider_applicant"))) == {f"user:{applicant.id}", "catalog"}

    # The buyer sees the rider only once they've accepted, and only on their order.
    t = (await buyer.get(f"{API}/orders/{order_id}/tracking")).json()
    assert t["rider_position"] is None
    await rider.patch(f"{API}/rider/deliveries/{did}", json={"action": "accept"})
    await rider.post(f"{API}/rider/location", json={"lat": 41.904, "lng": 12.498, "heading": 90, "speed_mps": 5})
    t = (await buyer.get(f"{API}/orders/{order_id}/tracking")).json()
    assert t["rider_position"]["lat"] == 41.904 and t["rider_position"]["heading"] == 90
    assert (await stranger.get(f"{API}/orders/{order_id}/tracking")).status_code == 404

    # Moving the drop-off pin reaches the live delivery, for the buyer only.
    r = await buyer.client.put(f"{API}/orders/{order_id}/dropoff", headers=buyer.headers,
                               json={"lat": 41.888, "lng": 12.489, "note": "Blue gate"})
    assert r.status_code == 200 and r.json()["dropoff"]["lat"] == 41.888
    job = (await rider.get(f"{API}/rider/deliveries/{did}")).json()
    assert job["dropoff"]["lat"] == 41.888
    r = await stranger.client.put(f"{API}/orders/{order_id}/dropoff", headers=stranger.headers,
                                  json={"lat": 1, "lng": 1})
    assert r.status_code == 404
    r = await buyer.client.put(f"{API}/orders/{order_id}/dropoff", headers=buyer.headers,
                               json={"lat": 91, "lng": 1})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Nearest rider
# ---------------------------------------------------------------------------


async def _shop_with_product(actor, admin, pickup=SHOP):
    seller = await open_store(actor, admin)
    r = await seller.patch(f"{API}/seller/me", json={"pickup": pickup})
    assert r.status_code == 200
    product = await add_product(seller, stock=50)
    return seller, product["variants"][0]["id"]


async def _buy(buyer, variant_id, payment="cod"):
    r = await buyer.post(f"{API}/checkout", json={
        "items": [{"variant_id": variant_id, "quantity": 1}], "shipping_address": BUYER_AT, "payment_method": payment})
    assert r.status_code == 201, r.text
    return r.json()["order_id"]


async def _rider_on(db, order_id):
    return await db.fetchrow(
        """select d.id, d.rider_id, d.status from deliveries d join store_orders so on so.id = d.store_order_id
            where so.order_id = $1 and d.status in ('assigned', 'accepted', 'picked_up')""",
        uuid.UUID(order_id))


# Each nearest-rider test gets its own patch of map, so riders left on shift
# by one test are never the closest to another test's shop.
def area(n):
    return {"lat": 40.0 + n * 0.5, "lng": 10.0 + n * 0.5, "label": f"Shop {n}"}


def near(p, km):
    return {"lat": p["lat"] + km / 111.0, "lng": p["lng"]}


async def test_orders_go_to_the_closest_free_rider(app, db, actor, admin, monkeypatch):
    monkeypatch.setattr(get_settings(), "auto_dispatch", True)
    shop = area(1)
    seller, vid = await _shop_with_product(actor, admin, shop)
    far = await hire_rider(actor, admin, **near(shop, 6))
    close = await hire_rider(actor, admin, **near(shop, 1))
    middle = await hire_rider(actor, admin, **near(shop, 3))
    await hire_rider(actor, admin, **near(shop, 40))  # outside the radius

    order = await _buy(actor(), vid)
    d = await _rider_on(db, order)
    assert d["rider_id"] == close.id and d["status"] == "assigned"

    # A decline passes it straight to the next closest, never back.
    r = await close.patch(f"{API}/rider/deliveries/{d['id']}", json={"action": "decline"})
    assert r.status_code == 200
    d = await _rider_on(db, order)
    assert d["rider_id"] == middle.id

    # No answer in time: the worker passes it on.
    monkeypatch.setattr(get_settings(), "dispatch_accept_seconds", 0)
    await asyncio.sleep(0.01)
    timed_out, _ = await run_sweep(app)
    assert timed_out >= 1
    d = await _rider_on(db, order)
    assert d["rider_id"] == far.id
    monkeypatch.setattr(get_settings(), "dispatch_accept_seconds", 120)
    await far.patch(f"{API}/rider/deliveries/{d['id']}", json={"action": "decline"})
    assert await _rider_on(db, order) is None  # everyone in range said no; it waits

    # One offer at a time: with an offer waiting, a rider gets no second one.
    o1 = await _buy(actor(), vid)
    d1 = await _rider_on(db, o1)
    assert d1["rider_id"] == close.id
    o2 = await _buy(actor(), vid)
    assert (await _rider_on(db, o2))["rider_id"] == middle.id
    r = await close.patch(f"{API}/rider/deliveries/{d1['id']}", json={"action": "accept"})
    assert r.status_code == 200, r.text

    # Idle riders come first; a rider on a run only gets jobs that batch
    # with it (same shop, same part of town).
    o3 = await _buy(actor(), vid)
    d3 = await _rider_on(db, o3)
    assert d3["rider_id"] == far.id
    await far.patch(f"{API}/rider/deliveries/{d3['id']}", json={"action": "decline"})
    d3 = await _rider_on(db, o3)
    assert d3["rider_id"] == close.id


async def test_orders_wait_for_a_rider_and_transfers_wait_for_payment(app, db, actor, admin, monkeypatch):
    monkeypatch.setattr(get_settings(), "auto_dispatch", True)
    shop = area(2)
    seller, vid = await _shop_with_product(actor, admin, shop)

    cod = await _buy(actor(), vid)
    assert await _rider_on(db, cod) is None
    so_id = await db.fetchval("select id from store_orders where order_id = $1", uuid.UUID(cod))
    r = await seller.post(f"{API}/seller/orders/{so_id}/dispatch", json={})
    assert r.status_code == 409 and r.json()["error"]["code"] == "no_riders"

    transfer = await _buy(actor(), vid, payment="bank_transfer")
    rider = await hire_rider(actor, admin, **near(shop, 2))
    await run_sweep(app)
    cod_job = await _rider_on(db, cod)
    assert cod_job["rider_id"] == rider.id
    r = await rider.patch(f"{API}/rider/deliveries/{cod_job['id']}", json={"action": "accept"})
    assert r.status_code == 200, r.text
    assert await _rider_on(db, transfer) is None  # not paid yet

    # The shopper pays the till ahead; once an admin applies the payment
    # the order goes out.
    t_so = await db.fetchval("select id from store_orders where order_id = $1", uuid.UUID(transfer))
    r = await seller.post(f"{API}/seller/orders/{t_so}/confirm-payment")
    assert r.status_code == 403
    total = await db.fetchval("select total_cents from orders where id = $1", uuid.UUID(transfer))
    number = await db.fetchval("select number from orders where id = $1", uuid.UUID(transfer))
    code = await till_message(admin, total, number)
    receipt = await db.fetchval("select id from payment_receipts where code = $1", code)
    r = await admin.patch(f"{API}/admin/payments/{receipt}", json={"order_number": number})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "confirmed" and r.json()["order_number"] == number
    assert (await _rider_on(db, transfer))["rider_id"] == rider.id  # batched onto the same run


async def test_store_can_take_over_dispatch(app, db, actor, admin, monkeypatch):
    monkeypatch.setattr(get_settings(), "auto_dispatch", True)
    shop = area(3)
    seller, vid = await _shop_with_product(actor, admin, shop)
    first = await hire_rider(actor, admin, **near(shop, 1))
    second = await hire_rider(actor, admin, **near(shop, 2))
    order = await _buy(actor(), vid)
    d = await _rider_on(db, order)
    assert d["rider_id"] == first.id

    r = await seller.post(f"{API}/seller/deliveries/{d['id']}/cancel")
    assert r.status_code == 200
    await run_sweep(app)
    assert await _rider_on(db, order) is None  # the store took over

    so_id = await db.fetchval("select id from store_orders where order_id = $1", uuid.UUID(order))
    r = await seller.post(f"{API}/seller/orders/{so_id}/dispatch", json={"rider_id": str(second.id)})
    assert r.status_code == 201
    assert (await _rider_on(db, order))["rider_id"] == second.id

    # Another store can't dispatch this order, with or without a rider.
    other, _ = await _shop_with_product(actor, admin, shop)
    for body in ({}, {"rider_id": str(first.id)}):
        assert (await other.post(f"{API}/seller/orders/{so_id}/dispatch", json=body)).status_code == 404


async def test_auto_dispatch_can_be_switched_off(app, db, actor, admin):
    shop = area(4)
    seller, vid = await _shop_with_product(actor, admin, shop)
    await hire_rider(actor, admin, **near(shop, 1))
    order = await _buy(actor(), vid)
    assert await _rider_on(db, order) is None  # AUTO_DISPATCH=false in the test settings
    assert await run_sweep(app) == (0, 0)


# ---------------------------------------------------------------------------
# Rider lists
# ---------------------------------------------------------------------------


async def test_vendor_rider_list_shows_only_what_it_should(db, actor, admin, monkeypatch):
    monkeypatch.setattr(get_settings(), "auto_dispatch", True)
    shop = area(5)
    seller, vid = await _shop_with_product(actor, admin, shop)
    worker = await hire_rider(actor, admin, **near(shop, 1))
    nearby = await hire_rider(actor, admin, **near(shop, 2))
    faraway = await hire_rider(actor, admin, **near(shop, 60))
    order = await _buy(actor(), vid)
    d = await _rider_on(db, order)
    assert d["rider_id"] == worker.id

    rows = {r["id"]: r for r in (await seller.get(f"{API}/seller/riders")).json()}
    assert str(faraway.id) not in rows
    w, n = rows[str(worker.id)], rows[str(nearby.id)]
    assert w["relation"] == "on_job" and w["phone"] == "+233 20 123 4567" and w["jobs"][0]["status"] == "assigned"
    assert w["lat"] is None  # not until they accept
    assert n["relation"] == "nearby" and n["phone"] is None and n["lat"] is None and n["jobs"] == []
    assert n["name"] == "Kofi" and 1.5 < n["distance_km"] < 2.5

    await worker.patch(f"{API}/rider/deliveries/{d['id']}", json={"action": "accept"})
    w = (await seller.get(f"{API}/seller/riders/{worker.id}")).json()
    assert w["lat"] is not None and w["name"] == "Kofi Mensah"
    assert (await seller.get(f"{API}/seller/riders/{faraway.id}")).status_code == 404

    other, _ = await _shop_with_product(actor, admin, area(6))
    assert (await other.get(f"{API}/seller/riders/{worker.id}")).status_code == 404
    assert str(worker.id) not in {r["id"] for r in (await other.get(f"{API}/seller/riders")).json()}
    assert (await actor().get(f"{API}/seller/riders")).status_code == 403
    assert (await worker.get(f"{API}/seller/riders")).status_code == 403

    detail = (await admin.get(f"{API}/admin/riders/{worker.id}")).json()
    assert detail["phone"] and detail["jobs"][0]["delivery_id"] == str(d["id"]) and "last_heading" in detail
    assert (await seller.get(f"{API}/admin/riders/{worker.id}")).status_code == 403


# ---------------------------------------------------------------------------
# Prices the admin sets, the rental contact, greetings
# ---------------------------------------------------------------------------


async def test_admin_sets_fees_and_checkout_charges_them(client, actor, admin):
    seller = await open_store(actor, admin)
    vid = (await add_product(seller, price=1000))["variants"][0]["id"]
    r = await admin.patch(f"{API}/admin/settings", json={
        "standard_shipping_cents": 777, "express_shipping_cents": 2222, "free_shipping_over_cents": None,
        "tax_rate": 0.1, "rider_fee_cents": 450,
        "contact_name": "Malik at The Bazaar", "contact_email": "stalls@example.com",
        "contact_phone": "+233 20 000 0000", "contact_whatsapp": "+233 20 000 0001",
        "contact_note": "Call for stall prices"})
    assert r.status_code == 200, r.text
    st = (await client.get(f"{API}/status")).json()
    assert st["standard_shipping_cents"] == 777 and st["free_shipping_over_cents"] is None
    assert st["contact_email"] == "stalls@example.com" and st["currency"] == "USD"

    buyer = actor()
    await buyer.post(f"{API}/cart/items", json={"variant_id": vid, "quantity": 9})
    assert (await buyer.get(f"{API}/cart")).json()["shipping_estimate_cents"] == 777  # never free now
    r = await buyer.post(f"{API}/checkout", json={"shipping_address": ADDRESS, "shipping_method": "express"})
    order = (await buyer.get(f"{API}/orders/{r.json()['order_id']}")).json()
    assert order["shipping_cents"] == 2222 and order["tax_cents"] > 0

    for bad in ({"standard_shipping_cents": -1}, {"standard_shipping_cents": None}, {"tax_rate": 2},
                {"contact_email": "not-an-email"}, {"rider_fee_cents": "free"}, {"currency": "EUR"}):
        assert (await admin.patch(f"{API}/admin/settings", json=bad)).status_code == 422, bad
    for who in (actor(), seller):
        assert (await who.patch(f"{API}/admin/settings", json={"standard_shipping_cents": 0})).status_code == 403
    await admin.patch(f"{API}/admin/settings", json={
        "standard_shipping_cents": 499, "express_shipping_cents": 1499, "free_shipping_over_cents": 4900,
        "tax_rate": 0, "rider_fee_cents": 300})


async def test_stall_prices_are_not_published(client, admin):
    plans = (await client.get(f"{API}/plans")).json()
    assert plans and all("monthly_price_cents" not in p and "commission_rate" not in p for p in plans)
    assert all(p["price_on_request"] for p in plans)
    # The admin still sees and changes them.
    full = (await admin.get(f"{API}/admin/plans")).json()
    pid = full[0]["id"]
    r = await admin.patch(f"{API}/admin/plans/{pid}", json={"monthly_price_cents": 1234})
    assert r.status_code == 200 and r.json()["monthly_price_cents"] == 1234
    assert "1234" not in (await client.get(f"{API}/plans")).text


async def test_greeting_name(client):
    a = Actor(client)
    a.headers = {"Authorization": "Bearer " + make_token(
        a.id, a.email, user_metadata={"first_name": "Malcolm", "last_name": "Rakim"})}
    me = (await a.get(f"{API}/me")).json()
    assert me["first_name"] == "Malcolm" and me["full_name"] == "Malcolm Rakim"
    b = Actor(client, "Ama  Owusu")
    assert (await b.get(f"{API}/me")).json()["first_name"] == "Ama"
    c = Actor(client)
    c.headers = {"Authorization": "Bearer " + make_token(c.id, c.email, user_metadata={})}
    assert (await c.get(f"{API}/me")).json()["first_name"] is None
    await c.patch(f"{API}/me", json={"full_name": "Kwame Asante"})
    assert (await c.get(f"{API}/me")).json()["first_name"] == "Kwame"


# ---------------------------------------------------------------------------
# Product video
# ---------------------------------------------------------------------------


def box(kind: bytes, body: bytes) -> bytes:
    return (8 + len(body)).to_bytes(4, "big") + kind + body


def mp4(seconds=10, brand=b"isom", trailing=b"") -> bytes:
    mvhd = box(b"mvhd", b"\x00\x00\x00\x00" + b"\x00" * 8 + (1000).to_bytes(4, "big")
               + (seconds * 1000).to_bytes(4, "big") + b"\x00" * 80)
    return (box(b"ftyp", brand + b"\x00\x00\x02\x00" + b"isommp41") + box(b"moov", mvhd)
            + box(b"mdat", b"\x00" * 2048) + trailing)


WEBM = b"\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01\x42\xf7\x81\x01\x42\xf2\x81\x04\x42\xf3\x81\x08\x42\x82\x84webm" + b"\x00" * 512


async def test_vendor_adds_and_replaces_a_video(client, actor, admin, fake_storage):
    seller = await open_store(actor, admin)
    product = await add_product(seller)
    pid = product["id"]
    put = seller.client.put
    r = await put(f"{API}/seller/products/{pid}/video", headers=seller.headers,
                  files={"file": ("clip.mov", mp4(12, b"qt  "), "video/quicktime"),
                         "poster": ("p.png", png(), "image/png")},
                  data={"caption": "On the model"})
    assert r.status_code == 200, r.text
    v = r.json()["video"]
    assert v["url"].startswith(f"https://storage.test/storage/v1/object/public/product-videos/stores/{seller.store_id}/")
    assert v["url"].endswith(".mp4") and v["content_type"] == "video/mp4" and v["duration_s"] == 12
    assert v["poster_url"].endswith(".webp") and v["caption"] == "On the model"
    public = (await client.get(f"{API}/products/{product['slug']}")).json()
    assert public["video"]["url"] == v["url"]

    r = await put(f"{API}/seller/products/{pid}/video", headers=seller.headers,
                  files={"file": ("clip.webm", WEBM, "video/webm")})
    assert r.status_code == 200 and r.json()["video"]["content_type"] == "video/webm"
    assert "product-videos:" + "stores/" + v["url"].split("/stores/")[1] in fake_storage.deleted

    r = await seller.patch(f"{API}/seller/products/{pid}", json={"video": None})
    assert r.status_code == 200 and r.json()["video"] is None
    r = await seller.patch(f"{API}/seller/products/{pid}", json={"video": {"url": "https://evil.example.net/x.mp4"}})
    assert r.status_code == 422
    assert (await seller.delete(f"{API}/seller/products/{pid}/video")).status_code == 404


async def test_video_uploads_are_checked(actor, admin, fake_storage, monkeypatch):
    seller = await open_store(actor, admin)
    other = await open_store(actor, admin)
    pid = (await add_product(seller))["id"]
    other_pid = (await add_product(other))["id"]
    put = seller.client.put

    async def send(data, name="v.mp4", ctype="video/mp4", product=pid, who=seller):
        return await put(f"{API}/seller/products/{product}/video", headers=who.headers,
                         files={"file": (name, data, ctype)})

    bad = [
        b"<html><script>alert(1)</script></html>",
        png(),
        mp4(trailing=b"<html><script>alert(1)</script></html>"),   # polyglot tail
        b"<html>" + mp4(),                                          # polyglot head
        mp4(brand=b"zzzz"),
        box(b"ftyp", b"isom\x00\x00\x02\x00") + box(b"mdat", b"\x00" * 64),  # no index
        mp4()[:-100],                                               # cut short
        b"\x1a\x45\xdf\xa3" + b"\x00" * 64,                        # EBML but not webm
    ]
    for data in bad:
        r = await send(data)
        assert r.status_code == 415, (data[:20], r.text)
    r = await send(mp4(seconds=600))
    assert r.status_code == 422 and r.json()["error"]["code"] == "video_too_long"
    assert (await send(b"")).status_code == 422
    monkeypatch.setattr(get_settings(), "max_video_bytes", 1000)
    assert (await send(mp4())).status_code == 413
    monkeypatch.setattr(get_settings(), "max_video_bytes", 50_000_000)

    assert (await send(mp4(), product=other_pid)).status_code == 404
    assert (await send(mp4(), who=actor())).status_code == 403
    assert not fake_storage.objects
    r = await send(mp4(), "x.mp4", "text/html")  # the claimed type is ignored, the bytes decide
    assert r.status_code == 200 and r.json()["video"]["content_type"] == "video/mp4"


async def test_only_upload_routes_take_big_bodies(actor, admin, fake_storage):
    seller = await open_store(actor, admin)
    pid = (await add_product(seller))["id"]
    big = box(b"ftyp", b"isom\x00\x00\x02\x00") + box(b"moov", b"") + box(b"mdat", b"\x00" * 400_000)
    r = await seller.client.put(f"{API}/seller/products/{pid}/video", headers=seller.headers,
                                files={"file": ("v.mp4", big, "video/mp4")})
    assert r.status_code == 200, r.text
    r = await seller.client.post(f"{API}/seller/products", headers={**seller.headers, "Content-Type": "application/json"},
                                 content=b"{" + b" " * 400_000 + b"}")
    assert r.status_code == 413


async def test_page_renders_from_the_web_app_get_their_own_bucket():
    from app.security import RateLimiter, RateLimitMiddleware

    async def ok_app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    mw = RateLimitMiddleware(ok_app, RateLimiter(None), per_minute=2, exempt=(), internal_per_minute=5,
                             internal_networks=["172.16.0.0/12"])

    async def hit(ip):
        sent = []

        async def send(m):
            sent.append(m)

        await mw({"type": "http", "path": "/api/v1/products", "client": (ip, 1)}, None, send)
        return sent[0]["status"]

    assert [await hit("203.0.113.9") for _ in range(3)] == [200, 200, 429]   # a real visitor
    assert [await hit("172.18.0.5") for _ in range(6)] == [200] * 5 + [429]  # the web container
    assert await hit("198.51.100.1") == 200  # other visitors unaffected


def test_service_headers_handle_both_key_styles():
    from app.config import Settings
    from app.supabase_admin import service_headers

    base = dict(database_url="postgresql://x@localhost/x", supabase_url="https://p.supabase.co",
                supabase_jwt_secret="s" * 40)
    legacy = Settings(**base, supabase_service_role_key="eyJhbGciOiJIUzI1NiJ9.e30.sig")
    assert service_headers(legacy) == {"Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.e30.sig",
                                       "apikey": "eyJhbGciOiJIUzI1NiJ9.e30.sig"}
    new = Settings(**base, supabase_service_role_key="sb_secret_abc")
    assert service_headers(new) == {"apikey": "sb_secret_abc"}
