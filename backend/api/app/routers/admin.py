"""Marketplace operator: approve stores, hire riders, sell space, watch the
money, keep the lights on."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

import asyncpg
from fastapi import APIRouter, Depends, Query, Response

from .. import schemas as s
from ..auth import AdminUser
from ..common import Paging, paging
from ..config import Settings, get_settings
from ..db import get_conn
from ..errors import ApiError, not_found
from ..supabase_admin import sync_app_roles
from .shop import order_detail

router = APIRouter(prefix="/admin", tags=["admin"])
public = APIRouter(tags=["status"])
Conn = Annotated[asyncpg.Connection, Depends(get_conn)]
Cfg = Annotated[Settings, Depends(get_settings)]


def _like(q: str) -> str:
    return q.strip().replace("%", "").replace("_", "")


# ---------------------------------------------------------------------------
# Site status and settings
# ---------------------------------------------------------------------------


class SiteStatus(s.BaseModel):
    maintenance_mode: bool
    maintenance_message: str | None


class SiteSettings(SiteStatus):
    vendor_signups_open: bool
    rider_signups_open: bool
    updated_at: datetime


class SiteSettingsUpdate(s.Strict):
    maintenance_mode: bool | None = None
    maintenance_message: s.MediumText | None = None
    vendor_signups_open: bool | None = None
    rider_signups_open: bool | None = None


@public.get("/status", response_model=SiteStatus)
async def status(conn: Conn, response: Response):
    rec = await conn.fetchrow("select maintenance_mode, maintenance_message from app_settings")
    response.headers["Cache-Control"] = "public, max-age=15"
    return dict(rec)


@router.get("/settings", response_model=SiteSettings)
async def get_site_settings(_: AdminUser, conn: Conn):
    return dict(await conn.fetchrow("select * from app_settings"))


@router.patch("/settings", response_model=SiteSettings)
async def update_site_settings(body: SiteSettingsUpdate, admin: AdminUser, conn: Conn):
    data = body.model_dump(exclude_unset=True)
    cols = [k for k in SiteSettingsUpdate.model_fields if k in data]
    if cols:
        sets = ", ".join(f"{c} = ${i + 2}" for i, c in enumerate(cols))
        await conn.execute(
            f"update app_settings set {sets}, updated_at = now(), updated_by = $1", admin.id, *[data[c] for c in cols]
        )
    return dict(await conn.fetchrow("select * from app_settings"))


# ---------------------------------------------------------------------------
# Money
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=s.AdminStats)
async def stats(_: AdminUser, conn: Conn, settings: Cfg):
    r = await conn.fetchrow(
        """select
             (select coalesce(sum(so.subtotal_cents - so.discount_cents), 0) from store_orders so
                where so.payment_status = 'paid' and so.paid_at > now() - interval '30 days')::bigint as gmv,
             (select count(*) from orders where created_at > now() - interval '30 days'
                and status not in ('canceled'))::int as orders,
             (select coalesce(-sum(amount_cents), 0) from ledger_entries where kind = 'commission'
                and created_at > now() - interval '30 days')::bigint as commission,
             (select coalesce(-sum(amount_cents), 0) from ledger_entries where kind = 'fee'
                and created_at > now() - interval '30 days')::bigint as fees,
             (select coalesce(-sum(amount_cents), 0) from ledger_entries where kind = 'rent'
                and created_at > now() - interval '30 days')::bigint as rent,
             (select coalesce(-sum(amount_cents), 0) from ledger_entries where kind = 'placement'
                and created_at > now() - interval '30 days')::bigint as placement,
             (select coalesce(sum(pl.monthly_price_cents), 0) from store_subscriptions ss
                join store_plans pl on pl.id = ss.plan_id
               where ss.status in ('active', 'trialing') and not ss.cancel_at_period_end)::bigint as mrr,
             (select count(*) from stores where status = 'active')::int as active_stores,
             (select count(*) from stores where status = 'pending')::int as pending_stores,
             (select count(*) from profiles where role = 'customer')::int as customers,
             (select count(*) from products where status = 'active')::int as active_products,
             (select coalesce(sum(amount_cents), 0) from payouts where status in ('requested', 'approved'))::bigint
                as payouts_requested"""
    )
    return {
        "currency": settings.currency,
        "gmv_cents_30d": int(r["gmv"]),
        "orders_30d": r["orders"],
        "commission_cents_30d": int(r["commission"]),
        "fees_cents_30d": int(r["fees"]),
        "rent_cents_30d": int(r["rent"]),
        "placement_cents_30d": int(r["placement"]),
        "rent_mrr_cents": int(r["mrr"]),
        "active_stores": r["active_stores"],
        "pending_stores": r["pending_stores"],
        "customers": r["customers"],
        "active_products": r["active_products"],
        "payouts_requested_cents": int(r["payouts_requested"]),
    }


class IncomeDay(s.BaseModel):
    date: datetime
    rent_cents: int
    commission_cents: int
    fee_cents: int
    placement_cents: int
    delivery_fee_cents: int


class Income(s.BaseModel):
    currency: str
    period_days: int
    rent_cents: int
    commission_cents: int
    fee_cents: int
    placement_cents: int
    delivery_fee_cents: int
    rider_cost_cents: int
    total_cents: int
    daily: list[IncomeDay]


@router.get("/income", response_model=Income)
async def income(_: AdminUser, conn: Conn, settings: Cfg, period: Literal["7d", "30d", "90d", "365d"] = "30d"):
    """What the marketplace itself earns. Everything is read off the store
    ledgers: a debit on a store is income for the platform."""
    days = int(period[:-1])
    recs = await conn.fetch(
        """select d::date as date,
                  coalesce(-sum(l.amount_cents) filter (where l.kind = 'rent'), 0)::bigint as rent_cents,
                  coalesce(-sum(l.amount_cents) filter (where l.kind = 'commission'), 0)::bigint as commission_cents,
                  coalesce(-sum(l.amount_cents) filter (where l.kind = 'fee'), 0)::bigint as fee_cents,
                  coalesce(-sum(l.amount_cents) filter (where l.kind = 'placement'), 0)::bigint as placement_cents,
                  coalesce(-sum(l.amount_cents) filter (where l.kind = 'delivery'), 0)::bigint as delivery_fee_cents
             from generate_series(current_date - ($1::int - 1), current_date, interval '1 day') d
             left join ledger_entries l on l.created_at::date = d::date
            group by d order by d""",
        days,
    )
    rider_cost = await conn.fetchval(
        "select coalesce(sum(amount_cents), 0) from rider_earnings where created_at > now() - make_interval(days => $1)",
        days,
    )
    keys = ("rent_cents", "commission_cents", "fee_cents", "placement_cents", "delivery_fee_cents")
    totals = {k: sum(int(r[k]) for r in recs) for k in keys}
    return {
        "currency": settings.currency,
        "period_days": days,
        **totals,
        "rider_cost_cents": int(rider_cost),
        "total_cents": sum(totals.values()) - int(rider_cost),
        "daily": [{**{k: int(r[k]) for k in keys}, "date": r["date"]} for r in recs],
    }


# ---------------------------------------------------------------------------
# Stores (selling space)
# ---------------------------------------------------------------------------

ADMIN_STORE = """
    select s.id, s.slug, s.name, s.status, pl.code as plan_code, p.email as owner_email, s.country,
           s.support_email, s.application, s.review_note, s.created_at, s.approved_at,
           (select count(*) from products x where x.store_id = s.id and x.status = 'active')::int as product_count
      from stores s join store_plans pl on pl.id = s.plan_id join profiles p on p.id = s.owner_id
