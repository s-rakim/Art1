"""Riders' runs and batching, central payments by transaction code, and the
ledger sheets."""

import asyncio
import uuid
from zoneinfo import ZoneInfo

import asyncpg
import pytest

from app.payments_bank import parse_daraja, parse_message, parse_text
from conftest import (ADDRESS, API, add_product, hire_rider, new_code, open_store, pay_at_door,
                      till_message)


def spot(n: int, km_north: float = 0.0, km_east: float = 0.0) -> dict:
    """A patch of map of its own for each test, far from every other test's."""
    return {"lat": 50.0 + n * 0.5 + km_north / 111.0, "lng": 20.0 + n * 0.5 + km_east / 71.0}


async def shop_at(actor, admin, where: dict):
    seller = await open_store(actor, admin)
    r = await seller.patch(f"{API}/seller/me", json={"pickup": {**where, "label": "Stall"}})
    assert r.status_code == 200, r.text
    product = await add_product(seller, price=1000, stock=100)
    return seller, product["variants"][0]["id"]


async def buy(buyer, variant_id, to: dict, qty: int = 1, payment="cod", note: str | None = None) -> dict:
    addr = {**ADDRESS, **to}
    r = await buyer.post(f"{API}/checkout", json={
        "items": [{"variant_id": variant_id, "quantity": qty}], "shipping_address": addr, "payment_method": payment})
    assert r.status_code == 201, r.text
    out = r.json()
    if note:
        r = await buyer.put(f"{API}/orders/{out['order_id']}/dropoff", json={**to, "note": note})
        assert r.status_code == 200, r.text
    return out


async def store_order_of(db, order_id) -> uuid.UUID:
    return await db.fetchval("select id from store_orders where order_id = $1", uuid.UUID(order_id))


@pytest.fixture
async def settings_reset(admin):
    yield
    await admin.patch(f"{API}/admin/settings", json={
        "rider_commission_rate": 0, "rider_max_batch": 3, "rider_batch_radius_km": 8, "rider_pickup_radius_km": 2,
        "rider_pool_radius_km": 15, "payout_interval_days": 7})


# ---------------------------------------------------------------------------
# Reading till and bank messages
# ---------------------------------------------------------------------------

NAIROBI = ZoneInfo("Africa/Nairobi")


def test_reads_mpesa_and_bank_messages():
    text = """TKP4XYZ9AB Confirmed. Ksh1,500.00 received from JOHN KAMAU 0712345678 on 25/11/26 at 3:41 PM. New Account balance is Ksh12,345.00.

RKT1ABCD23 Confirmed. Ksh2,000.00 received from PETER OTIENO 254722111222 for account BZ-251125-100001 on 25/11/26 at 9:15 AM.
TKR6QWE2RT Confirmed. on 25/11/26 at 4:20 PM Ksh700.00 received from 2547***56789 ALICE MUTHONI. New Account balance is Ksh13,045.00

Dear Customer, KES 3,400.00 has been credited to your account 0123XXXX89 by SAMUEL KIPLAGAT on 25-11-2026. Ref: FT24330ABCD12.

hello, nothing to see here
"""
    r = parse_text(text, "KES", "Africa/Nairobi")
    got = {(p.provider, p.code): p for p in r.rows}
    assert set(got) == {("mpesa", "TKP4XYZ9AB"), ("mpesa", "RKT1ABCD23"), ("mpesa", "TKR6QWE2RT"),
                        ("bank", "FT24330ABCD12")}
    assert got["mpesa", "TKP4XYZ9AB"].amount_cents == 150000
    assert got["mpesa", "TKP4XYZ9AB"].payer_name == "JOHN KAMAU"
    assert got["mpesa", "TKP4XYZ9AB"].received_at.isoformat() == "2026-11-25T12:41:00+00:00"
    assert got["mpesa", "RKT1ABCD23"].order_number == "BZ-251125-100001"
    assert got["mpesa", "TKR6QWE2RT"].payer_name == "ALICE MUTHONI"
    assert got["bank", "FT24330ABCD12"].payer_name == "SAMUEL KIPLAGAT"
    assert r.failed == ["hello, nothing to see here"]


