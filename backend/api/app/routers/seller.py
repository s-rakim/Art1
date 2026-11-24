"""Everything a retailer renting space on the marketplace does.

Every query in here is scoped by the caller's own store id, which comes from
the database (stores.owner_id = the signed in user), never from the request.
"""

import secrets
import uuid
from datetime import date, timedelta
from typing import Annotated, Literal

import asyncpg
import httpx
from fastapi import APIRouter, Depends, Query, Response

from .. import schemas as s
from ..auth import CurrentUser, User
from ..common import Paging, paging, slugify, unique_suffix
from ..config import Settings, get_settings
from ..db import get_conn
from ..errors import ApiError, forbidden, not_found
from ..geo import eta_minutes, haversine_km
from ..realtime import publish
from ..security import sensitive_limit

router = APIRouter(prefix="/seller", tags=["seller"])
Conn = Annotated[asyncpg.Connection, Depends(get_conn)]
Cfg = Annotated[Settings, Depends(get_settings)]


# ---------------------------------------------------------------------------
# Who is this seller?
# ---------------------------------------------------------------------------


class SellerCtx:
    def __init__(self, user: User, store: asyncpg.Record):
        self.user = user
        self.store = store
        self.store_id: uuid.UUID = store["id"]
        self.active: bool = store["status"] == "active"


async def seller_ctx(user: CurrentUser, conn: Conn) -> SellerCtx:
    store = await conn.fetchrow(
        "select id, status, plan_id, currency from stores s, lateral (select currency from store_plans where id = s.plan_id) c where owner_id = $1",
        user.id,
    )
    if store is None:
        raise ApiError(403, "no_store", "You don't have a store yet. Apply to open one first.")
    if store["status"] in ("suspended", "rejected"):
        raise forbidden(f"Your store is {store['status']}. Contact support.")
    return SellerCtx(user, store)


async def active_seller(ctx: Annotated[SellerCtx, Depends(seller_ctx)]) -> SellerCtx:
    if not ctx.active or ctx.user.role != "seller":
        raise ApiError(403, "store_not_approved", "Your store is still waiting for approval.")
    return ctx


Seller = Annotated[SellerCtx, Depends(seller_ctx)]
ActiveSeller = Annotated[SellerCtx, Depends(active_seller)]


# ---------------------------------------------------------------------------
# Applying for space
# ---------------------------------------------------------------------------


@router.post("/applications", response_model=s.MyStoreRef, status_code=201, dependencies=[sensitive_limit("apply")])
async def apply(body: s.StoreApplicationIn, user: CurrentUser, conn: Conn):
    if not await conn.fetchval("select vendor_signups_open from app_settings"):
        raise ApiError(403, "signups_closed", "We aren't taking new stores right now.")
    if user.role in ("rider", "admin") or await conn.fetchval(
        "select 1 from riders where id = $1 and status in ('applicant', 'active')", user.id
    ):
        raise ApiError(409, "role_conflict", "Riders and admins can't also run a store. Use a separate account.")
    async with conn.transaction():
        if await conn.fetchval("select 1 from stores where owner_id = $1", user.id):
            raise ApiError(409, "already_applied", "You already have a store.")
        plan_id = await conn.fetchval(
            "select id from store_plans where code = $1 and is_active", body.plan_code
        )
        if plan_id is None:
            raise ApiError(422, "unknown_plan", "That plan does not exist.")

        slug = body.slug or slugify(body.store_name, 40)
        if await conn.fetchval("select 1 from stores where slug = $1", slug):
            if body.slug:
                raise ApiError(409, "slug_taken", "That store address is taken.")
            slug = f"{slug}-{unique_suffix()}"

        application = {
            "business": body.business.model_dump(),
            "message": body.message,
        }
        rec = await conn.fetchrow(
            """insert into stores (owner_id, slug, name, tagline, description, country, support_email,
                                   plan_id, application)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
               returning id, slug, name, status""",
            user.id, slug, body.store_name, body.tagline, body.description, body.country,
            str(body.support_email), plan_id, application,
        )
    return dict(rec)


# ---------------------------------------------------------------------------
# My store
# ---------------------------------------------------------------------------


async def _balance(conn: asyncpg.Connection, store_id: uuid.UUID, currency: str) -> dict:
    b = await conn.fetchrow("select * from store_balances where store_id = $1", store_id)
    return {
        "balance_cents": int(b["balance_cents"]),
        "available_cents": int(b["available_cents"]),
        "pending_cents": int(b["pending_cents"]),
        "currency": currency,
    }


@router.get("/me", response_model=s.SellerMe)
async def seller_me(ctx: Seller, conn: Conn):
    st = await conn.fetchrow(
        """select s.id, s.slug, s.name, s.tagline, s.description, s.logo_url, s.banner_url, s.banner_color,
                  s.accent_color, s.country, s.support_email, s.rating_avg::float as rating,
                  s.rating_count as review_count, s.created_at, s.status, s.review_note,
                  s.pickup_address, s.pickup_lat, s.pickup_lng,
                  (select count(*) from products p where p.store_id = s.id and p.status = 'active')::int as product_count
             from stores s where s.id = $1""",
        ctx.store_id,
    )
    plan = await conn.fetchrow(
        """select id, code, name, description, monthly_price_cents, currency, commission_rate::float,
                  per_item_fee_cents, product_limit, featured_slots, features
             from store_plans where id = $1""",
        st and ctx.store["plan_id"],
    )
    sub = await conn.fetchrow(
        """select status, current_period_start, current_period_end, cancel_at_period_end
             from store_subscriptions where store_id = $1 and status <> 'canceled'""",
        ctx.store_id,
    )
    return {
        "store": dict(st),
        "plan": dict(plan),
        "subscription": dict(sub) if sub else None,
        "balance": await _balance(conn, ctx.store_id, plan["currency"]),
        "product_limit": plan["product_limit"],
        "active_products": st["product_count"],
    }


