import re
import subprocess
import sys
from pathlib import Path

import pytest
from django.test import Client

from bazaar.api import ApiError, seg
from bazaar.tests.conftest import ACCESS, REFRESH



def test_login_page_has_strict_headers(client, backend):
    r = client.get("/account/login")
    assert r.status_code == 200
    csp = r["Content-Security-Policy"]
    assert "script-src 'self'" in csp and "unsafe-inline" not in csp and "frame-ancestors 'none'" in csp
    assert r["X-Frame-Options"] == "DENY"
    assert r["X-Content-Type-Options"] == "nosniff"
    assert "geolocation=(self)" in r["Permissions-Policy"]
    assert r["Cross-Origin-Opener-Policy"] == "same-origin"
    # Nothing inline: every script and style is a file.
    html = r.content.decode()
    assert not re.search(r"<script(?![^>]*\bsrc=)", html)
    assert "style=" not in html
    assert "<style" not in html


def test_csrf_is_enforced(backend):
    c = Client(enforce_csrf_checks=True)
    r = c.post("/account/login", {"email": "a@b.co", "password": "x"})
    assert r.status_code == 403


def test_wrong_password_is_rejected(client, backend):
    r = client.post("/account/login", {"email": "ama@example.com", "password": "nope"})
    assert r.status_code == 400
    assert b"don&#x27;t match" in r.content


def test_login_is_rate_limited(client, backend):
    for _ in range(8):
        client.post("/account/login", {"email": "ama@example.com", "password": "nope"})
    r = client.post("/account/login", {"email": "ama@example.com", "password": "correct horse"})
    assert b"Too many attempts" in r.content


def test_tokens_stay_on_the_server(signed_in):
    client = signed_in("customer")
    cookie = client.cookies["bazaar_portal"]
    assert cookie["httponly"] and cookie["samesite"] == "Lax"
    assert ACCESS not in cookie.value and REFRESH not in cookie.value
    r = client.get("/")
    body = r.content.decode()
    assert ACCESS not in body and REFRESH not in body
    assert "Good " in body and "Ama" in body
    assert r["Cache-Control"] == "no-store"


def test_open_redirect_after_login_is_blocked(client, backend):
    r = client.post("/account/login", {"email": "ama@example.com", "password": "correct horse",
                                       "next": "https://evil.example/steal"})
    assert r.status_code == 302 and r["Location"] == "/"


@pytest.mark.parametrize("path", ["/vendor/", "/rider/", "/admin/", "/admin/pricing", "/bag", "/orders"])
def test_signed_out_people_are_sent_to_login(client, backend, path):
    r = client.get(path)
    assert r.status_code == 302 and r["Location"].startswith("/account/login")


@pytest.mark.parametrize("path", ["/vendor/", "/rider/", "/admin/", "/admin/pricing"])
def test_customers_cannot_open_other_roles_pages(signed_in, path):
    client = signed_in("customer")
    r = client.get(path)
    assert r.status_code == 302 and r["Location"] == "/"


def test_role_check_on_posts_returns_403(signed_in):
    client = signed_in("customer")
    r = client.post("/admin/pricing", {"section": "fees", "standard_shipping": "1"})
    assert r.status_code == 403


def test_admin_sets_prices_in_cents(signed_in, backend):
    client = signed_in("admin")
    r = client.post("/admin/pricing", {"section": "fees", "standard_shipping": "12.50", "express_shipping": "30",
                                       "free_shipping_over": "", "rider_fee": "8.75", "tax_rate": "15"})
    assert r.status_code == 302
    patch = [b for m, p, b in backend.calls if m == "PATCH" and p == "/admin/settings"][-1]
    assert patch["standard_shipping_cents"] == 1250
    assert patch["express_shipping_cents"] == 3000
    assert patch["rider_fee_cents"] == 875
    assert patch["tax_rate"] == pytest.approx(0.15)
    page = client.get("/admin/pricing").content.decode()
    assert 'value="12.50"' in page and 'value="8.75"' in page


def test_bad_amounts_never_reach_the_api(signed_in, backend):
    client = signed_in("admin")
    client.post("/admin/pricing", {"section": "fees", "standard_shipping": "-5", "express_shipping": "1",
                                   "rider_fee": "1"})
    assert not [c for c in backend.calls if c[0] == "PATCH"]


def test_add_to_cart_with_htmx_updates_the_badge(signed_in):
    client = signed_in("customer")
    r = client.post("/bag/add", {"variant_id": "v1", "quantity": "2"}, HTTP_HX_REQUEST="true")
    html = r.content.decode()
    assert 'id="bag-count"' in html and 'hx-swap-oob="true"' in html and ">2<" in html


