"""Riders: apply, go online, share location, take and complete deliveries."""

import secrets
import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal

import asyncpg
from fastapi import APIRouter, Depends, Request
from pydantic import Field, StringConstraints

from .. import schemas as s
from ..auth import AccountUser, CurrentUser, User
from ..common import Paging, paging
from ..config import Settings, get_settings
from ..db import get_conn
from ..errors import ApiError, forbidden, not_found
from ..geo import coarse
from .. import dispatch
from ..realtime import publish
from ..security import sensitive_limit

router = APIRouter(prefix="/rider", tags=["rider"])
Conn = Annotated[asyncpg.Connection, Depends(get_conn)]
Cfg = Annotated[Settings, Depends(get_settings)]

MAX_ACTIVE_DELIVERIES = dispatch.MAX_ACTIVE_DELIVERIES
MAX_CODE_ATTEMPTS = 5
LIVE = ("assigned", "accepted", "picked_up")


# ---------------------------------------------------------------------------
# Models (rider specific, kept next to the routes that use them)
# ---------------------------------------------------------------------------


class RiderApplicationIn(s.Strict):
    full_name: s.Name
    phone: Annotated[str, StringConstraints(min_length=6, max_length=32, pattern=r"^[0-9+() .-]+$")]
    city: s.Name
    vehicle: Literal["bicycle", "motorbike", "car", "van", "on_foot"]
    licence_number: Annotated[str, StringConstraints(max_length=40, pattern=r"^[A-Za-z0-9 /-]*$")] | None = None


class RiderMe(s.BaseModel):
    id: uuid.UUID
    full_name: str
    phone: str
    city: str
    vehicle: str
    licence_number: str | None
    status: str
    review_note: str | None
    is_online: bool
    last_seen_at: datetime | None
    active_deliveries: int
    completed_deliveries: int
    earnings_cents: int
    unpaid_earnings_cents: int
    currency: str


class ShiftIn(s.Strict):
    online: bool


class LocationIn(s.Strict):
    lat: Annotated[float, Field(ge=-90, le=90)]
    lng: Annotated[float, Field(ge=-180, le=180)]
    accuracy_m: Annotated[float, Field(ge=0, le=10_000)] | None = None
    heading: Annotated[float, Field(ge=0, lt=360)] | None = None
    # As the browser's Geolocation API reports it, metres per second.
    speed_mps: Annotated[float, Field(ge=0, le=100)] | None = None


class Point(s.BaseModel):
    lat: float
    lng: float
    label: str | None = None


class RiderDelivery(s.BaseModel):
    id: uuid.UUID
    status: str
    order_number: str
    store: s.StoreRef
    pickup: Point | None
    dropoff: Point | None
    dropoff_address: dict | None
    customer_name: str | None
    customer_phone: str | None
    cash_to_collect_cents: int
    fee_cents: int
    currency: str
    items: int
    assigned_at: datetime
    accepted_at: datetime | None
    picked_up_at: datetime | None
    delivered_at: datetime | None


class DeliveryActionIn(s.Strict):
    action: Literal["accept", "decline", "picked_up", "delivered", "failed"]
    code: Annotated[str, StringConstraints(pattern=r"^[0-9]{6}$")] | None = None
    note: s.MediumText | None = None


class Earning(s.BaseModel):
    id: uuid.UUID
    delivery_id: uuid.UUID
    amount_cents: int
    currency: str
    paid_out: bool
    created_at: datetime


# ---------------------------------------------------------------------------
# Applying
# ---------------------------------------------------------------------------


async def signups_open(conn: asyncpg.Connection, kind: str) -> bool:
    return bool(await conn.fetchval(f"select {kind}_signups_open from app_settings"))


@router.post("/applications", response_model=RiderMe, status_code=201, dependencies=[sensitive_limit("rider-apply")])
async def apply(body: RiderApplicationIn, user: AccountUser, conn: Conn, settings: Cfg):
    """The hiring form. Open to riders who signed up through the rider link
    and to existing shoppers. The application lands on the admins' hiring
    page, and the account gets rider access only once an admin hires it."""
    if not await signups_open(conn, "rider"):
        raise ApiError(403, "signups_closed", "We aren't hiring riders right now.")
    if user.role in ("seller", "admin"):
        raise ApiError(409, "role_conflict", "Store owners and admins can't also ride. Use a separate account.")
    async with conn.transaction():
        existing = await conn.fetchval("select status from riders where id = $1", user.id)
        if existing and existing != "rejected":
            raise ApiError(409, "already_applied", "You have already applied.")
        await conn.execute(
            """insert into riders (id, full_name, phone, city, vehicle, licence_number, status)
               values ($1, $2, $3, $4, $5, $6, 'applicant')
               on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone,
                   city = excluded.city, vehicle = excluded.vehicle, licence_number = excluded.licence_number,
                   status = 'applicant', review_note = null""",
            user.id, body.full_name, body.phone, body.city, body.vehicle, body.licence_number,
        )
    return await _rider_me(conn, user.id, settings)