@router.patch("/me", response_model=s.SellerMe)
async def update_store(body: s.StoreUpdate, ctx: Seller, conn: Conn):
    data = body.model_dump(exclude_unset=True)
    if "support_email" in data and data["support_email"] is not None:
        data["support_email"] = str(data["support_email"])
    pickup = data.pop("pickup", None)
    if pickup is not None:
        await conn.execute(
            "update stores set pickup_lat = $2, pickup_lng = $3, pickup_address = $4::jsonb where id = $1",
            ctx.store_id, pickup["lat"], pickup["lng"],
            {k: pickup.get(k) for k in ("label", "line1", "city")},
        )
    if data:
        # Column names come from the model's fixed field list, not the client.
        cols = [k for k in s.StoreUpdate.model_fields if k in data and k != "pickup"]
        sets = ", ".join(f"{c} = ${i + 2}" for i, c in enumerate(cols))
        await conn.execute(f"update stores set {sets} where id = $1", ctx.store_id, *[data[c] for c in cols])
    return await seller_me(ctx, conn)


@router.post("/plan", response_model=s.SellerMe)
async def change_plan(body: s.PlanChangeIn, ctx: ActiveSeller, conn: Conn):
    """Switch plan. The new rent applies from the next billing date; the
    commission rate applies to orders placed from now on."""
    async with conn.transaction():
        plan = await conn.fetchrow(
            "select id, product_limit from store_plans where code = $1 and is_active", body.plan_code
        )
        if plan is None:
            raise ApiError(422, "unknown_plan", "That plan does not exist.")
        if plan["product_limit"] is not None:
            live = await conn.fetchval(
                "select count(*) from products where store_id = $1 and status = 'active'", ctx.store_id
            )
            if live > plan["product_limit"]:
                raise ApiError(
                    409, "over_product_limit",
                    f"That plan allows {plan['product_limit']} live products and you have {live}. Unpublish some first.",
                )
        await conn.execute("update stores set plan_id = $2 where id = $1", ctx.store_id, plan["id"])
        await conn.execute(
            """update store_subscriptions set plan_id = $2, cancel_at_period_end = $3
                where store_id = $1 and status <> 'canceled'""",
            ctx.store_id, plan["id"], body.cancel_at_period_end,
        )
    ctx.store = await conn.fetchrow(
        "select id, status, plan_id, (select currency from store_plans where id = plan_id) as currency from stores where id = $1",
        ctx.store_id,
    )
    return await seller_me(ctx, conn)


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------


async def _check_limit(conn: asyncpg.Connection, ctx: SellerCtx, adding: int = 1, exclude: uuid.UUID | None = None):
    limit = await conn.fetchval("select product_limit from store_plans where id = $1", ctx.store["plan_id"])
    if limit is None:
        return
    live = await conn.fetchval(
        "select count(*) from products where store_id = $1 and status = 'active' and ($2::uuid is null or id <> $2)",
        ctx.store_id,
        exclude,
    )
    if live + adding > limit:
        raise ApiError(409, "product_limit", f"Your plan allows {limit} live products. Upgrade to list more.")


async def _check_category(conn: asyncpg.Connection, category_id: uuid.UUID | None):
    if category_id and not await conn.fetchval("select 1 from categories where id = $1", category_id):
        raise ApiError(422, "unknown_category", "That category does not exist.")


def _validate_variant_prices(price: int | None, compare_at: int | None, tiers: list | None):
    if compare_at is not None and price is not None and compare_at <= price:
        raise ApiError(422, "bad_compare_at", "The original price must be higher than the sale price.")
    if tiers:
        qtys = [t["min_qty"] for t in tiers]
        if len(set(qtys)) != len(qtys):
            raise ApiError(422, "bad_tiers", "Each volume tier needs a different minimum quantity.")
        if price is not None and any(t["price_cents"] > price for t in tiers):
            raise ApiError(422, "bad_tiers", "Volume prices can't be higher than the base price.")


async def _seller_product(conn: asyncpg.Connection, store_id: uuid.UUID, product_id: uuid.UUID) -> dict:
    p = await conn.fetchrow(
        """select id, slug, title, description, brand, category_id, status, attributes, tags, currency,
                  min_price_cents as price_cents, rating_avg::float as rating, rating_count as review_count,
                  sold_count, created_at, updated_at
             from products where id = $1 and store_id = $2""",
        product_id,
        store_id,
    )
    if p is None:
        raise not_found("product")
    variants = await conn.fetch(
        """select id, sku, title, options, price_cents, compare_at_cents, stock, stock > 0 as in_stock,
                  min_order_qty, tier_prices, is_active, weight_grams
             from product_variants where product_id = $1 order by created_at""",
        product_id,
    )
    images = await conn.fetch("select id, url, alt from product_images where product_id = $1 order by sort", product_id)
    return {**dict(p), "variants": [dict(v) for v in variants], "images": [dict(i) for i in images]}


async def _insert_variant(conn: asyncpg.Connection, product_id: uuid.UUID, v: s.VariantIn):
    tiers = [t.model_dump() for t in v.tier_prices]
    _validate_variant_prices(v.price_cents, v.compare_at_cents, tiers)
    await conn.execute(
        """insert into product_variants (product_id, sku, title, options, price_cents, compare_at_cents, stock,
                                         min_order_qty, tier_prices, weight_grams, is_active)
           values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9::jsonb, $10, $11)""",
        product_id, v.sku, v.title, v.options, v.price_cents, v.compare_at_cents, v.stock,
        v.min_order_qty, tiers, v.weight_grams, v.is_active,
    )