def test_search_partial_for_htmx(client, backend):
    r = client.get("/?q=kente", HTTP_HX_REQUEST="true")
    html = r.content.decode()
    assert "Kente scarf" in html and "GHS 45.50" in html and "<html" not in html


@pytest.mark.parametrize("bad", ["../admin", "a/b", "", "x" * 201, "..", "a%2Fb", "a b"])
def test_path_segments_cannot_escape(bad):
    with pytest.raises(ApiError):
        seg(bad)


def test_signout_needs_post_and_clears_session(signed_in):
    client = signed_in("customer")
    assert client.get("/account/logout").status_code == 405
    client.post("/account/logout")
    assert client.get("/bag").status_code == 302


def test_api_types_match_the_contract():
    root = Path(__file__).resolve().parents[2]
    out = subprocess.run([sys.executable, str(root / "scripts" / "gen_api_types.py"), "--check"], capture_output=True, text=True)
    assert out.returncode == 0, out.stdout + out.stderr


def test_checkout_buys_only_ticked_lines_and_keeps_the_rest(signed_in, backend):
    client = signed_in("customer")
    page = client.get("/checkout?picking=1&pick=l2").content.decode()
    assert "Thing 2" in page and "Thing 1" not in page and 'name="pick" value="l2"' in page
    r = client.post("/checkout", {"pick": "l2", "address_id": "a1", "shipping_method": "standard",
                                  "payment_method": "cod"})
    assert r.status_code == 302 and r["Location"] == "/orders/o1"
    order = [b for m, p, b in backend.calls if m == "POST" and p == "/checkout"][-1]
    assert order["cart_item_ids"] == ["l2"]
    # The API keeps the other lines in the bag itself; nothing is re-added.
    assert not [c for c in backend.calls if c[0] == "POST" and c[1] == "/cart/items"]


def test_checkout_with_nothing_ticked_does_not_buy_everything(signed_in, backend):
    client = signed_in("customer")
    r = client.get("/checkout?picking=1")
    assert r.status_code == 302 and r["Location"] == "/bag"


def test_checkout_without_a_choice_buys_the_whole_bag(signed_in, backend):
    client = signed_in("customer")
    client.post("/checkout", {"address_id": "a1"})
    order = [b for m, p, b in backend.calls if m == "POST" and p == "/checkout"][-1]
    assert "items" not in order and "cart_item_ids" not in order


def test_save_for_later_and_move_from_bag(signed_in, backend):
    client = signed_in("customer")
    r = client.post("/saved/toggle", {"product_id": "p1", "saved": "0"}, HTTP_HX_REQUEST="true")
    assert 'aria-pressed="true"' in r.content.decode()
    r = client.post("/saved/toggle", {"product_id": "p2", "saved": "0", "from_cart": "l2"}, HTTP_HX_REQUEST="true")
    assert ("POST", "/cart/items/l2/save-for-later", {}) in backend.calls
    assert ("POST", "/wishlist", {"product_id": "p2"}) not in backend.calls
    assert 'id="bag-count"' in r.content.decode()
    assert client.get("/saved").status_code == 200


def test_bag_lets_you_pick_lines(signed_in, backend):
    html = signed_in("customer").get("/bag").content.decode()
    assert html.count('name="pick"') == 3 and 'form="pick-form"' in html and 'name="picking"' in html


def test_rider_page_has_map_run_and_blurred_jobs(signed_in, backend):
    html = signed_in("rider").get("/rider/").content.decode()
    assert "7</span>" in html and "Gate is &lt;blue&gt;" in html            # deliveries done, buyer's note escaped
    assert 'id="open-j2"' in html and "job-blocked" in html and "Too far from the drops" in html
    assert 'data-src="/rider/map.json"' in html


def test_rider_map_feed_colours_and_route(signed_in, backend):
    data = signed_in("rider").get("/rider/map.json").json()
    kinds = {m["kind"] for m in data["markers"]}
    assert {"rider", "taken", "open"} <= kinds
    dim = [m for m in data["markers"] if m["kind"] == "open" and m["dim"]]
    assert len(dim) == 1 and len(data["route"]) == 2
    assert not any(m["kind"] == "rider" and m["label"] != "You" for m in data["markers"])  # no other riders


def test_rider_claims_several_and_stops_at_a_blocked_one(signed_in, backend):
    client = signed_in("rider")
    client.post("/rider/claim", {"job": ["j1", "j2"]})
    claims = [p for m, p, b in backend.calls if p.endswith("/claim")]
    assert claims == ["/rider/open-jobs/j1/claim", "/rider/open-jobs/j2/claim"]
    backend.calls.clear()
    client.post("/rider/claim", {"job": ["j1", "j2"], "only": "j1"})
    assert [p for m, p, b in backend.calls if p.endswith("/claim")] == ["/rider/open-jobs/j1/claim"]