def test_hostile_message_text_is_harmless():
    nasty = ("TKP4XYZ9AB Confirmed. Ksh1.00 received from <script>alert(1)</script> '; drop table orders; -- "
             "\x00‮ on 25/11/26 at 3:41 PM")
    p = parse_message(nasty, "KES", NAIROBI)
    assert p is not None and p.code == "TKP4XYZ9AB" and p.amount_cents == 100
    assert p.payer_name is None or "<" not in p.payer_name
    assert "\x00" not in p.raw and "‮" not in p.raw
    # Codes have to look like codes; amounts like amounts.
    assert parse_message("ABCDEFGHIJ Confirmed. Ksh100 received", "KES", NAIROBI) is None  # no digit
    assert parse_message("TKP4XYZ9AB Confirmed. received from X", "KES", NAIROBI) is None  # no amount
    assert len(parse_text("x" * 300_000, "KES", "Africa/Nairobi").rows) == 0


def test_reads_daraja_confirmation():
    p = parse_daraja({"TransID": "tkp4xyz9ab", "TransAmount": "1250.50", "TransTime": "20261125154100",
                      "BillRefNumber": "BZ-261125-100002", "FirstName": "Ann", "LastName": "Wanjiru"},
                     "KES", "Africa/Nairobi")
    assert p.code == "TKP4XYZ9AB" and p.amount_cents == 125050 and p.payer_name == "Ann Wanjiru"
    assert p.order_number == "BZ-261125-100002"
    assert parse_daraja({"TransID": "x';--", "TransAmount": "10"}, "KES", "Africa/Nairobi") is None
    assert parse_daraja({"TransID": "TKP4XYZ9AB", "TransAmount": "-5"}, "KES", "Africa/Nairobi") is None


async def test_import_previews_then_stores_once(admin, actor):
    code = new_code()
    text = f"{code} Confirmed. USD 12.00 received from MARY NJERI 254700000000 on 25/11/26 at 1:00 PM."
    r = await admin.post(f"{API}/admin/payments/import", json={"text": text})
    assert r.status_code == 200 and r.json()["stored"] == 0 and r.json()["rows"][0]["duplicate"] is False
    r = await admin.post(f"{API}/admin/payments/import", json={"text": text, "commit": True})
    assert r.json()["stored"] == 1
    r = await admin.post(f"{API}/admin/payments/import", json={"text": text + "\n\n" + text, "commit": True})
    assert r.json()["stored"] == 0 and r.json()["rows"][0]["duplicate"] is True
    r = await admin.get(f"{API}/admin/payments", params={"q": code})
    assert r.json()["total"] == 1 and r.json()["items"][0]["status"] == "unconfirmed"

    # Only admins.
    nobody = actor()
    assert (await nobody.post(f"{API}/admin/payments/import", json={"text": text})).status_code == 403
    assert (await nobody.get(f"{API}/admin/payments")).status_code == 403


async def test_phone_and_daraja_feeds_need_the_token(client, db, monkeypatch):
    from app.config import get_settings

    token = "t" * 40
    monkeypatch.setattr(get_settings(), "payment_webhook_token", token)
    code = new_code()
    msg = {"text": f"{code} Confirmed. USD 5.00 received from JO DOE 254700000001 on 25/11/26 at 1:00 PM."}
    assert (await client.post(f"{API}/payments/sms/{'x' * 40}", json=msg)).status_code == 404
    assert (await client.post(f"{API}/payments/sms/{token}", json=msg)).status_code == 200
    assert await db.fetchval("select source from payment_receipts where code = $1", code) == "sms_forward"

    daraja = {"TransID": new_code(), "TransAmount": "7.00", "BusinessShortCode": "600000", "FirstName": "Ann"}
    assert (await client.post(f"{API}/payments/till/{'x' * 40}/confirmation", json=daraja)).status_code == 404
    r = await client.post(f"{API}/payments/till/{token}/confirmation", json=daraja)
    assert r.status_code == 200 and r.json()["ResultCode"] == 0
    assert await db.fetchval("select amount_cents from payment_receipts where code = $1", daraja["TransID"]) == 700

    monkeypatch.setattr(get_settings(), "payment_webhook_token", "")
    assert (await client.post(f"{API}/payments/sms/{token}", json=msg)).status_code == 404


# ---------------------------------------------------------------------------
# Paying at the door
# ---------------------------------------------------------------------------