async def _replace_images(conn: asyncpg.Connection, product_id: uuid.UUID, images: list[s.ImageIn]):
    await conn.execute("delete from product_images where product_id = $1", product_id)
    for i, img in enumerate(images):
        await conn.execute(
            "insert into product_images (product_id, url, alt, sort) values ($1, $2, $3, $4)",
            product_id, img.url, img.alt, i,
        )


@router.get("/products", response_model=s.Page[s.SellerProductRow])
async def my_products(
    ctx: Seller,
    conn: Conn,
    pg: Annotated[Paging, Depends(paging)],
    status: Literal["draft", "active", "archived", "blocked"] | None = None,
    q: Annotated[str | None, Query(max_length=120)] = None,
):
    cond, args = ["p.store_id = $1"], [ctx.store_id]
    if status:
        args.append(status)
        cond.append(f"p.status = ${len(args)}")
    if q and q.strip():
        args.append(q.strip().replace("%", "").replace("_", ""))
        cond.append(f"p.title ilike '%' || ${len(args)} || '%'")
    where = " and ".join(cond)
    total = await conn.fetchval(f"select count(*) from products p where {where}", *args)
    recs = await conn.fetch(
        f"""select p.id, p.slug, p.title, p.status, p.min_price_cents as price_cents, p.sold_count, p.updated_at,
                   (select url from product_images i where i.product_id = p.id order by sort limit 1) as image_url,
                   (select coalesce(sum(stock), 0) from product_variants v where v.product_id = p.id)::int as stock
              from products p where {where} order by p.updated_at desc
             limit {pg.page_size} offset {pg.offset}""",
        *args,
    )
    return pg.wrap([dict(r) for r in recs], total)


@router.post("/products", response_model=s.SellerProduct, status_code=201)
async def create_product(body: s.ProductIn, ctx: Seller, conn: Conn):
    if body.status == "active" and not ctx.active:
        raise ApiError(403, "store_not_approved", "You can save drafts now and publish once your store is approved.")
    skus = [v.sku for v in body.variants]
    if len(set(skus)) != len(skus):
        raise ApiError(422, "duplicate_sku", "Each variant needs its own SKU.")
    async with conn.transaction():
        await _check_category(conn, body.category_id)
        if body.status == "active":
            await _check_limit(conn, ctx)
        currency = await conn.fetchval("select currency from store_plans where id = $1", ctx.store["plan_id"])
        slug = f"{slugify(body.title)}-{unique_suffix()}"
        pid = await conn.fetchval(
            """insert into products (store_id, category_id, slug, title, description, brand, status,
                                     attributes, tags, currency)
               values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10) returning id""",
            ctx.store_id, body.category_id, slug, body.title, body.description, body.brand, body.status,
            body.attributes, body.tags, currency,
        )
        for v in body.variants:
            await _insert_variant(conn, pid, v)
        await _replace_images(conn, pid, body.images)
    return await _seller_product(conn, ctx.store_id, pid)


@router.get("/products/{product_id}", response_model=s.SellerProduct)
async def get_my_product(product_id: uuid.UUID, ctx: Seller, conn: Conn):
    return await _seller_product(conn, ctx.store_id, product_id)


@router.patch("/products/{product_id}", response_model=s.SellerProduct)
async def update_product(product_id: uuid.UUID, body: s.ProductUpdate, ctx: Seller, conn: Conn):
    data = body.model_dump(exclude_unset=True)
    async with conn.transaction():
        current = await conn.fetchrow(
            "select status from products where id = $1 and store_id = $2 for update", product_id, ctx.store_id
        )
        if current is None:
            raise not_found("product")
        if current["status"] == "blocked":
            raise ApiError(403, "product_blocked", "This product was taken down by the marketplace.")
        if data.get("status") == "active":
            if not ctx.active:
                raise ApiError(403, "store_not_approved", "Your store is still waiting for approval.")
            if current["status"] != "active":
                await _check_limit(conn, ctx, exclude=product_id)
            if not await conn.fetchval(
                "select 1 from product_variants where product_id = $1 and is_active", product_id
            ):
                raise ApiError(422, "no_variants", "Add at least one active variant before publishing.")
        if "category_id" in data:
            await _check_category(conn, data["category_id"])

        images = data.pop("images", None)
        fields = {k: v for k, v in data.items() if k in ("title", "description", "brand", "category_id",
                                                          "status", "attributes", "tags")}
        if fields:
            for required in ("title", "description", "attributes", "tags", "status"):
                if required in fields and fields[required] is None:
                    raise ApiError(422, "invalid_value", f"{required} can't be empty.")
            cols = list(fields)
            casts = {"attributes": "::jsonb"}
            sets = ", ".join(f"{c} = ${i + 3}{casts.get(c, '')}" for i, c in enumerate(cols))
            await conn.execute(
                f"update products set {sets} where id = $1 and store_id = $2",
                product_id, ctx.store_id, *[fields[c] for c in cols],
            )
        if images is not None:
            await _replace_images(conn, product_id, body.images or [])
    return await _seller_product(conn, ctx.store_id, product_id)


@router.delete("/products/{product_id}", status_code=204)
async def delete_product(product_id: uuid.UUID, ctx: Seller, conn: Conn):
    """Products that have been ordered are archived, not deleted, so order
    history keeps its links."""
    async with conn.transaction():
        exists = await conn.fetchval(
            "select 1 from products where id = $1 and store_id = $2 for update", product_id, ctx.store_id
        )
        if not exists:
            raise not_found("product")
        ordered = await conn.fetchval("select 1 from order_items where product_id = $1 limit 1", product_id)
        if ordered:
            await conn.execute(
                "update products set status = 'archived' where id = $1 and store_id = $2 and status <> 'blocked'",
                product_id, ctx.store_id,
            )
        else:
            await conn.execute("delete from products where id = $1 and store_id = $2", product_id, ctx.store_id)
    return Response(status_code=204)