"""


@router.get("/stores", response_model=s.Page[s.AdminStore])
async def stores(
    _: AdminUser,
    conn: Conn,
    pg: Annotated[Paging, Depends(paging)],
    status: Literal["pending", "active", "suspended", "rejected"] | None = None,
    q: Annotated[str | None, Query(max_length=120)] = None,
):
    cond, args = ["true"], []
    if status:
        args.append(status)
        cond.append(f"s.status = ${len(args)}")
    if q and q.strip():
        args.append(_like(q))
        cond.append(f"(s.name ilike '%' || ${len(args)} || '%' or s.slug ilike '%' || ${len(args)} || '%')")
    where = " and ".join(cond)
    total = await conn.fetchval(f"select count(*) from stores s where {where}", *args)
    recs = await conn.fetch(
        ADMIN_STORE + f" where {where} order by s.created_at desc limit {pg.page_size} offset {pg.offset}", *args
    )
    return pg.wrap([dict(r) for r in recs], total)


@router.get("/stores/{store_id}", response_model=s.AdminStore)
async def store(store_id: uuid.UUID, _: AdminUser, conn: Conn):
    rec = await conn.fetchrow(ADMIN_STORE + " where s.id = $1", store_id)
    if rec is None:
        raise not_found("store")
    return dict(rec)


@router.patch("/stores/{store_id}", response_model=s.AdminStore)
async def update_store(store_id: uuid.UUID, body: s.AdminStoreUpdate, _: AdminUser, conn: Conn, settings: Cfg):
    sync_role: tuple[uuid.UUID, str] | None = None
    async with conn.transaction():
        st = await conn.fetchrow(
            "select id, owner_id, status, plan_id from stores where id = $1 for update", store_id
        )
        if st is None:
            raise not_found("store")
        if body.plan_code:
            plan_id = await conn.fetchval("select id from store_plans where code = $1", body.plan_code)
            if plan_id is None:
                raise ApiError(422, "unknown_plan", "That plan does not exist.")
            await conn.execute("update stores set plan_id = $2 where id = $1", store_id, plan_id)
            await conn.execute(
                "update store_subscriptions set plan_id = $2 where store_id = $1 and status <> 'canceled'",
                store_id, plan_id,
            )
        if body.review_note is not None:
            await conn.execute("update stores set review_note = $2 where id = $1", store_id, body.review_note)

        if body.status and body.status != st["status"]:
            if body.status == "active":
                owner_role = await conn.fetchval("select role from profiles where id = $1", st["owner_id"])
                if owner_role in ("rider", "admin"):
                    raise ApiError(409, "role_conflict", "The owner's account is a rider or admin account.")
                await conn.execute(
                    "update stores set status = 'active', approved_at = coalesce(approved_at, now()) where id = $1",
                    store_id,
                )
                await conn.execute("update profiles set role = 'seller' where id = $1 and role = 'customer'",
                                   st["owner_id"])
                await _start_lease(conn, store_id)
                sync_role = (st["owner_id"], "seller")
            else:
                await conn.execute("update stores set status = $2 where id = $1", store_id, body.status)
                if body.status in ("suspended", "rejected"):
                    # Stop renting: no new rent while the store is closed.
                    await conn.execute(
                        "update store_subscriptions set cancel_at_period_end = true where store_id = $1 and status <> 'canceled'",
                        store_id,
                    )
    if sync_role:
        await sync_app_roles(settings, *sync_role)
    return await store(store_id, _, conn)


async def _start_lease(conn: asyncpg.Connection, store_id: uuid.UUID):
    """First approval (or re-activation) starts a rental period and charges
    the first month up front. bill_rent() charges each month after that."""
    live = await conn.fetchrow(
        "select id, cancel_at_period_end from store_subscriptions where store_id = $1 and status <> 'canceled'",
        store_id,
    )
    if live:
        if live["cancel_at_period_end"]:
            await conn.execute("update store_subscriptions set cancel_at_period_end = false where id = $1", live["id"])
        return
    plan = await conn.fetchrow(
        "select p.id, p.monthly_price_cents, p.currency from stores s join store_plans p on p.id = s.plan_id where s.id = $1",
        store_id,
    )
    sub_id = await conn.fetchval(
        "insert into store_subscriptions (store_id, plan_id) values ($1, $2) returning id", store_id, plan["id"]
    )
    if plan["monthly_price_cents"] > 0:
        inv = await conn.fetchval(
            """insert into rent_invoices (store_id, subscription_id, plan_id, period_start, period_end, amount_cents,
                                          currency, status)
               values ($1, $2, $3, now(), now() + interval '1 month', $4, $5, 'paid') returning id""",
            store_id, sub_id, plan["id"], plan["monthly_price_cents"], plan["currency"],
        )
        await conn.execute(
            """insert into ledger_entries (store_id, kind, amount_cents, currency, ref_type, ref_id, memo)
               values ($1, 'rent', $2, $3, 'rent_invoice', $4, 'Storefront rent')""",
            store_id, -plan["monthly_price_cents"], plan["currency"], inv,
        )


# ---------------------------------------------------------------------------
# Plans, placements, categories, coupons
# ---------------------------------------------------------------------------

PLAN_COLS = """id, code, name, description, monthly_price_cents, currency, commission_rate::float,
               per_item_fee_cents, product_limit, featured_slots, features"""


@router.get("/plans", response_model=list[s.Plan])
async def plans(_: AdminUser, conn: Conn):
    return [dict(r) for r in await conn.fetch(f"select {PLAN_COLS} from store_plans order by sort")]


@router.post("/plans", response_model=s.Plan, status_code=201)
async def create_plan(body: s.PlanIn, _: AdminUser, conn: Conn, settings: Cfg):
    rec = await conn.fetchrow(
        f"""insert into store_plans (code, name, description, monthly_price_cents, currency, commission_rate,
                                     per_item_fee_cents, product_limit, featured_slots, features, sort)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning {PLAN_COLS}""",
        body.code, body.name, body.description, body.monthly_price_cents, settings.currency, body.commission_rate,
        body.per_item_fee_cents, body.product_limit, body.featured_slots, body.features, body.sort,
    )
    return dict(rec)


@router.patch("/plans/{plan_id}", response_model=s.Plan)
async def update_plan(plan_id: uuid.UUID, body: s.PlanUpdate, _: AdminUser, conn: Conn):
    data = body.model_dump(exclude_unset=True)
    for k in ("name", "monthly_price_cents", "commission_rate", "per_item_fee_cents", "featured_slots",
              "features", "is_active", "sort"):
        if k in data and data[k] is None:
            raise ApiError(422, "invalid_value", f"{k} can't be empty.")
    cols = [k for k in s.PlanUpdate.model_fields if k in data]
    if cols:
        sets = ", ".join(f"{c} = ${i + 2}" for i, c in enumerate(cols))
        done = await conn.execute(f"update store_plans set {sets} where id = $1", plan_id, *[data[c] for c in cols])
        if done.endswith(" 0"):
            raise not_found("plan")
    rec = await conn.fetchrow(f"select {PLAN_COLS} from store_plans where id = $1", plan_id)
    if rec is None:
        raise not_found("plan")
    return dict(rec)


class SlotUpdate(s.Strict):
    daily_price_cents: s.Cents | None = None
    capacity: Annotated[int, s.Field(ge=1, le=100)] | None = None
    is_active: bool | None = None


@router.get("/placement-slots", response_model=list[s.PlacementSlot])
async def slots(_: AdminUser, conn: Conn):
    recs = await conn.fetch(
        "select id, code, name, description, location, daily_price_cents, currency, capacity from placement_slots"
    )
    return [dict(r) for r in recs]


@router.patch("/placement-slots/{slot_id}", response_model=s.PlacementSlot)
async def update_slot(slot_id: uuid.UUID, body: SlotUpdate, _: AdminUser, conn: Conn):
    data = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if data:
        cols = list(data)
        sets = ", ".join(f"{c} = ${i + 2}" for i, c in enumerate(cols))
        await conn.execute(f"update placement_slots set {sets} where id = $1", slot_id, *data.values())
    rec = await conn.fetchrow(
        "select id, code, name, description, location, daily_price_cents, currency, capacity from placement_slots where id = $1",
        slot_id,
    )
    if rec is None:
        raise not_found("slot")
    return dict(rec)


@router.post("/categories", response_model=s.Category, status_code=201)
async def create_category(body: s.CategoryIn, _: AdminUser, conn: Conn):
    rec = await conn.fetchrow(
        """insert into categories (slug, name, parent_id, image_url, sort) values ($1, $2, $3, $4, $5)
           returning id, parent_id, slug, name, image_url""",
        body.slug, body.name, body.parent_id, body.image_url, body.sort,
    )
    return {**dict(rec), "children": []}


@router.patch("/categories/{category_id}", response_model=s.Category)
async def update_category(category_id: uuid.UUID, body: s.CategoryUpdate, _: AdminUser, conn: Conn):
    data = body.model_dump(exclude_unset=True)
    if data.get("parent_id") == category_id:
        raise ApiError(422, "bad_parent", "A category can't be its own parent.")
    if data.get("parent_id"):
        # Refuse cycles: the new parent must not sit under this category.
        cyclic = await conn.fetchval(
            """with recursive up as (select id, parent_id from categories where id = $1
                                     union all
                                     select c.id, c.parent_id from categories c join up on c.id = up.parent_id)
               select exists (select 1 from up where id = $2)""",
            data["parent_id"], category_id,
        )
        if cyclic:
            raise ApiError(422, "bad_parent", "That would put the category inside itself.")
    if "name" in data and data["name"] is None:
        raise ApiError(422, "invalid_value", "name can't be empty.")
    cols = [k for k in s.CategoryUpdate.model_fields if k in data]
    if cols:
        sets = ", ".join(f"{c} = ${i + 2}" for i, c in enumerate(cols))
        await conn.execute(f"update categories set {sets} where id = $1", category_id, *[data[c] for c in cols])
    rec = await conn.fetchrow("select id, parent_id, slug, name, image_url from categories where id = $1", category_id)
    if rec is None:
        raise not_found("category")
    return {**dict(rec), "children": []}


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(category_id: uuid.UUID, _: AdminUser, conn: Conn):
    await conn.execute("delete from categories where id = $1", category_id)
    return Response(status_code=204)


@router.get("/coupons", response_model=list[s.Coupon])
async def coupons(_: AdminUser, conn: Conn):
    return [dict(r) for r in await conn.fetch("select * from coupons order by created_at desc limit 500")]


@router.post("/coupons", response_model=s.Coupon, status_code=201)
async def create_coupon(body: s.CouponIn, _: AdminUser, conn: Conn):
    rec = await conn.fetchrow(
        """insert into coupons (code, kind, value, store_id, min_subtotal_cents, starts_at, ends_at, max_redemptions)
           values ($1, $2, $3, $4, $5, $6, $7, $8) returning *""",
        body.code, body.kind, body.value, body.store_id, body.min_subtotal_cents, body.starts_at, body.ends_at,
        body.max_redemptions,
    )
    return dict(rec)


@router.delete("/coupons/{code}", status_code=204)
async def disable_coupon(code: Annotated[str, s.StringConstraints(max_length=40)], _: AdminUser, conn: Conn):
    await conn.execute("update coupons set is_active = false where code = $1", code.upper())
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Products, users, orders
# ---------------------------------------------------------------------------


@router.patch("/products/{product_id}", response_model=s.Message)
async def moderate_product(product_id: uuid.UUID, body: s.AdminProductUpdate, _: AdminUser, conn: Conn):
    done = await conn.execute("update products set status = $2 where id = $1", product_id, body.status)
    if done.endswith(" 0"):
        raise not_found("product")
    return {"ok": True}


@router.patch("/users/{user_id}", response_model=s.Message)
async def set_role(user_id: uuid.UUID, body: s.AdminUserUpdate, admin: AdminUser, conn: Conn, settings: Cfg):
    if user_id == admin.id and body.role != "admin":
        raise ApiError(409, "self_demotion", "Ask another admin to change your own role.")
    done = await conn.execute("update profiles set role = $2 where id = $1", user_id, body.role)
    if done.endswith(" 0"):
        raise not_found("user")
    await sync_app_roles(settings, user_id, body.role)
    return {"ok": True}


@router.get("/orders", response_model=s.Page[s.AdminOrder])
async def orders(
    _: AdminUser,
    conn: Conn,
    pg: Annotated[Paging, Depends(paging)],
    status: Annotated[str | None, Query(pattern=r"^[a-z_]+$", max_length=30)] = None,
):
    cond, args = "true", []
    if status:
        cond, args = "o.status = $1", [status]
    total = await conn.fetchval(f"select count(*) from orders o where {cond}", *args)
    recs = await conn.fetch(
        f"""select o.id, o.number, o.status, o.currency, o.total_cents, o.created_at, p.email as customer_email,
                   (select coalesce(sum(quantity), 0) from order_items where order_id = o.id)::int as item_count,
                   (select count(*) from store_orders where order_id = o.id)::int as stores
              from orders o join profiles p on p.id = o.user_id
             where {cond} order by o.created_at desc limit {pg.page_size} offset {pg.offset}""",
        *args,
    )
    return pg.wrap([dict(r) for r in recs], total)


@router.get("/orders/{order_id}", response_model=s.Order)
async def order(order_id: uuid.UUID, _: AdminUser, conn: Conn):
    return await order_detail(conn, order_id, None)


@router.post("/orders/{order_id}/mark-paid", response_model=s.Order)
async def mark_paid(order_id: uuid.UUID, _: AdminUser, conn: Conn, settings: Cfg):
    """For transfers made to the marketplace's own account."""
    async with conn.transaction():
        changed = await conn.fetchval(
            "select mark_order_paid($1, 'manual', null, $2)", order_id, settings.payout_hold_days
        )
        if not changed:
            raise ApiError(409, "not_payable", "That order is already paid or canceled.")
    return await order_detail(conn, order_id, None)