def test_rider_payment_lookup_escapes_and_confirm(signed_in, backend):
    client = signed_in("rider")
    html = client.get("/rider/jobs/d1/payment?q=jan").content.decode()
    assert "&lt;b&gt;Jane" in html and 'value="rc1"' in html
    assert "at least 3" in client.get("/rider/jobs/d1/payment?q=ja").content.decode()
    client.post("/rider/jobs/d1/payment/confirm", {"receipt_id": "rc1"})
    assert ("POST", "/rider/deliveries/d1/payment", {"receipt_id": "rc1"}) in backend.calls
    r = client.post("/rider/jobs/d1/payment/confirm", {"code": "usedcode99"}, follow=True)
    assert "already been used" in r.content.decode()


def test_vendor_books_read_only_and_csv(signed_in, backend):
    client = signed_in("seller")
    html = client.get("/vendor/books?sheet=ledger&from=2026-11-01&to=bad").content.decode()
    assert "25 Nov 2026" in html and "KES 10.00" in html
    call = [c for c in backend.calls if c[1] == "/seller/sheets/ledger"][-1]
    r = client.get("/vendor/books?sheet=ledger&format=csv")
    assert r["Content-Type"].startswith("text/csv") and b"2026-11-25" in r.content
    assert client.get("/vendor/books?sheet=../../admin").status_code == 404
    assert client.get("/admin/books").status_code == 302          # a vendor can't open the admin books


def test_vendor_entry_needs_reference_and_goes_to_api_in_cents(signed_in, backend):
    client = signed_in("seller")
    client.post("/vendor/entries", {"entry_date": "2026-11-25", "kind": "sale", "description": "Market day",
                                    "amount": "12.50", "reference": ""})
    assert not [c for c in backend.calls if c[0] == "POST" and c[1] == "/seller/sheet-entries"]
    client.post("/vendor/entries", {"entry_date": "2026-11-25", "kind": "sale", "description": "Market day",
                                    "amount": "12.50", "reference": "RKT1AB2CD3"})
    body = [b for m, p, b in backend.calls if m == "POST" and p == "/seller/sheet-entries"][-1]
    assert body["amount_cents"] == 1250 and body["reference"] == "RKT1AB2CD3"


def test_admin_confirms_entry_only_with_matching_key(signed_in, backend):
    client = signed_in("admin")
    r = client.post("/admin/entries/e1", {"action": "confirm", "key": "WRONG"}, follow=True)
    assert "doesn" in r.content.decode()
    client.post("/admin/entries/e1", {"action": "confirm", "key": "RKT1AB2CD3"})
    assert ("POST", "/admin/sheet-entries/e1/confirm", {"key": "RKT1AB2CD3", "note": None}) in backend.calls


def test_admin_payments_preview_then_save(signed_in, backend):
    client = signed_in("admin")
    html = client.post("/admin/payments", {"text": "RKT1AB2CD3 Confirmed...", "commit": "0"}).content.decode()
    assert "RKT1AB2CD3" in html and "Save 1 payment" in html
    r = client.post("/admin/payments", {"text": "RKT1AB2CD3 Confirmed...", "commit": "1"})
    assert r.status_code == 302
    commits = [b["commit"] for m, p, b in backend.calls if p == "/admin/payments/import"]
    assert commits == [False, True]


def test_payout_before_books_balance_needs_force_and_note(signed_in, backend):
    client = signed_in("admin")
    r = client.post("/admin/payouts/s1", {"reference": "EARLY"}, follow=True)
    assert "Rent unpaid" in r.content.decode()
    client.post("/admin/payouts/s1", {"reference": "EARLY", "force": "1"})
    assert not [b for m, p, b in backend.calls if p == "/admin/settlements/s1" and b.get("force")]
    client.post("/admin/payouts/s1", {"reference": "EARLY", "force": "1", "note": "Agreed with owner", "amount": "100"})
    body = [b for m, p, b in backend.calls if p == "/admin/settlements/s1"][-1]
    assert body["force"] is True and body["amount_cents"] == 10000


def test_rider_rules_saved_without_blanking_others(signed_in, backend):
    client = signed_in("admin")
    client.post("/admin/pricing", {"section": "riders", "rider_commission_rate": "80", "rider_batch_radius_km": "7.5"})
    body = [b for m, p, b in backend.calls if m == "PATCH" and p == "/admin/settings"][-1]
    assert body == {"rider_commission_rate": pytest.approx(0.8), "rider_batch_radius_km": 7.5}