async def _own_variant(conn: asyncpg.Connection, store_id: uuid.UUID, variant_id: uuid.UUID) -> asyncpg.Record:
    v = await conn.fetchrow(
        """select v.id, v.product_id, v.price_cents, v.compare_at_cents, v.tier_prices
             from product_variants v join products p on p.id = v.product_id
            where v.id = $1 and p.store_id = $2 for update of v""",
        variant_id,
        store_id,
    )
    if v is None:
        raise not_found("variant")
    return v


@router.post("/products/{product_id}/variants", response_model=s.SellerProduct, status_code=201)
async def add_variant(product_id: uuid.UUID, body: s.VariantIn, ctx: Seller, conn: Conn):
    async with conn.transaction():
        count = await conn.fetchval(
            """select count(*) from product_variants v join products p on p.id = v.product_id
                where p.id = $1 and p.store_id = $2""",
            product_id, ctx.store_id,
        )
        owned = await conn.fetchval("select 1 from products where id = $1 and store_id = $2", product_id, ctx.store_id)
        if not owned:
            raise not_found("product")
        if count >= 100:
            raise ApiError(409, "too_many_variants", "A product can have at most 100 variants.")
        await _insert_variant(conn, product_id, body)
    return await _seller_product(conn, ctx.store_id, product_id)


@router.patch("/variants/{variant_id}", response_model=s.SellerProduct)
async def update_variant(variant_id: uuid.UUID, body: s.VariantUpdate, ctx: Seller, conn: Conn):
    data = body.model_dump(exclude_unset=True)
    async with conn.transaction():
        v = await _own_variant(conn, ctx.store_id, variant_id)
        if "tier_prices" in data and data["tier_prices"] is None:
            data["tier_prices"] = []
        for required in ("title", "options", "price_cents", "stock", "min_order_qty", "is_active"):
            if required in data and data[required] is None:
                raise ApiError(422, "invalid_value", f"{required} can't be empty.")
        price = data.get("price_cents", v["price_cents"])
        compare_at = data["compare_at_cents"] if "compare_at_cents" in data else v["compare_at_cents"]
        tiers = data["tier_prices"] if "tier_prices" in data else v["tier_prices"]
        _validate_variant_prices(price, compare_at, tiers)
        if data:
            cols = [k for k in s.VariantUpdate.model_fields if k in data]
            casts = {"options": "::jsonb", "tier_prices": "::jsonb"}
            sets = ", ".join(f"{c} = ${i + 2}{casts.get(c, '')}" for i, c in enumerate(cols))
            await conn.execute(f"update product_variants set {sets} where id = $1", variant_id, *[data[c] for c in cols])
    return await _seller_product(conn, ctx.store_id, v["product_id"])


@router.delete("/variants/{variant_id}", response_model=s.SellerProduct)
async def delete_variant(variant_id: uuid.UUID, ctx: Seller, conn: Conn):
    async with conn.transaction():
        v = await _own_variant(conn, ctx.store_id, variant_id)
        remaining = await conn.fetchval(
            "select count(*) from product_variants where product_id = $1 and id <> $2", v["product_id"], variant_id
        )
        if remaining == 0:
            raise ApiError(409, "last_variant", "A product needs at least one variant.")
        ordered = await conn.fetchval("select 1 from order_items where variant_id = $1 limit 1", variant_id)
        if ordered:
            await conn.execute("update product_variants set is_active = false where id = $1", variant_id)
        else:
            await conn.execute("delete from product_variants where id = $1", variant_id)
    return await _seller_product(conn, ctx.store_id, v["product_id"])


# ---------------------------------------------------------------------------
# Image uploads (Supabase Storage signed upload URLs)
# ---------------------------------------------------------------------------


@router.post("/uploads", response_model=s.UploadOut, dependencies=[sensitive_limit("upload")])
async def create_upload(body: s.UploadIn, ctx: Seller, settings: Cfg):
    if not (settings.supabase_url and settings.supabase_service_role_key):
        raise ApiError(503, "uploads_disabled", "Image uploads are not configured on this server.")
    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif"}[body.content_type]
    # The path is ours, not the client's: no traversal, no overwriting
    # someone else's file, one folder per store.
    path = f"stores/{ctx.store_id}/{uuid.uuid4().hex}.{ext}"
    base = settings.supabase_url.rstrip("/")
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{base}/storage/v1/object/upload/sign/{settings.storage_bucket}/{path}",
            headers={
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "apikey": settings.supabase_service_role_key,
            },
            json={},
        )
    if resp.status_code >= 300:
        raise ApiError(502, "upload_failed", "Could not prepare the upload. Try again.")
    signed = resp.json().get("url", "")
    return {
        "upload_url": f"{base}/storage/v1{signed}",
        "public_url": f"{base}/storage/v1/object/public/{settings.storage_bucket}/{path}",
        "path": path,
    }


# ---------------------------------------------------------------------------
# Orders to fulfil
# ---------------------------------------------------------------------------

_NEXT_STATUS = {
    "pending": set(),  # not paid yet: nothing to do
    "processing": {"shipped"},
    "shipped": {"delivered"},
    "delivered": set(),
    "canceled": set(),
    "returned": set(),
}