@router.post("/orders/{order_id}/cancel", response_model=s.Order)
async def cancel_any(order_id: uuid.UUID, _: AdminUser, conn: Conn):
    async with conn.transaction():
        await conn.fetchval("select cancel_order($1)", order_id)
    return await order_detail(conn, order_id, None)


# ---------------------------------------------------------------------------
# Payouts
# ---------------------------------------------------------------------------


@router.get("/payouts", response_model=s.Page[s.AdminPayout])
async def payouts(
    _: AdminUser,
    conn: Conn,
    pg: Annotated[Paging, Depends(paging)],
    status: Literal["requested", "approved", "paid", "rejected"] | None = None,
):
    cond, args = "true", []
    if status:
        cond, args = "p.status = $1", [status]
    total = await conn.fetchval(f"select count(*) from payouts p where {cond}", *args)
    recs = await conn.fetch(
        f"""select p.id, p.amount_cents, p.currency, p.status, p.method, p.note, p.requested_at, p.processed_at,
                   s.slug as store_slug, s.name as store_name
              from payouts p join stores s on s.id = p.store_id
             where {cond} order by p.requested_at desc limit {pg.page_size} offset {pg.offset}""",
        *args,
    )
    return pg.wrap(
        [{**{k: r[k] for k in r.keys() if not k.startswith("store_")},
          "store": {"slug": r["store_slug"], "name": r["store_name"]}} for r in recs],
        total,
    )