# ---------------------------------------------------------------------------
# Context
# ---------------------------------------------------------------------------


async def _rider_me(conn: asyncpg.Connection, rider_id: uuid.UUID, settings: Settings) -> dict:
    r = await conn.fetchrow(
        """select r.*,
                  (select count(*) from deliveries d where d.rider_id = r.id and d.status = any($2::text[]))::int
                      as active_deliveries,
                  (select count(*) from deliveries d where d.rider_id = r.id and d.status = 'delivered')::int
                      as completed_deliveries,
                  (select coalesce(sum(amount_cents), 0) from rider_earnings e where e.rider_id = r.id)::bigint
                      as earnings_cents,
                  (select coalesce(sum(amount_cents), 0) from rider_earnings e
                    where e.rider_id = r.id and not paid_out)::bigint as unpaid_earnings_cents
             from riders r where r.id = $1""",
        rider_id,
        list(LIVE),
    )
    if r is None:
        raise ApiError(404, "no_application", "There's no rider application for this account yet.")
    return {**dict(r), "currency": settings.currency}


class RiderCtx:
    def __init__(self, user: User, rider: asyncpg.Record):
        self.user = user
        self.id: uuid.UUID = user.id
        self.rider = rider


async def active_rider(user: CurrentUser, conn: Conn) -> RiderCtx:
    rider = await conn.fetchrow("select id, status, vehicle from riders where id = $1", user.id)
    if rider is None:
        raise ApiError(403, "not_a_rider", "Apply to ride first.")
    if rider["status"] != "active" or user.role != "rider":
        raise forbidden("Your rider account isn't active.")
    return RiderCtx(user, rider)


Rider = Annotated[RiderCtx, Depends(active_rider)]


@router.get("/me", response_model=RiderMe)
async def rider_me(user: AccountUser, conn: Conn, settings: Cfg):
    """The rider's profile, or the state of their application while they
    wait: status is "applicant" until an admin decides, then "active" or
    "rejected". 404 means they haven't applied yet."""
    return await _rider_me(conn, user.id, settings)


@router.post("/shift", response_model=RiderMe)
async def set_shift(body: ShiftIn, rider: Rider, conn: Conn, settings: Cfg):
    if not body.online:
        busy = await conn.fetchval(
            "select count(*) from deliveries where rider_id = $1 and status in ('accepted', 'picked_up')", rider.id
        )
        if busy:
            raise ApiError(409, "deliveries_in_progress", "Finish or hand back your deliveries before going offline.")
    await conn.execute("update riders set is_online = $2 where id = $1", rider.id, body.online)
    return await _rider_me(conn, rider.id, settings)


@router.post("/location", response_model=s.Message, dependencies=[sensitive_limit("rider-location")])
async def post_location(body: LocationIn, rider: Rider, conn: Conn):
    """Send every 10 to 15 seconds while on shift."""
    now = datetime.now(timezone.utc)
    speed_kmh = round(body.speed_mps * 3.6, 1) if body.speed_mps is not None else None
    async with conn.transaction():
        await conn.execute(
            """update riders set last_lat = $2, last_lng = $3, last_accuracy_m = $4, last_heading = $5,
                                 last_seen_at = $6, is_online = true
                where id = $1""",
            rider.id, body.lat, body.lng, body.accuracy_m, body.heading, now,
        )
        active = await conn.fetch(
            "select id from deliveries where rider_id = $1 and status in ('accepted', 'picked_up')", rider.id
        )
        await conn.execute(
            """insert into rider_locations (rider_id, delivery_id, lat, lng, accuracy_m, heading, recorded_at)
               values ($1, $2, $3, $4, $5, $6, $7)""",
            rider.id, active[0]["id"] if active else None, body.lat, body.lng, body.accuracy_m, body.heading, now,
        )
        for d in active:
            await publish(conn, [f"delivery:{d['id']}", "admin"], {
                "type": "location", "delivery_id": str(d["id"]), "lat": body.lat, "lng": body.lng,
                "heading": body.heading, "speed_kmh": speed_kmh, "at": now.isoformat(),
            })
        if not active:
            # Still useful for the admin's live map of riders on shift.
            await publish(conn, ["admin"], {
                "type": "rider_location", "rider_id": str(rider.id), "lat": body.lat, "lng": body.lng,
                "heading": body.heading, "speed_kmh": speed_kmh, "at": now.isoformat(),
            })
    return {"ok": True}