async def _store_order(conn: asyncpg.Connection, store_id: uuid.UUID, so_id: uuid.UUID) -> dict:
    so = await conn.fetchrow(
        """select so.*, o.number as order_number, o.currency, so.payment_status = 'paid' as paid,
                  o.payment_method, o.shipping_address as ship_to
             from store_orders so join orders o on o.id = so.order_id
            where so.id = $1 and so.store_id = $2""",
        so_id,
        store_id,
    )
    if so is None:
        raise not_found("order")
    items = await conn.fetch(
        """select oi.id, oi.product_id, p.slug as product_slug, oi.variant_id, oi.title, oi.variant_title, oi.sku,
                  oi.image_url, oi.unit_price_cents, oi.quantity, oi.line_total_cents
             from order_items oi left join products p on p.id = oi.product_id
            where oi.store_order_id = $1""",
        so_id,
    )
    delivery = await conn.fetchrow(
        """select d.id, d.status, split_part(r.full_name, ' ', 1) as rider_name, r.vehicle as rider_vehicle,
                  d.assigned_at, d.picked_up_at, d.delivered_at, d.note
             from deliveries d join riders r on r.id = d.rider_id
            where d.store_order_id = $1 order by d.assigned_at desc limit 1""",
        so_id,
    )
    d = dict(so)
    if not d["paid"] and d["payment_method"] != "cod":
        # The buyer's address is only shown once there is something to ship.
        d["ship_to"] = {"country": (d["ship_to"] or {}).get("country")}
    return {**d, "items": [dict(i) for i in items], "delivery": dict(delivery) if delivery else None}


@router.get("/orders", response_model=s.Page[s.StoreOrder])
async def seller_orders(
    ctx: Seller,
    conn: Conn,
    pg: Annotated[Paging, Depends(paging)],
    status: Literal["pending", "processing", "shipped", "delivered", "canceled", "returned"] | None = None,
):
    cond, args = "so.store_id = $1", [ctx.store_id]
    if status:
        cond += " and so.status = $2"
        args.append(status)
    total = await conn.fetchval(f"select count(*) from store_orders so where {cond}", *args)
    ids = await conn.fetch(
        f"select so.id from store_orders so where {cond} order by so.created_at desc limit {pg.page_size} offset {pg.offset}",
        *args,
    )
    items = [await _store_order(conn, ctx.store_id, r["id"]) for r in ids]
    return pg.wrap(items, total)


@router.get("/orders/{store_order_id}", response_model=s.StoreOrder)
async def seller_order(store_order_id: uuid.UUID, ctx: Seller, conn: Conn):
    return await _store_order(conn, ctx.store_id, store_order_id)


@router.patch("/orders/{store_order_id}", response_model=s.StoreOrder)
async def update_seller_order(store_order_id: uuid.UUID, body: s.StoreOrderUpdate, ctx: ActiveSeller, conn: Conn):
    async with conn.transaction():
        so = await conn.fetchrow(
            "select status from store_orders where id = $1 and store_id = $2 for update", store_order_id, ctx.store_id
        )
        if so is None:
            raise not_found("order")
        if body.status and body.status != so["status"]:
            if body.status not in _NEXT_STATUS.get(so["status"], set()):
                raise ApiError(409, "bad_transition", f"Can't move an order from {so['status']} to {body.status}.")
            if body.status == "shipped" and not (body.tracking_number or await conn.fetchval(
                "select tracking_number from store_orders where id = $1", store_order_id
            )):
                raise ApiError(422, "tracking_required", "Add a tracking number when you mark an order shipped.")
        await conn.execute(
            """update store_orders
                  set status = coalesce($3, status),
                      tracking_carrier = coalesce($4, tracking_carrier),
                      tracking_number = coalesce($5, tracking_number),
                      shipped_at = case when $3 = 'shipped' then now() else shipped_at end,
                      delivered_at = case when $3 = 'delivered' then now() else delivered_at end
                where id = $1 and store_id = $2""",
            store_order_id, ctx.store_id, body.status, body.tracking_carrier, body.tracking_number,
        )
    return await _store_order(conn, ctx.store_id, store_order_id)


# ---------------------------------------------------------------------------
# Numbers
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=s.SellerStats)
async def stats(ctx: Seller, conn: Conn):
    currency = ctx.store["currency"]
    head = await conn.fetchrow(
        """select coalesce(sum(so.subtotal_cents - so.discount_cents), 0)::bigint as sales,
                  count(*)::int as orders,
                  count(*) filter (where so.status = 'processing')::int as to_ship
             from store_orders so join orders o on o.id = so.order_id
            where so.store_id = $1 and o.paid_at > now() - interval '30 days' and so.status <> 'canceled'""",
        ctx.store_id,
    )
    to_ship = await conn.fetchval(
        "select count(*) from store_orders where store_id = $1 and status = 'processing'", ctx.store_id
    )
    units = await conn.fetchval(
        """select coalesce(sum(oi.quantity), 0) from order_items oi
             join store_orders so on so.id = oi.store_order_id join orders o on o.id = so.order_id
            where so.store_id = $1 and o.paid_at > now() - interval '30 days' and so.status <> 'canceled'""",
        ctx.store_id,
    )
    daily = await conn.fetch(
        """select d::date as date,
                  coalesce(sum(so.subtotal_cents - so.discount_cents), 0)::bigint as sales_cents,
                  count(so.id)::int as orders
             from generate_series(current_date - 29, current_date, interval '1 day') d
             left join orders o on o.paid_at::date = d::date
             left join store_orders so on so.order_id = o.id and so.store_id = $1 and so.status <> 'canceled'
            group by d order by d""",
        ctx.store_id,
    )
    top = await conn.fetch(
        """select p.id, p.slug, p.title, sum(oi.quantity)::int as units, sum(oi.line_total_cents)::bigint as sales_cents
             from order_items oi
             join store_orders so on so.id = oi.store_order_id
             join orders o on o.id = so.order_id
             join products p on p.id = oi.product_id
            where so.store_id = $1 and o.paid_at > now() - interval '30 days' and so.status <> 'canceled'
            group by p.id order by units desc limit 5""",
        ctx.store_id,
    )
    st = await conn.fetchrow(
        """select rating_avg::float as rating, rating_count,
                  (select count(*) from products where store_id = $1 and status = 'active')::int as active
             from stores where id = $1""",
        ctx.store_id,
    )
    orders = head["orders"]
    return {
        "currency": currency,
        "sales_cents_30d": int(head["sales"]),
        "orders_30d": orders,
        "units_30d": int(units),
        "average_order_cents": int(head["sales"]) // orders if orders else 0,
        "to_ship": int(to_ship),
        "active_products": st["active"],
        "rating": st["rating"],
        "review_count": st["rating_count"],
        "balance": await _balance(conn, ctx.store_id, currency),
        "daily": [{"date": r["date"], "sales_cents": int(r["sales_cents"]), "orders": r["orders"]} for r in daily],
        "top_products": [{**dict(r), "sales_cents": int(r["sales_cents"])} for r in top],
    }


