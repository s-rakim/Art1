"""Test harness.

Tests run against a real Postgres (the same migrations as production) with
the Supabase pieces the lockdown migration cares about faked: the anon and
authenticated roles and auth.uid(). Point TEST_DATABASE_URL at a server you
can create databases on; the suite makes a fresh database each run.
"""

import os
import subprocess
import time
import uuid
from pathlib import Path

import asyncpg
import httpx
import jwt
import pytest

ADMIN_DSN = os.environ.get("TEST_DATABASE_URL", "postgres://postgres:pg@localhost:5433/postgres")
DB_NAME = f"market_test_{uuid.uuid4().hex[:8]}"
TEST_DSN = ADMIN_DSN.rsplit("/", 1)[0] + f"/{DB_NAME}"
JWT_SECRET = "test-secret-that-is-long-enough-to-be-real-0123456789"
ROOT = Path(__file__).resolve().parents[2]

os.environ.update(
    {
        "ENVIRONMENT": "test",
        "DATABASE_URL": TEST_DSN,
        "SUPABASE_JWT_SECRET": JWT_SECRET,
        "SUPABASE_URL": "",
        "SEARCH_URL": "",
        "REDIS_URL": "",
        "PAYMENT_PROVIDER": "manual",
        "CORS_ORIGINS": "https://shop.example.com",
        "RATE_LIMIT_IP": "100000",
        "RATE_LIMIT_SENSITIVE": "1000",
        "RATE_LIMIT_RIDER_LOCATION": "1000",
        "MAX_BODY_BYTES": "200000",
    }
)

FAKE_SUPABASE = """
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as
  $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- Supabase grants everything on public to these roles by default.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
"""


@pytest.fixture(scope="session")
async def database():
    admin = await asyncpg.connect(ADMIN_DSN)
    await admin.execute(f'create database "{DB_NAME}"')
    await admin.close()
    conn = await asyncpg.connect(TEST_DSN)
    await conn.execute(FAKE_SUPABASE)
    await conn.close()
    subprocess.run(
        [str(ROOT / "scripts" / "migrate.sh")],
        env={**os.environ, "DATABASE_URL": TEST_DSN},
        check=True,
        capture_output=True,
    )
    yield TEST_DSN
    admin = await asyncpg.connect(ADMIN_DSN)
    await admin.execute(f'drop database if exists "{DB_NAME}" with (force)')
    await admin.close()


@pytest.fixture(scope="session")
async def app(database):
    from app.main import app as fastapi_app

    async with fastapi_app.router.lifespan_context(fastapi_app):
        yield fastapi_app


@pytest.fixture(scope="session")
async def client(app):
    transport = httpx.ASGITransport(app=app, client=("203.0.113.7", 4321))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture(scope="session")
async def db(database):
    conn = await asyncpg.connect(database)
    yield conn
    await conn.close()


def make_token(user_id: uuid.UUID, email: str | None = None, key: str = JWT_SECRET, alg: str = "HS256",
               **overrides) -> str:
    now = int(time.time())
    claims = {
        "sub": str(user_id),
        "email": email or f"{user_id.hex[:8]}@example.com",
        "aud": "authenticated",
        "role": "authenticated",
        "iat": now,
        "exp": now + 3600,
        "aal": "aal1",
        "user_metadata": {"full_name": "Test Person"},
    }
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm=alg)


class Actor:
    """A signed in person with their own headers."""

    def __init__(self, client: httpx.AsyncClient, name: str = "Test Person"):
        self.id = uuid.uuid4()
        self.email = f"{self.id.hex[:10]}@example.com"
        self.client = client
        self.headers = {"Authorization": f"Bearer {make_token(self.id, self.email, user_metadata={'full_name': name})}"}

    async def get(self, url, **kw):
        return await self.client.get(url, headers=self.headers, **kw)

    async def post(self, url, json=None, **kw):
        return await self.client.post(url, headers=self.headers, json=json, **kw)

    async def patch(self, url, json=None, **kw):
        return await self.client.patch(url, headers=self.headers, json=json, **kw)

    async def delete(self, url, **kw):
        return await self.client.delete(url, headers=self.headers, **kw)


API = "/api/v1"


@pytest.fixture
def actor(client):
    def _make(name: str = "Test Person") -> Actor:
        return Actor(client, name)

    return _make


@pytest.fixture
async def admin(actor, db):
    a = actor("Ada Admin")
    r = await a.get(f"{API}/me")
    assert r.status_code == 200
    await db.execute("update profiles set role = 'admin' where id = $1", a.id)
    return a


async def open_store(actor_factory, admin: Actor, plan: str = "starter", name: str | None = None) -> Actor:
    seller = actor_factory("Sam Seller")
    r = await seller.post(
        f"{API}/seller/applications",
        json={
            "store_name": name or f"Shop {seller.id.hex[:6]}",
            "country": "GH",
            "support_email": "help@example.com",
            "plan_code": plan,
            "business": {"legal_name": "Sam Trading Ltd", "tax_id": "TX-1"},
        },
    )
    assert r.status_code == 201, r.text
    store_id = r.json()["id"]
    r = await admin.patch(f"{API}/admin/stores/{store_id}", json={"status": "active"})
    assert r.status_code == 200, r.text
    r = await seller.patch(f"{API}/seller/me", json={"pickup": {"lat": 5.6037, "lng": -0.1870, "label": "Osu shop"}})
    assert r.status_code == 200, r.text
    seller.store_id = store_id
    return seller


async def add_product(seller: Actor, price: int = 2500, stock: int = 10, **extra) -> dict:
    body = {
        "title": extra.pop("title", "Linen summer dress"),
        "description": "Breathable linen, relaxed fit.",
        "brand": "Osu Atelier",
        "status": "active",
        "tags": ["linen", "summer"],
        "variants": [
            {
                "sku": f"SKU-{uuid.uuid4().hex[:8]}",
                "title": "M / Sand",
                "options": {"size": "M", "colour": "Sand"},
                "price_cents": price,
                "stock": stock,
                "tier_prices": [{"min_qty": 5, "price_cents": price - 500}],
            }
        ],
        "images": [{"url": "https://images.example.com/dress.jpg", "alt": "Dress"}],
    }
    body.update(extra)
    r = await seller.post(f"{API}/seller/products", json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def hire_rider(actor_factory, admin: Actor, lat=5.61, lng=-0.18) -> Actor:
    rider = actor_factory("Kofi Rider")
    r = await rider.post(
        f"{API}/rider/applications",
        json={"full_name": "Kofi Mensah", "phone": "+233 20 123 4567", "city": "Accra", "vehicle": "motorbike"},
    )
    assert r.status_code == 201, r.text
    r = await admin.patch(f"{API}/admin/riders/{rider.id}", json={"status": "active"})
    assert r.status_code == 200, r.text
    r = await rider.post(f"{API}/rider/location", json={"lat": lat, "lng": lng, "accuracy_m": 8})
    assert r.status_code == 200, r.text
    return rider


ADDRESS = {
    "full_name": "Ama Buyer",
    "line1": "12 Ring Road",
    "city": "Accra",
    "country": "GH",
    "phone": "+233 24 000 0000",
    "lat": 5.56,
    "lng": -0.20,
}