async def _at_door(actor, admin, db, n: int, rider=None, payment="cod", qty=1):
    """A job, picked up, with the rider standing at the door."""
    seller, vid = await shop_at(actor, admin, spot(n))
    rider = rider or await hire_rider(actor, admin, **spot(n, 1))
    buyer = actor("Ama Buyer")
    order = await buy(buyer, vid, spot(n, 3), qty=qty, payment=payment)
    so = await store_order_of(db, order["order_id"])
    r = await rider.post(f"{API}/rider/open-jobs/{so}/claim")
    assert r.status_code == 200, r.text
    did = r.json()["id"]
    assert (await rider.patch(f"{API}/rider/deliveries/{did}", json={"action": "picked_up"})).status_code == 200
    return {"seller": seller, "rider": rider, "buyer": buyer, "order": order, "delivery_id": did, "so": so}


async def test_payment_flow_at_the_door(actor, admin, db):
    j = await _at_door(actor, admin, db, 1)
    rider, did = j["rider"], j["delivery_id"]

    # Not before arriving.
    r = await rider.get(f"{API}/rider/deliveries/{did}/payment", params={"q": "AMA"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_arrived"

    r = await rider.post(f"{API}/rider/deliveries/{did}/arrived")
    assert r.status_code == 200 and r.json()["status"] == "arrived"
    due = r.json()["amount_due_cents"]
    assert due == j["order"]["total_cents"] and r.json()["payment_confirmed"] is False

    # The shopper pays in two goes. Name search finds both, codes masked.
    first = await till_message(admin, due - 400, name="AMA BUYER")
    second = await till_message(admin, 400, name="AMA K BUYER")
    r = await rider.get(f"{API}/rider/deliveries/{did}/payment", params={"q": "ama buyer"})
    found = r.json()["matches"]
    assert {m["code"][-3:] for m in found} >= {first[-3:], second[-3:]}
    assert all(m["code"].startswith("•") for m in found)

    r = await rider.post(f"{API}/rider/deliveries/{did}/payment", json={"code": first})
    assert r.status_code == 200 and r.json()["payment_confirmed"] is False and r.json()["due_cents"] == due
    assert r.json()["paid_cents"] == due - 400
    receipt = next(m["receipt_id"] for m in found if m["code"].endswith(second[-3:]))
    r = await rider.post(f"{API}/rider/deliveries/{did}/payment", json={"receipt_id": receipt})
    assert r.status_code == 200 and r.json()["payment_confirmed"] is True and r.json()["due_cents"] == 0

    # Spent: the same code never works again, here or anywhere.
    r = await rider.post(f"{API}/rider/deliveries/{did}/payment", json={"code": first})
    assert r.status_code == 409 and r.json()["error"]["code"] == "code_used"
    other = await _at_door(actor, admin, db, 2)
    await other["rider"].post(f"{API}/rider/deliveries/{other['delivery_id']}/arrived")
    r = await other["rider"].get(f"{API}/rider/deliveries/{other['delivery_id']}/payment", params={"q": first})
    m = r.json()["matches"][0]
    assert m["used"] is True and m["payer_name"] is None and m["amount_cents"] is None
    r = await other["rider"].post(f"{API}/rider/deliveries/{other['delivery_id']}/payment", json={"code": first})
    assert r.status_code == 409 and r.json()["error"]["code"] == "code_used"

    # And the database itself refuses to un-use it.
    with pytest.raises(asyncpg.PostgresError):
        await db.execute("update payment_receipts set status = 'unconfirmed', confirmed_at = null, order_id = null "
                         "where code = $1", first)

    # Another rider can't look at or pay for this delivery.
    r = await other["rider"].get(f"{API}/rider/deliveries/{did}/payment", params={"q": "ama"})
    assert r.status_code == 404
    r = await other["rider"].post(f"{API}/rider/deliveries/{did}/payment", json={"code": second})
    assert r.status_code == 404

    # The admin saw both payments used, by whom.
    r = await admin.get(f"{API}/admin/payments", params={"q": first})
    assert r.json()["items"][0]["confirmed_role"] == "rider"
    r = await admin.get(f"{API}/admin/audit", params={"entity": "payment_receipts"})
    assert any(a["action"] == "confirmed" and a["actor_id"] == str(rider.id) for a in r.json()["items"])


async def test_two_riders_racing_for_one_code(actor, admin, db):
    a = await _at_door(actor, admin, db, 3)
    b = await _at_door(actor, admin, db, 4)
    for j in (a, b):
        await j["rider"].post(f"{API}/rider/deliveries/{j['delivery_id']}/arrived")
    code = await till_message(admin, a["order"]["total_cents"])
    results = await asyncio.gather(*[
        j["rider"].post(f"{API}/rider/deliveries/{j['delivery_id']}/payment", json={"code": code}) for j in (a, b)
    ])
    assert sorted(r.status_code for r in results) == [200, 409]


async def test_wrong_currency_and_void_codes(actor, admin, db):
    j = await _at_door(actor, admin, db, 5)
    await j["rider"].post(f"{API}/rider/deliveries/{j['delivery_id']}/arrived")
    kes = await till_message(admin, 10000, currency="KES")
    r = await j["rider"].post(f"{API}/rider/deliveries/{j['delivery_id']}/payment", json={"code": kes})
    assert r.status_code == 409 and r.json()["error"]["code"] == "currency_mismatch"

    void = await till_message(admin, 10000)
    rid = (await admin.get(f"{API}/admin/payments", params={"q": void})).json()["items"][0]["id"]
    r = await admin.patch(f"{API}/admin/payments/{rid}", json={"status": "void", "note": "Test payment"})
    assert r.status_code == 200 and r.json()["status"] == "void"
    r = await j["rider"].post(f"{API}/rider/deliveries/{j['delivery_id']}/payment", json={"code": void})
    assert r.status_code == 409 and r.json()["error"]["code"] == "code_void"


# ---------------------------------------------------------------------------
# The job board and batching
# ---------------------------------------------------------------------------


async def test_job_board_claims_and_batching(actor, admin, db, settings_reset):
    shop = spot(6)
    seller, vid = await shop_at(actor, admin, shop)
    neighbour, nvid = await shop_at(actor, admin, spot(6, 0.5))   # half a km away
    far_shop, fvid = await shop_at(actor, admin, spot(6, 6))      # six km away
    rider = await hire_rider(actor, admin, **spot(6, 1))
    rival = await hire_rider(actor, admin, **spot(6, 1))

    near_a = await buy(actor(), vid, spot(6, 4), note="Blue gate, call when here")
    near_b = await buy(actor(), nvid, spot(6, 5))
    far_drop = await buy(actor(), vid, spot(6, 30))
    from_far_shop = await buy(actor(), fvid, spot(6, 4))
    sos = {k: await store_order_of(db, o["order_id"]) for k, o in
           (("a", near_a), ("b", near_b), ("far_drop", far_drop), ("far_shop", from_far_shop))}

    board = (await rider.get(f"{API}/rider/open-jobs")).json()
    assert board["ride_status"] == "idle" and board["rules"]["max_batch"] == 3
    ids = {j["id"] for j in board["items"]}
    assert {str(v) for v in sos.values()} <= ids
    job = next(j for j in board["items"] if j["id"] == str(sos["a"]))
    assert job["batchable"] and job["dropoff"]["label"] == "Approximate area"
    assert job["earning_cents"] == 300 and job["amount_due_cents"] == near_a["total_cents"]
    # Nothing personal before accepting.
    assert "customer_phone" not in job and "customer_name" not in job

    # Two riders, one job: exactly one gets it.
    results = await asyncio.gather(rider.post(f"{API}/rider/open-jobs/{sos['a']}/claim"),
                                   rival.post(f"{API}/rider/open-jobs/{sos['a']}/claim"))
    codes = sorted(r.status_code for r in results)
    assert codes == [200, 409]
    winner = rider if results[0].status_code == 200 else rival
    loser = rival if winner is rider else rider
    first = next(r for r in results if r.status_code == 200).json()
    assert first["status"] == "accepted" and first["customer_note"] == "Blue gate, call when here"
    assert first["customer_phone"] and first["dropoff"]["lat"] == pytest.approx(spot(6, 4)["lat"])
    assert next(r for r in results if r.status_code == 409).json()["error"]["code"] == "taken"

    # On a run now: the board greys out what doesn't fit.
    board = {j["id"]: j for j in (await winner.get(f"{API}/rider/open-jobs")).json()["items"]}
    assert board[str(sos["b"])]["batchable"] is True
    assert board[str(sos["far_drop"])]["blocked_reason"] == "on_run_far"
    assert board[str(sos["far_shop"])]["blocked_reason"] == "pickup_far"
    r = await winner.post(f"{API}/rider/open-jobs/{sos['far_drop']}/claim")
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_batchable"
    r = await winner.post(f"{API}/rider/open-jobs/{sos['far_shop']}/claim")
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_batchable"
    r = await winner.post(f"{API}/rider/open-jobs/{sos['b']}/claim")
    assert r.status_code == 200, r.text
    assert r.json()["run_id"] == first["run_id"]

    # The admin's batch size holds.
    await admin.patch(f"{API}/admin/settings", json={"rider_max_batch": 2})
    near_c = await buy(actor(), vid, spot(6, 4.5))
    so_c = await store_order_of(db, near_c["order_id"])
    board = {j["id"]: j for j in (await winner.get(f"{API}/rider/open-jobs")).json()["items"]}
    assert board[str(so_c)]["blocked_reason"] == "batch_full"
    r = await winner.post(f"{API}/rider/open-jobs/{so_c}/claim")
    assert r.status_code == 409 and r.json()["error"]["code"] == "batch_full"
    await admin.patch(f"{API}/admin/settings", json={"rider_max_batch": 3})

    # The other rider is idle, so everything is open to them; skipping hides it.
    board = {j["id"]: j for j in (await loser.get(f"{API}/rider/open-jobs")).json()["items"]}
    assert board[str(sos["far_drop"])]["batchable"] is True
    assert (await loser.post(f"{API}/rider/open-jobs/{sos['far_drop']}/skip")).status_code == 200
    board = {j["id"] for j in (await loser.get(f"{API}/rider/open-jobs")).json()["items"]}
    assert str(sos["far_drop"]) not in board

    # The run: shops to collect from, then drop-offs in the order placed.
    run = (await winner.get(f"{API}/rider/run")).json()
    assert [s["order_number"] for s in run["stops"]] == [near_a["order_number"], near_b["order_number"]]
    kinds = [w["kind"] for w in run["route"]]
    assert kinds == ["rider", "pickup", "pickup", "dropoff", "dropoff"]
    assert run["route"][3]["delivery_ids"] == [run["stops"][0]["id"]]
    me = (await winner.get(f"{API}/rider/me")).json()
    assert me["ride_status"] == "delivering" and me["active_deliveries"] == 2

    # Offline riders see an empty board and can't claim.
    await loser.post(f"{API}/rider/shift", json={"online": False})
    assert (await loser.get(f"{API}/rider/open-jobs")).json()["items"] == []
    r = await loser.post(f"{API}/rider/open-jobs/{sos['far_shop']}/claim")
    assert r.status_code == 409 and r.json()["error"]["code"] == "offline"

    # Shoppers, stores and applicants have no board.
    assert (await seller.get(f"{API}/rider/open-jobs")).status_code == 403


async def test_a_typed_address_without_a_pin(actor, admin, db, settings_reset):
    """Buyers can check out with a typed address and no pin. The rider still
    gets the job, the address and a working run page, just no drop-off pin."""
    seller, vid = await shop_at(actor, admin, spot(11))
    rider = await hire_rider(actor, admin, **spot(11, 1))
    buyer = actor("Ama Buyer")
    addr = {k: v for k, v in ADDRESS.items() if k not in ("lat", "lng")}
    addr.update(line1="Moi Avenue 12", city="Nairobi")
    r = await buyer.post(f"{API}/checkout", json={
        "items": [{"variant_id": vid, "quantity": 1}], "shipping_address": addr, "payment_method": "cod"})
    assert r.status_code == 201, r.text
    order = r.json()
    so = await store_order_of(db, order["order_id"])

    board = (await rider.get(f"{API}/rider/open-jobs")).json()["items"]
    job = next(j for j in board if j["id"] == str(so))
    assert job["dropoff"] is None and job["trip_km"] is None and job["area"] == "Nairobi"

    r = await rider.post(f"{API}/rider/open-jobs/{so}/claim")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["dropoff"] is None and d["pickup"]["lat"] == pytest.approx(spot(11)["lat"])
    assert d["dropoff_address"]["line1"] == "Moi Avenue 12"
    did = d["id"]

    r = await rider.get(f"{API}/rider/run")
    assert r.status_code == 200, r.text
    run = r.json()
    assert [s["id"] for s in run["stops"]] == [did]
    assert [w["kind"] for w in run["route"]] == ["rider", "pickup"]
    for url in (f"{API}/rider/deliveries", f"{API}/rider/deliveries/{did}", f"{API}/rider/me"):
        assert (await rider.get(url)).status_code == 200, url

    # Something else that needs a pin can't join this run: we can't tell how
    # far apart the drop-offs are.
    other = await buy(actor(), vid, spot(11, 2))
    other_so = await store_order_of(db, other["order_id"])
    r = await rider.post(f"{API}/rider/open-jobs/{other_so}/claim")
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_batchable"

    # Store, admin and buyer views cope too, and the job still finishes.
    assert (await seller.get(f"{API}/seller/deliveries")).status_code == 200
    assert (await admin.get(f"{API}/admin/deliveries")).status_code == 200
    assert (await buyer.get(f"{API}/orders/{order['order_id']}/tracking")).status_code == 200
    assert (await rider.patch(f"{API}/rider/deliveries/{did}", json={"action": "picked_up"})).status_code == 200
    await pay_at_door(admin, rider, did)
    code = await db.fetchval("select handover_code from deliveries where id = $1", uuid.UUID(did))
    r = await rider.patch(f"{API}/rider/deliveries/{did}", json={"action": "delivered", "code": code})
    assert r.status_code == 200, r.text


async def test_earnings_follow_the_admins_commission(actor, admin, db, settings_reset):
    await admin.patch(f"{API}/admin/settings", json={"rider_commission_rate": 0.5})
    seller, vid = await shop_at(actor, admin, spot(7))
    rider = await hire_rider(actor, admin, **spot(7, 1))
    # Under the free shipping line, so the shopper pays the 499 delivery charge.
    order = await buy(actor(), vid, spot(7, 2), qty=1)
    so = await store_order_of(db, order["order_id"])
    job = next(j for j in (await rider.get(f"{API}/rider/open-jobs")).json()["items"] if j["id"] == str(so))
    assert job["earning_cents"] == 300 + round(0.5 * 499)
    did = (await rider.post(f"{API}/rider/open-jobs/{so}/claim")).json()["id"]
    await rider.patch(f"{API}/rider/deliveries/{did}", json={"action": "picked_up"})
    await pay_at_door(admin, rider, did)
    code = await db.fetchval("select handover_code from deliveries where id = $1", uuid.UUID(did))
    r = await rider.patch(f"{API}/rider/deliveries/{did}", json={"action": "delivered", "code": code})
    assert r.status_code == 200, r.text
    me = (await rider.get(f"{API}/rider/me")).json()
    assert me["completed_deliveries"] == 1 and me["earnings_cents"] == 550
    assert me["rules"]["commission_rate"] == 0.5
    assert await db.fetchval("select amount_cents from ledger_entries where ref_id = $1 and kind = 'delivery'",
                             uuid.UUID(did)) == -550
    run = (await rider.get(f"{API}/rider/run")).json()
    assert run["stops"][0]["status"] == "delivered" and run["route"] == [run["route"][0]]


# ---------------------------------------------------------------------------
# Sheets and settlements
# ---------------------------------------------------------------------------


async def test_sheets_are_per_store_and_entries_need_the_admin(actor, admin, db, settings_reset):
    a, avid = await shop_at(actor, admin, spot(8))
    b, _ = await shop_at(actor, admin, spot(8, 1))

    r = await a.post(f"{API}/seller/sheet-entries", json={
        "entry_date": "2026-11-20", "kind": "sale", "description": "=HYPERLINK(\"http://evil\")",
        "quantity": 2, "amount_cents": 4000, "reference": "TKX1234567"})
    assert r.status_code == 201, r.text
    entry = r.json()
    assert entry["status"] == "pending"

    # Vendor B sees nothing of A's and can't touch it.
    assert (await b.get(f"{API}/seller/sheet-entries")).json()["total"] == 0
    assert (await b.patch(f"{API}/seller/sheet-entries/{entry['id']}", json={"quantity": 9})).status_code == 404
    assert (await b.delete(f"{API}/seller/sheet-entries/{entry['id']}")).status_code == 404
    assert (await b.get(f"{API}/seller/sheet-entries/{entry['id']}/history")).status_code == 404
    assert (await b.post(f"{API}/admin/sheet-entries/{entry['id']}/confirm", json={"key": "TKX1234567"})
            ).status_code == 403

    # Not in the read-only sheet until an admin confirms it with its key.
    assert (await a.get(f"{API}/seller/sheets/entries")).json()["total"] == 0
    r = await admin.post(f"{API}/admin/sheet-entries/{entry['id']}/confirm", json={"key": "WRONG123"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "key_mismatch"
    r = await admin.post(f"{API}/admin/sheet-entries/{entry['id']}/confirm", json={"key": "tkx 1234567"})
    assert r.status_code == 200 and r.json()["status"] == "confirmed"
    sheet = (await a.get(f"{API}/seller/sheets/entries")).json()
    assert sheet["total"] == 1 and sheet["rows"][0]["reference"] == "TKX1234567"
    assert (await b.get(f"{API}/seller/sheets/entries")).json()["total"] == 0

    # Confirmed is final, for the vendor and in the database.
    assert (await a.patch(f"{API}/seller/sheet-entries/{entry['id']}", json={"quantity": 3})).status_code == 409
    assert (await a.delete(f"{API}/seller/sheet-entries/{entry['id']}")).status_code == 409
    with pytest.raises(asyncpg.PostgresError):
        await db.execute("update sheet_entries set amount_cents = 1 where id = $1", uuid.UUID(entry["id"]))
    with pytest.raises(asyncpg.PostgresError):
        await db.execute("delete from audit_log")

    history = (await a.get(f"{API}/seller/sheet-entries/{entry['id']}/history")).json()
    assert [h["action"] for h in history] == ["insert", "confirmed"]
    assert history[0]["actor_id"] == str(a.id) and history[1]["actor_id"] == str(admin.id)

    # CSV: spreadsheet formulas typed by a vendor are defused.
    r = await a.get(f"{API}/seller/sheets/entries", params={"format": "csv"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "'=HYPERLINK" in r.text and "\n=HYPERLINK" not in r.text

    # Admins see every store, with the store named.
    sheet = (await admin.get(f"{API}/admin/sheets/entries")).json()
    assert sheet["columns"][0]["key"] == "store"
    assert (await actor().get(f"{API}/admin/sheets/entries")).status_code == 403


async def test_settling_with_a_store(actor, admin, db, settings_reset):
    # Big enough to beat whatever rent other tests left on the plan.
    j = await _at_door(actor, admin, db, 9, qty=5)
    seller, rider, did = j["seller"], j["rider"], j["delivery_id"]
    await pay_at_door(admin, rider, did)
    code = await db.fetchval("select handover_code from deliveries where id = $1", uuid.UUID(did))
    assert (await rider.patch(f"{API}/rider/deliveries/{did}", json={"action": "delivered", "code": code})
            ).status_code == 200
    store_id = seller.store_id

    def mine(rows):
        return next(r for r in rows if r["store_id"] == str(store_id))

    # Held for the payout interval first.
    st = mine((await admin.get(f"{API}/admin/settlements")).json())
    assert st["held_cents"] > 0 and st["books_balanced"] is True
    r = await admin.post(f"{API}/admin/settlements/{store_id}", json={"reference": "BANK-1"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "nothing_owed"

    await admin.patch(f"{API}/admin/settings", json={"payout_interval_days": 0})
    await db.execute("update ledger_entries set available_at = now() where store_id = $1", store_id)
    st = mine((await admin.get(f"{API}/admin/settlements")).json())
    owed = st["owed_cents"]
    assert owed > 0 and st["sales_cents"] > 0 and st["delivery_cents"] == 300

    # A vendor entry waiting for the admin keeps the books open.
    await seller.post(f"{API}/seller/sheet-entries", json={
        "entry_date": "2026-11-20", "kind": "expense", "description": "Bags", "amount_cents": -500,
        "reference": "RCPT-77"})
    st = mine((await admin.get(f"{API}/admin/settlements")).json())
    assert st["books_balanced"] is False and st["blockers"]
    r = await admin.post(f"{API}/admin/settlements/{store_id}", json={"reference": "BANK-1"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "books_not_balanced"
    r = await admin.post(f"{API}/admin/settlements/{store_id}", json={"reference": "BANK-1", "force": True})
    assert r.status_code == 422  # forcing needs a note
    r = await admin.post(f"{API}/admin/settlements/{store_id}",
                         json={"reference": "BANK-1", "amount_cents": owed + 1, "force": True, "note": "x"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "more_than_owed"
    r = await admin.post(f"{API}/admin/settlements/{store_id}",
                         json={"reference": "BANK-1", "force": True, "note": "Paid before the receipt check"})
    assert r.status_code == 200, r.text

    st = mine((await admin.get(f"{API}/admin/settlements")).json())
    assert st["owed_cents"] == 0 and st["paid_out_cents"] == owed
    rows = (await seller.get(f"{API}/seller/sheets/payouts")).json()["rows"]
    assert rows[0]["amount_cents"] == owed and rows[0]["reference"] == "BANK-1"
    pays = (await seller.get(f"{API}/seller/sheets/payments")).json()["rows"]
    assert pays[0]["codes"] and pays[0]["payment_status"] == "paid"
    sales = (await seller.get(f"{API}/seller/sheets/sales")).json()
    assert sales["total"] == 1 and sales["rows"][0]["quantity"] == 5
    inv = (await seller.get(f"{API}/seller/sheets/inventory")).json()
    assert inv["rows"][0]["sold"] == 5

    # Only admins settle.
    assert (await seller.post(f"{API}/admin/settlements/{store_id}", json={"reference": "x1"})).status_code == 403
    assert (await seller.get(f"{API}/admin/settlements")).status_code == 403


# ---------------------------------------------------------------------------
# Choosing what to buy
# ---------------------------------------------------------------------------


async def test_selective_checkout_keeps_the_rest_of_the_cart(actor, admin):
    seller, vid = await shop_at(actor, admin, spot(10))
    other = await add_product(seller, price=700, stock=10, title="Clay cup")
    ovid = other["variants"][0]["id"]
    buyer = actor()
    await buyer.post(f"{API}/cart/items", json={"variant_id": vid, "quantity": 3})
    cart = (await buyer.post(f"{API}/cart/items", json={"variant_id": ovid, "quantity": 2})).json()
    assert len(cart["items"]) == 2

    # Buy one of the three of the first item; everything else stays.
    r = await buyer.post(f"{API}/checkout", json={
        "items": [{"variant_id": vid, "quantity": 1}], "shipping_address": ADDRESS})
    assert r.status_code == 201, r.text
    cart = (await buyer.get(f"{API}/cart")).json()
    qty = {i["variant_id"]: i["quantity"] for i in cart["items"]}
    assert qty == {vid: 2, ovid: 2}

    # Pick lines from the cart as they are.
    line = next(i for i in cart["items"] if i["variant_id"] == ovid)
    r = await buyer.post(f"{API}/checkout", json={"cart_item_ids": [line["id"]], "shipping_address": ADDRESS})
    assert r.status_code == 201, r.text
    cart = (await buyer.get(f"{API}/cart")).json()
    assert [(i["variant_id"], i["quantity"]) for i in cart["items"]] == [(vid, 2)]

    # Someone else's cart line is not yours to buy.
    stranger = actor()
    r = await stranger.post(f"{API}/checkout", json={"cart_item_ids": [cart["items"][0]["id"]],
                                                    "shipping_address": ADDRESS})
    assert r.status_code == 404

    # Save for later moves it to the wishlist.
    r = await buyer.post(f"{API}/cart/items/{cart['items'][0]['id']}/save-for-later")
    assert r.status_code == 200 and r.json()["items"] == []
    r = await buyer.get(f"{API}/wishlist")
    assert r.status_code == 200, r.text
    wish = r.json()
    assert any(p["id"] for p in wish["items"])


async def test_status_shows_where_to_pay(admin, client, settings_reset):
    r = await admin.patch(f"{API}/admin/settings", json={"mpesa_till": "5544332", "payment_account_name": "The Bazaar"})
    assert r.status_code == 200, r.text
    pay = (await client.get(f"{API}/status")).json()["payment"]
    assert pay["mpesa_till"] == "5544332" and pay["account_name"] == "The Bazaar"
    assert (await admin.patch(f"{API}/admin/settings", json={"mpesa_till": "12ab"})).status_code == 422
    assert (await admin.patch(f"{API}/admin/settings", json={"rider_max_batch": 0})).status_code == 422
    await admin.patch(f"{API}/admin/settings", json={"mpesa_till": None})