@router.get("/ledger", response_model=s.Page[s.LedgerEntry])
async def ledger(ctx: Seller, conn: Conn, pg: Annotated[Paging, Depends(paging)]):
    total = await conn.fetchval("select count(*) from ledger_entries where store_id = $1", ctx.store_id)
    recs = await conn.fetch(
        """select id, kind, amount_cents, currency, memo, available_at, created_at from ledger_entries
            where store_id = $1 order by created_at desc, id limit $2 offset $3""",
        ctx.store_id, pg.page_size, pg.offset,
    )
    return pg.wrap([dict(r) for r in recs], total)


@router.get("/invoices", response_model=s.Page[s.RentInvoice])
async def invoices(ctx: Seller, conn: Conn, pg: Annotated[Paging, Depends(paging)]):
    total = await conn.fetchval("select count(*) from rent_invoices where store_id = $1", ctx.store_id)
    recs = await conn.fetch(
        """select i.id, i.period_start, i.period_end, i.amount_cents, i.currency, i.status, i.created_at,
                  p.name as plan_name
             from rent_invoices i left join store_plans p on p.id = i.plan_id
            where i.store_id = $1 order by i.created_at desc limit $2 offset $3""",
        ctx.store_id, pg.page_size, pg.offset,
    )
    return pg.wrap([dict(r) for r in recs], total)


# ---------------------------------------------------------------------------
# Payouts
# ---------------------------------------------------------------------------


@router.get("/payouts", response_model=s.Page[s.Payout])
async def payouts(ctx: Seller, conn: Conn, pg: Annotated[Paging, Depends(paging)]):
    total = await conn.fetchval("select count(*) from payouts where store_id = $1", ctx.store_id)
    recs = await conn.fetch(
        """select id, amount_cents, currency, status, method, note, requested_at, processed_at
             from payouts where store_id = $1 order by requested_at desc limit $2 offset $3""",
        ctx.store_id, pg.page_size, pg.offset,
    )
    return pg.wrap([dict(r) for r in recs], total)


@router.post("/payouts", response_model=s.Payout, status_code=201, dependencies=[sensitive_limit("payout")])
async def request_payout(body: s.PayoutIn, ctx: ActiveSeller, conn: Conn, settings: Cfg):
    if body.amount_cents < settings.payout_minimum_cents:
        raise ApiError(422, "below_minimum", f"The minimum payout is {settings.payout_minimum_cents} cents.")
    async with conn.transaction():
        # Serialise payout requests per store so two at once can't both pass
        # the balance check.
        await conn.execute("select 1 from stores where id = $1 for update", ctx.store_id)
        available = await conn.fetchval(
            "select available_cents from store_balances where store_id = $1", ctx.store_id
        )
        if body.amount_cents > available:
            raise ApiError(409, "insufficient_balance", "That is more than your available balance.")
        currency = ctx.store["currency"]
        rec = await conn.fetchrow(
            """insert into payouts (store_id, amount_cents, currency, method) values ($1, $2, $3, $4::jsonb)
               returning id, amount_cents, currency, status, method, note, requested_at, processed_at""",
            ctx.store_id, body.amount_cents, currency, body.method.model_dump(),
        )
        await conn.execute(
            """insert into ledger_entries (store_id, kind, amount_cents, currency, ref_type, ref_id, memo)
               values ($1, 'payout', $2, $3, 'payout', $4, 'Payout requested')""",
            ctx.store_id, -body.amount_cents, currency, rec["id"],
        )
    return dict(rec)


# ---------------------------------------------------------------------------
# Paid placements
# ---------------------------------------------------------------------------


@router.get("/placements", response_model=list[s.PlacementBooking])
async def my_placements(ctx: Seller, conn: Conn):
    recs = await conn.fetch(
        """select b.id, sl.code as slot_code, sl.name as slot_name, b.starts_on, b.ends_on, b.amount_cents,
                  b.credits_used, b.currency, b.status, b.product_id, b.headline
             from placement_bookings b join placement_slots sl on sl.id = b.slot_id
            where b.store_id = $1 order by b.starts_on desc limit 200""",
        ctx.store_id,
    )
    return [dict(r) for r in recs]


@router.post("/placements", response_model=s.PlacementBooking, status_code=201,
             dependencies=[sensitive_limit("placement")])