_PAYOUT_FLOW = {"requested": {"approved", "rejected"}, "approved": {"paid", "rejected"}}


@router.patch("/payouts/{payout_id}", response_model=s.Message)
async def update_payout(payout_id: uuid.UUID, body: s.AdminPayoutUpdate, _: AdminUser, conn: Conn):
    async with conn.transaction():
        p = await conn.fetchrow("select * from payouts where id = $1 for update", payout_id)
        if p is None:
            raise not_found("payout")
        if body.status not in _PAYOUT_FLOW.get(p["status"], set()):
            raise ApiError(409, "bad_transition", f"A {p['status']} payout can't become {body.status}.")
        await conn.execute(
            "update payouts set status = $2, note = coalesce($3, note), processed_at = now() where id = $1",
            payout_id, body.status, body.note,
        )
        if body.status == "rejected":
            # Give the reserved money back to the store.
            await conn.execute(
                """insert into ledger_entries (store_id, kind, amount_cents, currency, ref_type, ref_id, memo)
                   values ($1, 'adjustment', $2, $3, 'payout', $4, 'Payout rejected, funds returned')""",
                p["store_id"], p["amount_cents"], p["currency"], payout_id,
            )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Riders
# ---------------------------------------------------------------------------


class AdminRider(s.BaseModel):
    id: uuid.UUID
    full_name: str
    email: str | None
    phone: str
    city: str
    vehicle: str
    licence_number: str | None
    status: str
    review_note: str | None
    is_online: bool
    last_lat: float | None
    last_lng: float | None
    last_seen_at: datetime | None
    active_deliveries: int
    completed_deliveries: int
    created_at: datetime
    approved_at: datetime | None


