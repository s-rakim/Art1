"""The marketplace end to end: a store rents space, lists a product, a
shopper buys it cash on delivery, the store dispatches a rider, the rider
delivers with the handover code, and the money lands in the right places."""

from conftest import ADDRESS, API, add_product, hire_rider, open_store, pay_at_door


async def test_public_catalogue(client):
    r = await client.get(f"{API}/plans")
    assert r.status_code == 200
    codes = [p["code"] for p in r.json()]
    assert codes == ["starter", "boutique", "flagship"]

    r = await client.get(f"{API}/categories")
    women = next(c for c in r.json() if c["slug"] == "women")
    assert {c["slug"] for c in women["children"]} >= {"women-dresses", "women-tops"}

    r = await client.get(f"{API}/status")
    assert r.json()["maintenance_mode"] is False


async def test_full_order_and_delivery(actor, admin, db, client):
    seller = await open_store(actor, admin, plan="boutique")
    product = await add_product(seller, price=2500, stock=10)
    variant = product["variants"][0]

    # Boutique rent was charged up front on approval.
    rent = await db.fetchval(
        "select sum(amount_cents) from ledger_entries where store_id = $1 and kind = 'rent'", seller.store_id
    )
    assert rent == -2900

    # Visible to the public, on the product page and in listings.
    r = await client.get(f"{API}/products/{product['slug']}")
    assert r.status_code == 200
    assert r.json()["store"]["slug"]
    r = await client.get(f"{API}/products", params={"q": "linen dress"})
    assert any(p["id"] == product["id"] for p in r.json()["items"])

    buyer = actor("Ama Buyer")
    r = await buyer.post(f"{API}/cart/items", json={"variant_id": variant["id"], "quantity": 5})
    assert r.status_code == 201, r.text
    cart = r.json()
    assert cart["items"][0]["unit_price_cents"] == 2000  # volume tier kicks in at 5
    assert cart["subtotal_cents"] == 10000

    r = await buyer.post(f"{API}/checkout", json={"shipping_address": ADDRESS, "payment_method": "cod"})
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["payment_url"] is None
    order_id = out["order_id"]
    # 10000 subtotal, free shipping over 4900.
    assert out["total_cents"] == 10000

    stock = await db.fetchval("select stock from product_variants where id = $1", variant["id"])
    assert stock == 5

    # The seller sees it ready to pack, address included because it's COD.
    r = await seller.get(f"{API}/seller/orders")
    so = r.json()["items"][0]
    assert so["status"] == "processing" and so["payment_status"] == "unpaid"
    assert so["commission_cents"] == 1000  # boutique: 10%
    assert so["ship_to"]["line1"] == "12 Ring Road"

    rider = await hire_rider(actor, admin)
    r = await seller.get(f"{API}/seller/riders/available")
    assert any(x["id"] == str(rider.id) for x in r.json())

    r = await seller.post(f"{API}/seller/orders/{so['id']}/dispatch", json={"rider_id": str(rider.id)})
    assert r.status_code == 201, r.text
    delivery_id = r.json()["delivery"]["id"]

    # Before accepting, the rider only sees roughly where it goes.
    r = await rider.get(f"{API}/rider/deliveries/{delivery_id}")
    job = r.json()
    assert job["dropoff"]["label"] == "Approximate area"
    assert job["customer_phone"] is None
    assert job["cash_to_collect_cents"] == 10000

    r = await rider.patch(f"{API}/rider/deliveries/{delivery_id}", json={"action": "accept"})
    assert r.status_code == 200, r.text
    assert r.json()["dropoff"]["lat"] == 5.56
    assert r.json()["customer_phone"]

    await rider.post(f"{API}/rider/location", json={"lat": 5.60, "lng": -0.19, "heading": 200})

    r = await buyer.get(f"{API}/orders/{order_id}/tracking")
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["rider"]["name"] == "Kofi"
    assert t["rider"]["phone_masked"].endswith("567")
    assert t["rider_position"]["lat"] == 5.60
    assert t["eta_minutes"] >= 1
    code = t["handover_code"]
    assert len(code) == 6

    r = await rider.patch(f"{API}/rider/deliveries/{delivery_id}", json={"action": "picked_up"})
    assert r.status_code == 200
    # Not until the shopper's payment is confirmed.
    r = await rider.patch(f"{API}/rider/deliveries/{delivery_id}", json={"action": "delivered", "code": code})
    assert r.status_code == 409 and r.json()["error"]["code"] == "payment_not_confirmed"
    paid = await pay_at_door(admin, rider, delivery_id)
    assert paid["due_cents"] == 0 and paid["paid_cents"] == 10000
    wrong = "000000" if code != "000000" else "111111"
    r = await rider.patch(f"{API}/rider/deliveries/{delivery_id}", json={"action": "delivered", "code": wrong})
    assert r.status_code == 422
    r = await rider.patch(f"{API}/rider/deliveries/{delivery_id}", json={"action": "delivered", "code": code})
    assert r.status_code == 200, r.text

    r = await buyer.get(f"{API}/orders/{order_id}")
    assert r.json()["status"] == "fulfilled"
    assert r.json()["shipments"][0]["status"] == "delivered"

    # The money went to The Bazaar's till: the store is credited the sale
    # and owes commission and the delivery charge. Stores can't confirm.
    r = await seller.post(f"{API}/seller/orders/{so['id']}/confirm-payment")
    assert r.status_code == 403 and r.json()["error"]["code"] == "payments_central"
    r = await seller.get(f"{API}/seller/orders/{so['id']}")
    assert r.json()["payment_status"] == "paid"
    kinds = dict(await db.fetch(
        "select kind, sum(amount_cents) from ledger_entries where store_id = $1 group by kind", seller.store_id
    ))
    assert kinds["commission"] == -1000
    assert kinds["delivery"] == -300
    assert kinds["sale"] == 10000

    r = await rider.get(f"{API}/rider/me")
    assert r.json()["earnings_cents"] == 300

    r = await admin.get(f"{API}/admin/income", params={"period": "7d"})
    inc = r.json()
    assert inc["commission_cents"] >= 1000 and inc["rent_cents"] >= 2900

    # Reviews only from buyers.
    r = await buyer.post(f"{API}/products/{product['slug']}/reviews", json={"rating": 5, "title": "Lovely"})
    assert r.status_code == 201, r.text
    r = await client.get(f"{API}/products/{product['slug']}")
    assert r.json()["rating"] == 5.0
    r = await client.get(f"{API}/products/{product['slug']}/reviews")
    assert r.json()["items"][0]["author_name"] == "Ama B."


