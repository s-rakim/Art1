"""The signed in shopper: profile, addresses, wishlist."""

import uuid
from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, Response

from .. import schemas as s
from ..auth import CurrentUser
from ..common import CARD_SELECT, VISIBLE, Paging, card, paging
from ..db import get_conn
from ..errors import ApiError, not_found

router = APIRouter(tags=["me"])
Conn = Annotated[asyncpg.Connection, Depends(get_conn)]

ADDRESS_COLS = "id, label, full_name, line1, line2, city, region, postal_code, country, phone, lat, lng, is_default"
MAX_ADDRESSES = 20
MAX_WISHLIST = 500


async def _me(conn: asyncpg.Connection, user_id: uuid.UUID) -> dict:
    p = await conn.fetchrow("select id, email, full_name, avatar_url, role from profiles where id = $1", user_id)
    store = await conn.fetchrow("select id, slug, name, status from stores where owner_id = $1", user_id)
    return {**dict(p), "store": dict(store) if store else None}


@router.get("/me", response_model=s.Me)
async def get_me(user: CurrentUser, conn: Conn):
    return await _me(conn, user.id)


@router.patch("/me", response_model=s.Me)
async def update_me(body: s.MeUpdate, user: CurrentUser, conn: Conn):
    data = body.model_dump(exclude_unset=True)
    if data:
        await conn.execute(
            "update profiles set full_name = coalesce($2, full_name), avatar_url = coalesce($3, avatar_url) where id = $1",
            user.id,
            data.get("full_name"),
            data.get("avatar_url"),
        )
    return await _me(conn, user.id)


# ---------------------------------------------------------------------------
# Addresses
# ---------------------------------------------------------------------------


@router.get("/me/addresses", response_model=list[s.Address])
async def list_addresses(user: CurrentUser, conn: Conn):
    recs = await conn.fetch(
        f"select {ADDRESS_COLS} from addresses where user_id = $1 order by is_default desc, created_at", user.id
    )
    return [dict(r) for r in recs]


@router.post("/me/addresses", response_model=s.Address, status_code=201)
async def add_address(body: s.AddressIn, user: CurrentUser, conn: Conn):
    async with conn.transaction():
        count = await conn.fetchval("select count(*) from addresses where user_id = $1", user.id)
        if count >= MAX_ADDRESSES:
            raise ApiError(409, "too_many_addresses", "You have saved the maximum number of addresses.")
        make_default = body.is_default or count == 0
        if make_default:
            await conn.execute("update addresses set is_default = false where user_id = $1", user.id)
        rec = await conn.fetchrow(
            f"""insert into addresses (user_id, label, full_name, line1, line2, city, region, postal_code,
                                       country, phone, is_default, lat, lng)
                values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                returning {ADDRESS_COLS}""",
            user.id, body.label, body.full_name, body.line1, body.line2, body.city, body.region,
            body.postal_code, body.country, body.phone, make_default, body.lat, body.lng,
        )
    return dict(rec)


@router.patch("/me/addresses/{address_id}", response_model=s.Address)
async def update_address(address_id: uuid.UUID, body: s.AddressUpdate, user: CurrentUser, conn: Conn):
    data = body.model_dump(exclude_unset=True)
    async with conn.transaction():
        current = await conn.fetchrow(
            f"select {ADDRESS_COLS} from addresses where id = $1 and user_id = $2 for update", address_id, user.id
        )
        if current is None:
            raise not_found("address")
        nullable = ("label", "line2", "region", "postal_code", "phone", "lat", "lng")
        merged = {**dict(current), **{k: v for k, v in data.items() if v is not None or k in nullable}}
        if data.get("is_default"):
            await conn.execute("update addresses set is_default = false where user_id = $1", user.id)
        rec = await conn.fetchrow(
            f"""update addresses set label = $3, full_name = $4, line1 = $5, line2 = $6, city = $7,
                       region = $8, postal_code = $9, country = $10, phone = $11, is_default = $12,
                       lat = $13, lng = $14
                 where id = $1 and user_id = $2 returning {ADDRESS_COLS}""",
            address_id, user.id, merged["label"], merged["full_name"], merged["line1"], merged["line2"],
            merged["city"], merged["region"], merged["postal_code"], merged["country"], merged["phone"],
            bool(merged["is_default"]), merged["lat"], merged["lng"],
        )
    return dict(rec)


@router.delete("/me/addresses/{address_id}", status_code=204)
async def delete_address(address_id: uuid.UUID, user: CurrentUser, conn: Conn):
    done = await conn.execute("delete from addresses where id = $1 and user_id = $2", address_id, user.id)
    if done.endswith(" 0"):
        raise not_found("address")
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Wishlist
# ---------------------------------------------------------------------------


@router.get("/wishlist", response_model=s.Page[s.ProductCard])
async def wishlist(user: CurrentUser, conn: Conn, pg: Annotated[Paging, Depends(paging)]):
    total = await conn.fetchval("select count(*) from wishlist_items where user_id = $1", user.id)
    recs = await conn.fetch(
        CARD_SELECT
        + f""" join wishlist_items w on w.product_id = p.id and w.user_id = $1
              where {VISIBLE} order by w.created_at desc limit $2 offset $3""",
        user.id,
        pg.page_size,
        pg.offset,
    )
    return pg.wrap([card(r) for r in recs], total)


@router.post("/wishlist", response_model=s.Message, status_code=201)
async def add_to_wishlist(body: s.WishlistIn, user: CurrentUser, conn: Conn):
    ok = await conn.fetchval(
        f"select 1 from products p join stores s on s.id = p.store_id where p.id = $1 and {VISIBLE}",
        body.product_id,
    )
    if not ok:
        raise not_found("product")
    count = await conn.fetchval("select count(*) from wishlist_items where user_id = $1", user.id)
    if count >= MAX_WISHLIST:
        raise ApiError(409, "wishlist_full", "Your wishlist is full.")
    await conn.execute(
        "insert into wishlist_items (user_id, product_id) values ($1, $2) on conflict do nothing",
        user.id,
        body.product_id,
    )
    return {"ok": True}


@router.delete("/wishlist/{product_id}", status_code=204)
async def remove_from_wishlist(product_id: uuid.UUID, user: CurrentUser, conn: Conn):
    await conn.execute("delete from wishlist_items where user_id = $1 and product_id = $2", user.id, product_id)
    return Response(status_code=204)