async def book_placement(body: s.PlacementBookingIn, ctx: ActiveSeller, conn: Conn):
    today = date.today()
    if body.starts_on < today or body.ends_on < body.starts_on:
        raise ApiError(422, "bad_dates", "Pick dates from today onwards, ending after they start.")
    if body.ends_on - body.starts_on > timedelta(days=60) or body.starts_on - today > timedelta(days=180):
        raise ApiError(422, "bad_dates", "Bookings can run up to 60 days and start within 6 months.")
    days = (body.ends_on - body.starts_on).days + 1

    async with conn.transaction():
        slot = await conn.fetchrow(
            "select id, code, name, daily_price_cents, currency, capacity from placement_slots where code = $1 and is_active for update",
            body.slot_code,
        )
        if slot is None:
            raise not_found("placement slot")
        if body.product_id:
            ok = await conn.fetchval(
                "select 1 from products where id = $1 and store_id = $2 and status = 'active'",
                body.product_id, ctx.store_id,
            )
            if not ok:
                raise ApiError(422, "bad_product", "Promote one of your own live products.")
        # Busiest day in the requested window must still have room.
        busiest = await conn.fetchval(
            """select coalesce(max(n), 0) from (
                   select d, count(b.id) n
                     from generate_series($2::date, $3::date, interval '1 day') d
                     left join placement_bookings b on b.slot_id = $1 and b.status in ('scheduled', 'live')
                                                    and d::date between b.starts_on and b.ends_on
                    group by d) x""",
            slot["id"], body.starts_on, body.ends_on,
        )
        if busiest >= slot["capacity"]:
            raise ApiError(409, "slot_full", "That slot is fully booked for some of those days.")

        # Plan credits: each credit is one free day, per calendar month.
        allowance = await conn.fetchval(
            "select featured_slots from store_plans where id = $1", ctx.store["plan_id"]
        )
        used = await conn.fetchval(
            """select coalesce(sum(credits_used), 0) from placement_bookings
                where store_id = $1 and status <> 'canceled'
                  and date_trunc('month', created_at) = date_trunc('month', now())""",
            ctx.store_id,
        )
        credits = max(0, min(days, allowance - used))
        amount = (days - credits) * slot["daily_price_cents"]

        rec = await conn.fetchrow(
            """insert into placement_bookings (slot_id, store_id, product_id, headline, image_url, starts_on, ends_on,
                                               amount_cents, credits_used, currency,
                                               status)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                       case when $6 <= current_date then 'live' else 'scheduled' end)
               returning id, starts_on, ends_on, amount_cents, credits_used, currency, status, product_id, headline""",
            slot["id"], ctx.store_id, body.product_id, body.headline, body.image_url, body.starts_on,
            body.ends_on, amount, credits, slot["currency"],
        )
        if amount > 0:
            # Charged against the store balance; it can go negative and is
            # recovered from the next sales.
            await conn.execute(
                """insert into ledger_entries (store_id, kind, amount_cents, currency, ref_type, ref_id, memo)
                   values ($1, 'placement', $2, $3, 'placement_booking', $4, $5)""",
                ctx.store_id, -amount, slot["currency"], rec["id"], f"{slot['name']}, {days} days",
            )
    return {**dict(rec), "slot_code": slot["code"], "slot_name": slot["name"]}




# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------

LOW_STOCK = 5


@router.get("/inventory", response_model=s.Page[s.InventoryRow])
async def inventory(
    ctx: Seller,
    conn: Conn,
    pg: Annotated[Paging, Depends(paging)],
    low_stock: bool = False,
    q: Annotated[str | None, Query(max_length=120)] = None,
):
    cond, args = ["p.store_id = $1", "v.is_active", "p.status <> 'archived'"], [ctx.store_id]
    if low_stock:
        cond.append(f"v.stock <= {LOW_STOCK}")
    if q and q.strip():
        args.append(q.strip().replace("%", "").replace("_", ""))
        cond.append(f"(p.title ilike '%' || ${len(args)} || '%' or v.sku ilike '%' || ${len(args)} || '%')")
    where = " and ".join(cond)
    total = await conn.fetchval(
        f"select count(*) from product_variants v join products p on p.id = v.product_id where {where}", *args
    )
    recs = await conn.fetch(
        f"""select v.id as variant_id, p.id as product_id, p.title as product_title, p.status as product_status,
                   v.sku, v.title, v.options, v.price_cents, v.stock, v.stock <= {LOW_STOCK} as low_stock,
                   -- Units sitting in unpaid orders (already taken out of stock).
                   (select coalesce(sum(oi.quantity), 0) from order_items oi
                      join store_orders so on so.id = oi.store_order_id
                     where oi.variant_id = v.id and so.payment_status = 'unpaid'
                       and so.status in ('pending', 'processing'))::int as reserved,
                   (select coalesce(sum(oi.quantity), 0) from order_items oi
                      join store_orders so on so.id = oi.store_order_id
                     where oi.variant_id = v.id and so.status <> 'canceled'
                       and so.created_at > now() - interval '30 days')::int as sold_30d
              from product_variants v join products p on p.id = v.product_id
             where {where}
             order by v.stock asc, p.title limit {pg.page_size} offset {pg.offset}""",
        *args,
    )
    return pg.wrap([dict(r) for r in recs], total)


# ---------------------------------------------------------------------------
# Payment confirmation (cash on delivery, bank transfer to the store)
# ---------------------------------------------------------------------------


@router.post("/orders/{store_order_id}/confirm-payment", response_model=s.StoreOrder,
             dependencies=[sensitive_limit("confirm-payment")])
async def confirm_payment(store_order_id: uuid.UUID, ctx: ActiveSeller, conn: Conn):
    async with conn.transaction():
        so = await conn.fetchrow(
            """select so.payment_status, o.payment_method from store_orders so join orders o on o.id = so.order_id
                where so.id = $1 and so.store_id = $2 for update of so""",
            store_order_id, ctx.store_id,
        )
        if so is None:
            raise not_found("order")
        if so["payment_method"] == "card":
            raise ApiError(409, "paid_online", "Card orders are confirmed by the payment provider, not the store.")
        if so["payment_status"] == "paid":
            raise ApiError(409, "already_paid", "This order is already marked paid.")
        await conn.execute("select mark_store_order_paid($1, 'store', 0)", store_order_id)
    return await _store_order(conn, ctx.store_id, store_order_id)


# ---------------------------------------------------------------------------
# Dispatching riders
# ---------------------------------------------------------------------------