async def test_cancel_restocks(actor, admin, db):
    seller = await open_store(actor, admin)
    product = await add_product(seller, stock=3)
    vid = product["variants"][0]["id"]
    buyer = actor()
    r = await buyer.post(
        f"{API}/checkout",
        json={"items": [{"variant_id": vid, "quantity": 2}], "shipping_address": ADDRESS,
              "payment_method": "bank_transfer"},
    )
    assert r.status_code == 201, r.text
    order_id = r.json()["order_id"]
    # Starter: 25.00 x2 = 50.00, free shipping threshold 49.00
    assert r.json()["total_cents"] == 5000
    assert await db.fetchval("select stock from product_variants where id = $1", vid) == 1

    r = await buyer.post(f"{API}/orders/{order_id}/cancel")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "canceled"
    assert await db.fetchval("select stock from product_variants where id = $1", vid) == 3


async def test_cannot_oversell(actor, admin):
    seller = await open_store(actor, admin)
    product = await add_product(seller, stock=1)
    vid = product["variants"][0]["id"]
    a, b = actor(), actor()
    r = await a.post(f"{API}/checkout", json={"items": [{"variant_id": vid, "quantity": 1}], "shipping_address": ADDRESS})
    assert r.status_code == 201
    r = await b.post(f"{API}/cart/items", json={"variant_id": vid, "quantity": 1})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "out_of_stock"


async def test_placement_uses_plan_credits(actor, admin, db):
    seller = await open_store(actor, admin, plan="boutique")  # 1 free day a month
    product = await add_product(seller)
    from datetime import date, timedelta

    start = date.today() + timedelta(days=1)
    r = await seller.post(
        f"{API}/seller/placements",
        json={"slot_code": "home-grid", "starts_on": str(start), "ends_on": str(start + timedelta(days=2)),
              "product_id": product["id"]},
    )
    assert r.status_code == 201, r.text
    assert r.json()["credits_used"] == 1
    assert r.json()["amount_cents"] == 2 * 900


async def test_payout_needs_available_balance(actor, admin):
    seller = await open_store(actor, admin)
    r = await seller.post(
        f"{API}/seller/payouts",
        json={"amount_cents": 5000, "method": {"type": "bank_transfer", "account_name": "Sam", "account_last4": "1234"}},
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "insufficient_balance"


async def test_rent_billing_rolls_forward(actor, admin, db):
    seller = await open_store(actor, admin, plan="flagship")
    await db.execute(
        "update store_subscriptions set current_period_end = now() - interval '1 minute' where store_id = $1",
        seller.store_id,
    )
    r = await admin.post(f"{API}/admin/billing/run")
    assert r.status_code == 200
    assert r.json()["subscriptions_billed"] >= 1
    n = await db.fetchval("select count(*) from rent_invoices where store_id = $1", seller.store_id)
    assert n == 2


async def test_card_payments_are_off_until_configured(actor, admin):
    seller = await open_store(actor, admin)
    product = await add_product(seller)
    buyer = actor()
    r = await buyer.post(
        f"{API}/checkout",
        json={"items": [{"variant_id": product["variants"][0]["id"], "quantity": 1}], "shipping_address": ADDRESS,
              "payment_method": "card"},
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "card_unavailable"


async def test_vendor_delivery_map(actor, admin):
    seller = await open_store(actor, admin)
    product = await add_product(seller)
    buyer = actor()
    r = await buyer.post(f"{API}/checkout", json={
        "items": [{"variant_id": product["variants"][0]["id"], "quantity": 1}], "shipping_address": ADDRESS})
    assert r.status_code == 201
    so = (await seller.get(f"{API}/seller/orders")).json()["items"][0]
    rider = await hire_rider(actor, admin)
    r = await seller.post(f"{API}/seller/orders/{so['id']}/dispatch", json={"rider_id": str(rider.id)})
    did = r.json()["delivery"]["id"]

    job = (await seller.get(f"{API}/seller/deliveries")).json()["items"][0]
    assert job["order_number"].startswith("BZ-")
    assert job["pickup"]["lat"] == 5.6037
    assert job["dropoff"] is None and job["rider_position"] is None  # not accepted yet

    await rider.patch(f"{API}/rider/deliveries/{did}", json={"action": "accept"})
    await rider.post(f"{API}/rider/location", json={"lat": 5.59, "lng": -0.19})
    job = (await seller.get(f"{API}/seller/deliveries")).json()["items"][0]
    assert job["dropoff"]["lat"] == 5.56
    assert job["rider_position"]["lat"] == 5.59
    detail = (await seller.get(f"{API}/seller/orders/{so['id']}")).json()
    assert detail["delivery"]["rider_position"]["lng"] == -0.19