class AdminRiderUpdate(s.Strict):
    status: Literal["active", "suspended", "rejected"]
    review_note: s.MediumText | None = None


RIDER_SELECT = """
    select r.id, r.full_name, p.email, r.phone, r.city, r.vehicle, r.licence_number, r.status, r.review_note,
           r.is_online, r.last_lat, r.last_lng, r.last_seen_at, r.created_at, r.approved_at,
           (select count(*) from deliveries d where d.rider_id = r.id
              and d.status in ('assigned', 'accepted', 'picked_up'))::int as active_deliveries,
           (select count(*) from deliveries d where d.rider_id = r.id and d.status = 'delivered')::int
              as completed_deliveries
      from riders r join profiles p on p.id = r.id
"""


@router.get("/riders", response_model=s.Page[AdminRider])
async def riders(
    _: AdminUser,
    conn: Conn,
    pg: Annotated[Paging, Depends(paging)],
    status: Literal["applicant", "active", "suspended", "rejected"] | None = None,
    online: bool | None = None,
):
    cond, args = ["true"], []
    if status:
        args.append(status)
        cond.append(f"r.status = ${len(args)}")
    if online is not None:
        args.append(online)
        cond.append(f"r.is_online = ${len(args)}")
    where = " and ".join(cond)
    total = await conn.fetchval(f"select count(*) from riders r where {where}", *args)
    recs = await conn.fetch(
        RIDER_SELECT + f" where {where} order by r.created_at desc limit {pg.page_size} offset {pg.offset}", *args
    )
    return pg.wrap([dict(r) for r in recs], total)