@router.get("/riders/available", response_model=list[s.AvailableRider])
async def available_riders(ctx: ActiveSeller, conn: Conn):
    store = await conn.fetchrow("select pickup_lat, pickup_lng from stores where id = $1", ctx.store_id)
    recs = await conn.fetch(
        """select r.id, r.full_name, r.vehicle, r.last_lat, r.last_lng, r.last_seen_at,
                  (select count(*) from deliveries d where d.rider_id = r.id
                     and d.status in ('assigned', 'accepted', 'picked_up'))::int as active_deliveries
             from riders r join profiles p on p.id = r.id
            where r.status = 'active' and p.role = 'rider' and r.is_online
              and r.last_seen_at > now() - interval '10 minutes'""",
    )
    out = []
    for r in recs:
        km = None
        if store["pickup_lat"] is not None and r["last_lat"] is not None:
            km = round(haversine_km(store["pickup_lat"], store["pickup_lng"], r["last_lat"], r["last_lng"]), 2)
        out.append({
            "id": r["id"],
            "name": r["full_name"].split()[0],
            "vehicle": r["vehicle"],
            "distance_km": km,
            "eta_to_store_minutes": eta_minutes(km, r["vehicle"]) if km is not None else None,
            "active_deliveries": r["active_deliveries"],
            "last_seen_at": r["last_seen_at"],
        })
    out.sort(key=lambda x: (x["active_deliveries"], x["distance_km"] if x["distance_km"] is not None else 1e9))
    return out[:25]


@router.post("/orders/{store_order_id}/dispatch", response_model=s.StoreOrder, status_code=201,
             dependencies=[sensitive_limit("dispatch")])
async def dispatch(store_order_id: uuid.UUID, body: s.DispatchIn, ctx: ActiveSeller, conn: Conn, settings: Cfg):
    async with conn.transaction():
        so = await conn.fetchrow(
            """select so.status, o.shipping_address, o.currency from store_orders so join orders o on o.id = so.order_id
                where so.id = $1 and so.store_id = $2 for update of so""",
            store_order_id, ctx.store_id,
        )
        if so is None:
            raise not_found("order")
        if so["status"] != "processing":
            raise ApiError(409, "not_ready", "Only orders being prepared can be dispatched.")
        if await conn.fetchval(
            "select 1 from deliveries where store_order_id = $1 and status in ('assigned', 'accepted', 'picked_up')",
            store_order_id,
        ):
            raise ApiError(409, "already_dispatched", "A rider is already on this order.")
        store = await conn.fetchrow(
            "select name, pickup_lat, pickup_lng, pickup_address from stores where id = $1", ctx.store_id
        )
        if store["pickup_lat"] is None:
            raise ApiError(422, "pickup_missing", "Set your store's pickup location before dispatching riders.")
        rider = await conn.fetchrow(
            """select r.id from riders r join profiles p on p.id = r.id
                where r.id = $1 and r.status = 'active' and p.role = 'rider' and r.is_online
                  and r.last_seen_at > now() - interval '10 minutes' for update of r""",
            body.rider_id,
        )
        if rider is None:
            raise ApiError(409, "rider_unavailable", "That rider isn't available right now.")

        addr = so["shipping_address"] or {}
        label = (store["pickup_address"] or {}).get("label") or store["name"]
        pickup = {"lat": store["pickup_lat"], "lng": store["pickup_lng"], "label": label}
        dropoff = {"label": ", ".join(x for x in (addr.get("line1"), addr.get("city")) if x)}
        if isinstance(addr.get("lat"), (int, float)) and isinstance(addr.get("lng"), (int, float)):
            dropoff.update(lat=addr["lat"], lng=addr["lng"])
        delivery_id = await conn.fetchval(
            """insert into deliveries (store_order_id, store_id, rider_id, pickup, dropoff, handover_code,
                                       fee_cents, currency, note)
               values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9) returning id""",
            store_order_id, ctx.store_id, rider["id"], pickup, dropoff,
            f"{secrets.randbelow(1_000_000):06d}", settings.rider_fee_cents, so["currency"], body.note,
        )
        await publish(conn, {"type": "status", "delivery_id": str(delivery_id), "status": "assigned"})
    return await _store_order(conn, ctx.store_id, store_order_id)


@router.get("/deliveries", response_model=s.Page[s.StoreDelivery])
async def store_deliveries(
    ctx: Seller,
    conn: Conn,
    pg: Annotated[Paging, Depends(paging)],
    active: bool = True,
):
    cond = "d.store_id = $1" + (" and d.status in ('assigned', 'accepted', 'picked_up')" if active else "")
    total = await conn.fetchval(f"select count(*) from deliveries d where {cond}", ctx.store_id)
    recs = await conn.fetch(
        f"""select d.id, d.status, split_part(r.full_name, ' ', 1) as rider_name, r.vehicle as rider_vehicle,
                   d.assigned_at, d.picked_up_at, d.delivered_at, d.note
              from deliveries d join riders r on r.id = d.rider_id
             where {cond} order by d.assigned_at desc limit $2 offset $3""",
        ctx.store_id, pg.page_size, pg.offset,
    )
    return pg.wrap([dict(r) for r in recs], total)


@router.post("/deliveries/{delivery_id}/cancel", response_model=s.Message)
async def cancel_delivery(delivery_id: uuid.UUID, ctx: ActiveSeller, conn: Conn):
    """Pull a job back from a rider who hasn't collected it yet."""
    async with conn.transaction():
        done = await conn.execute(
            """update deliveries set status = 'canceled', ended_at = now()
                where id = $1 and store_id = $2 and status in ('assigned', 'accepted')""",
            delivery_id, ctx.store_id,
        )
        if done.endswith(" 0"):
            raise ApiError(409, "cannot_cancel", "That delivery can't be canceled now.")
        await publish(conn, {"type": "status", "delivery_id": str(delivery_id), "status": "canceled"})
    return {"ok": True}
