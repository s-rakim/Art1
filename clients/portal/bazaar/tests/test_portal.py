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