@router.get("/rider-applications", response_model=s.Page[AdminRider])
async def rider_applications(_: AdminUser, conn: Conn, pg: Annotated[Paging, Depends(paging)]):
    return await riders(_, conn, pg, status="applicant", online=None)


@router.patch("/riders/{rider_id}", response_model=AdminRider)
async def update_rider(rider_id: uuid.UUID, body: AdminRiderUpdate, _: AdminUser, conn: Conn, settings: Cfg):
    async with conn.transaction():
        r = await conn.fetchrow("select r.status, p.role from riders r join profiles p on p.id = r.id where r.id = $1 for update of r",
                                rider_id)
        if r is None:
            raise not_found("rider")
        if body.status == "active":
            if r["role"] in ("seller", "admin"):
                raise ApiError(409, "role_conflict", "That account runs a store or is an admin.")
            await conn.execute(
                "update riders set status = 'active', review_note = $2, approved_at = coalesce(approved_at, now()) where id = $1",
                rider_id, body.review_note,
            )
            await conn.execute("update profiles set role = 'rider' where id = $1", rider_id)
            new_role = "rider"
        else:
            if body.status == "suspended":
                busy = await conn.fetchval(
                    "select count(*) from deliveries where rider_id = $1 and status = 'picked_up'", rider_id
                )
                if busy:
                    raise ApiError(409, "rider_busy", "That rider is carrying a parcel. Suspend after it's handed over.")
                await conn.execute(
                    "update deliveries set status = 'canceled', ended_at = now() where rider_id = $1 and status in ('assigned', 'accepted')",
                    rider_id,
                )
            await conn.execute(
                "update riders set status = $2, review_note = $3, is_online = false where id = $1",
                rider_id, body.status, body.review_note,
            )
            await conn.execute("update profiles set role = 'customer' where id = $1 and role = 'rider'", rider_id)
            new_role = "customer"
    await sync_app_roles(settings, rider_id, new_role)
    rec = await conn.fetchrow(RIDER_SELECT + " where r.id = $1", rider_id)
    return dict(rec)