# ---------------------------------------------------------------------------
# Deliveries
# ---------------------------------------------------------------------------

DELIVERY_SELECT = """
    select d.*, o.number as order_number, o.shipping_address, o.payment_method,
           so.payment_status, so.subtotal_cents, so.discount_cents, so.shipping_cents,
           st.slug as store_slug, st.name as store_name,
           (select coalesce(sum(quantity), 0) from order_items where store_order_id = so.id)::int as items
      from deliveries d
      join store_orders so on so.id = d.store_order_id
      join orders o on o.id = so.order_id
      join stores st on st.id = d.store_id
"""


def _for_rider(d: asyncpg.Record) -> dict:
    accepted = d["status"] in ("accepted", "picked_up", "delivered")
    addr = d["shipping_address"] or {}
    cash = 0
    if d["payment_method"] == "cod" and d["payment_status"] != "paid":
        cash = d["subtotal_cents"] - d["discount_cents"] + d["shipping_cents"]
    return {
        "id": d["id"],
        "status": d["status"],
        "order_number": d["order_number"],
        "store": {"slug": d["store_slug"], "name": d["store_name"]},
        "pickup": d["pickup"],
        # Until the rider accepts, they only see roughly where the job goes.
        "dropoff": d["dropoff"] if accepted else coarse(d["dropoff"]),
        "dropoff_address": {k: addr.get(k) for k in ("line1", "line2", "city", "region", "postal_code")}
        if accepted else {"city": addr.get("city")},
        "customer_name": addr.get("full_name") if accepted else None,
        "customer_phone": addr.get("phone") if d["status"] in ("accepted", "picked_up") else None,
        "cash_to_collect_cents": cash,
        "fee_cents": d["fee_cents"],
        "currency": d["currency"],
        "items": d["items"],
        "assigned_at": d["assigned_at"],
        "accepted_at": d["accepted_at"],
        "picked_up_at": d["picked_up_at"],
        "delivered_at": d["delivered_at"],
    }


@router.get("/deliveries", response_model=s.Page[RiderDelivery])
async def my_deliveries(
    rider: Rider,
    conn: Conn,
    pg: Annotated[Paging, Depends(paging)],
    scope: Literal["active", "history"] = "active",
):
    cond = "d.rider_id = $1 and d.status = any($2::text[])"
    statuses = list(LIVE) if scope == "active" else ["delivered", "failed", "declined", "canceled"]
    total = await conn.fetchval(f"select count(*) from deliveries d where {cond}", rider.id, statuses)
    recs = await conn.fetch(
        DELIVERY_SELECT + f" where {cond} order by d.assigned_at desc limit $3 offset $4",
        rider.id, statuses, pg.page_size, pg.offset,
    )
    return pg.wrap([_for_rider(r) for r in recs], total)


@router.get("/deliveries/{delivery_id}", response_model=RiderDelivery)
async def my_delivery(delivery_id: uuid.UUID, rider: Rider, conn: Conn):
    d = await conn.fetchrow(DELIVERY_SELECT + " where d.id = $1 and d.rider_id = $2", delivery_id, rider.id)
    if d is None:
        raise not_found("delivery")
    return _for_rider(d)


@router.patch("/deliveries/{delivery_id}", response_model=RiderDelivery,
              dependencies=[sensitive_limit("rider-action")])