class LiveDelivery(s.BaseModel):
    id: uuid.UUID
    status: str
    store_name: str
    order_number: str
    rider_id: uuid.UUID
    rider_name: str
    rider_position: s.RiderPosition | None
    pickup: s.MapPoint | None
    dropoff: s.MapPoint | None
    assigned_at: datetime


class LiveRider(s.BaseModel):
    id: uuid.UUID
    name: str
    vehicle: str
    lat: float | None
    lng: float | None
    last_seen_at: datetime | None
    busy: bool


class LiveMap(s.BaseModel):
    deliveries: list[LiveDelivery]
    riders: list[LiveRider]


@router.get("/deliveries", response_model=LiveMap)
async def live_map(_: AdminUser, conn: Conn):
    """Everything for the admin's live map. Subscribe to the websocket with
    scope "admin" for updates."""
    ds = await conn.fetch(
        """select d.id, d.status, st.name as store_name, o.number as order_number, d.rider_id,
                  r.full_name as rider_name, r.last_lat, r.last_lng, r.last_seen_at, d.pickup, d.dropoff,
                  d.assigned_at
             from deliveries d
             join riders r on r.id = d.rider_id
             join stores st on st.id = d.store_id
             join store_orders so on so.id = d.store_order_id
             join orders o on o.id = so.order_id
            where d.status in ('assigned', 'accepted', 'picked_up')
            order by d.assigned_at desc limit 500"""
    )
    rs = await conn.fetch(
        """select r.id, r.full_name, r.vehicle, r.last_lat, r.last_lng, r.last_seen_at,
                  exists (select 1 from deliveries d where d.rider_id = r.id
                           and d.status in ('accepted', 'picked_up')) as busy
             from riders r where r.status = 'active' and r.is_online limit 1000"""
    )

    def pt(x):
        return x if isinstance(x, dict) and "lat" in x and "lng" in x else None

    return {
        "deliveries": [
            {
                "id": d["id"], "status": d["status"], "store_name": d["store_name"],
                "order_number": d["order_number"], "rider_id": d["rider_id"], "rider_name": d["rider_name"],
                "rider_position": {"lat": d["last_lat"], "lng": d["last_lng"], "at": d["last_seen_at"]}
                if d["last_lat"] is not None else None,
                "pickup": pt(d["pickup"]), "dropoff": pt(d["dropoff"]), "assigned_at": d["assigned_at"],
            }
            for d in ds
        ],
        "riders": [
            {"id": r["id"], "name": r["full_name"], "vehicle": r["vehicle"], "lat": r["last_lat"],
             "lng": r["last_lng"], "last_seen_at": r["last_seen_at"], "busy": r["busy"]}
            for r in rs
        ],
    }


class RiderPayoutOut(s.BaseModel):
    rider_id: uuid.UUID
    paid_cents: int


@router.post("/riders/{rider_id}/settle", response_model=RiderPayoutOut)
async def settle_rider(rider_id: uuid.UUID, _: AdminUser, conn: Conn):
    """Mark all of a rider's unpaid earnings as paid out (after you've paid
    them outside the app)."""
    paid = await conn.fetchval(
        """with x as (update rider_earnings set paid_out = true where rider_id = $1 and not paid_out
                       returning amount_cents)
           select coalesce(sum(amount_cents), 0) from x""",
        rider_id,
    )
    return {"rider_id": rider_id, "paid_cents": int(paid)}


# ---------------------------------------------------------------------------
# Housekeeping
# ---------------------------------------------------------------------------


@router.post("/billing/run", response_model=s.BillingRunOut)
async def run_billing(_: AdminUser, conn: Conn, settings: Cfg):
    """Runs the same jobs the worker runs on a timer."""
    async with conn.transaction():
        billed = await conn.fetchval("select bill_rent(now())")
        await conn.execute("select refresh_placements(current_date)")
        expired = await conn.fetchval(
            "select expire_unpaid_orders(make_interval(mins => $1), interval '72 hours')",
            settings.unpaid_order_ttl_minutes,
        )
    return {"subscriptions_billed": billed, "orders_expired": expired}