async def act(delivery_id: uuid.UUID, body: DeliveryActionIn, rider: Rider, conn: Conn, settings: Cfg):
    now = datetime.now(timezone.utc)
    code_ok = False
    if body.action == "delivered":
        # Checked in its own transaction so a wrong guess is counted even
        # though the request fails. Five wrong guesses lock the delivery.
        async with conn.transaction():
            d = await conn.fetchrow(
                "select status, handover_code, code_attempts from deliveries where id = $1 and rider_id = $2 for update",
                delivery_id, rider.id,
            )
            if d is None:
                raise not_found("delivery")
            if d["status"] == "picked_up":
                if d["code_attempts"] >= MAX_CODE_ATTEMPTS:
                    raise ApiError(423, "code_locked", "Too many wrong codes. Ask the store to contact the buyer.")
                if body.code and secrets.compare_digest(body.code, d["handover_code"]):
                    code_ok = True
                else:
                    await conn.execute(
                        "update deliveries set code_attempts = code_attempts + 1 where id = $1", delivery_id
                    )
        if d["status"] == "picked_up" and not code_ok:
            left = MAX_CODE_ATTEMPTS - d["code_attempts"] - 1
            raise ApiError(422, "wrong_code", f"That code is wrong. {left} attempts left.")

    async with conn.transaction():
        d = await conn.fetchrow(
            "select * from deliveries where id = $1 and rider_id = $2 for update", delivery_id, rider.id
        )
        if d is None:
            raise not_found("delivery")
        status = d["status"]

        def need(*states):
            if status not in states:
                raise ApiError(409, "bad_transition", f"This delivery is {status}.")

        if body.action == "accept":
            need("assigned")
            busy = await conn.fetchval(
                "select count(*) from deliveries where rider_id = $1 and status in ('accepted', 'picked_up')",
                rider.id,
            )
            if busy >= MAX_ACTIVE_DELIVERIES:
                raise ApiError(409, "too_many_deliveries", "Finish a delivery before taking another.")
            await conn.execute("update deliveries set status = 'accepted', accepted_at = $2 where id = $1",
                               delivery_id, now)

        elif body.action == "decline":
            need("assigned")
            await conn.execute(
                "update deliveries set status = 'declined', ended_at = $2, note = $3 where id = $1",
                delivery_id, now, body.note,
            )

        elif body.action == "picked_up":
            need("accepted")
            await conn.execute("update deliveries set status = 'picked_up', picked_up_at = $2 where id = $1",
                               delivery_id, now)
            await conn.execute(
                """update store_orders set status = 'shipped', shipped_at = $2, tracking_carrier = 'Bazaar rider',
                          tracking_number = $3
                    where id = $1 and status = 'processing'""",
                d["store_order_id"], now, str(delivery_id)[:8].upper(),
            )

        elif body.action == "delivered":
            need("picked_up")
            if not code_ok:
                raise ApiError(409, "bad_transition", "Check the handover code again.")
            await conn.execute(
                "update deliveries set status = 'delivered', delivered_at = $2, ended_at = $2 where id = $1",
                delivery_id, now,
            )
            await conn.execute(
                "update store_orders set status = 'delivered', delivered_at = $2 where id = $1 and status = 'shipped'",
                d["store_order_id"], now,
            )
            if d["fee_cents"] > 0:
                await conn.execute(
                    """insert into rider_earnings (rider_id, delivery_id, amount_cents, currency)
                       values ($1, $2, $3, $4) on conflict (delivery_id) do nothing""",
                    rider.id, delivery_id, d["fee_cents"], d["currency"],
                )
                await conn.execute(
                    """insert into ledger_entries (store_id, kind, amount_cents, currency, ref_type, ref_id, memo)
                       values ($1, 'delivery', $2, $3, 'delivery', $4, 'Rider delivery fee')""",
                    d["store_id"], -d["fee_cents"], d["currency"], delivery_id,
                )

        else:  # failed
            need("accepted", "picked_up")
            if not body.note:
                raise ApiError(422, "note_required", "Say what went wrong.")
            await conn.execute(
                "update deliveries set status = 'failed', ended_at = $2, note = $3 where id = $1",
                delivery_id, now, body.note,
            )
            # Back to the store's queue to re-dispatch or cancel.
            await conn.execute(
                "update store_orders set status = 'processing' where id = $1 and status = 'shipped'",
                d["store_order_id"],
            )

    if body.action == "decline":
        # Straight on to the next closest rider.
        await dispatch.try_assign(conn, [d["store_order_id"]], settings)
    rec = await conn.fetchrow(DELIVERY_SELECT + " where d.id = $1", delivery_id)
    return _for_rider(rec)


@router.get("/earnings", response_model=s.Page[Earning])
async def earnings(rider: Rider, conn: Conn, pg: Annotated[Paging, Depends(paging)]):
    total = await conn.fetchval("select count(*) from rider_earnings where rider_id = $1", rider.id)
    recs = await conn.fetch(
        """select id, delivery_id, amount_cents, currency, paid_out, created_at from rider_earnings
            where rider_id = $1 order by created_at desc limit $2 offset $3""",
        rider.id, pg.page_size, pg.offset,
    )
    return pg.wrap([dict(r) for r in recs], total)


__all__ = ["router", "Request"]
