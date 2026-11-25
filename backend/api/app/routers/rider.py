"""Riders: apply, go online, share location, take and complete deliveries."""

import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

import asyncpg
from fastapi import APIRouter, Depends, Query, Request
from pydantic import Field, StringConstraints

from .. import schemas as s
from ..auth import AccountUser, CurrentUser, User
from ..common import Paging, paging
from ..config import Settings, get_settings
from ..db import get_conn
from ..errors import ApiError, forbidden, not_found
from ..geo import coarse, haversine_km
from .. import dispatch
from .. import payments_bank as bank
from ..realtime import publish
from ..security import sensitive_limit

router = APIRouter(prefix="/rider", tags=["rider"])
Conn = Annotated[asyncpg.Connection, Depends(get_conn)]
Cfg = Annotated[Settings, Depends(get_settings)]

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
    ride_status: Literal["offline", "idle", "delivering"]
    rules: "RiderRules"


class RiderRules(s.BaseModel):
    """The admin's rules for riders, so the app can explain what's locked."""
    pool_radius_km: float
    batch_radius_km: float
    pickup_radius_km: float
    max_batch: int
    commission_rate: float
    rider_fee_cents: int


RiderMe.model_rebuild()


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


class RiderStore(s.BaseModel):
    id: uuid.UUID
    slug: str
    name: str


class RiderDelivery(s.BaseModel):
    id: uuid.UUID
    # assigned (offered), accepted, picked_up, arrived (picked up and at the
    # door), delivered, failed, declined, canceled.
    status: str
    order_number: str
    placed_at: datetime
    store: RiderStore
    pickup: Point | None
    dropoff: Point | None
    dropoff_address: dict | None
    customer_name: str | None
    customer_phone: str | None
    # The shopper's note for the rider ("blue gate, call on arrival").
    customer_note: str | None
    # Still to be paid for this store's part of the order. Same number as
    # cash_to_collect_cents, which older clients read.
    amount_due_cents: int
    cash_to_collect_cents: int
    payment_confirmed: bool
    earning_cents: int
    fee_cents: int
    currency: str
    items: int
    run_id: uuid.UUID | None
    assigned_at: datetime
    accepted_at: datetime | None
    picked_up_at: datetime | None
    arrived_at: datetime | None
    delivered_at: datetime | None


class DeliveryActionIn(s.Strict):
    action: Literal["accept", "decline", "picked_up", "delivered", "failed"]
    code: Annotated[str, StringConstraints(pattern=r"^[0-9]{6}$")] | None = None
    note: s.MediumText | None = None


class OpenJob(s.BaseModel):
    id: uuid.UUID = Field(description="The store order id. Claim and skip use it.")
    delivery_id: uuid.UUID | None = Field(None, description="Set when this job is offered to you.")
    offered: bool
    offer_expires_at: datetime | None
    order_number: str
    placed_at: datetime
    store: RiderStore
    pickup: Point
    dropoff: Point | None = Field(description="Rounded to about a kilometre until you accept.")
    area: str | None
    earning_cents: int
    amount_due_cents: int
    currency: str
    items: int
    distance_km: float | None = Field(description="From you to the shop.")
    trip_km: float | None = Field(description="From the shop to the drop-off.")
    batchable: bool
    blocked_reason: Literal["batch_full", "pickup_far", "on_run_far"] | None


class OpenJobs(s.BaseModel):
    items: list[OpenJob]
    ride_status: Literal["offline", "idle", "delivering"]
    rules: RiderRules


class Waypoint(s.BaseModel):
    kind: Literal["rider", "pickup", "dropoff"]
    lat: float
    lng: float
    label: str | None
    delivery_ids: list[uuid.UUID]


class RiderRun(s.BaseModel):
    run_id: uuid.UUID | None
    stops: list[RiderDelivery]
    route: list[Waypoint]


class PaymentMatch(s.BaseModel):
    receipt_id: uuid.UUID
    code: str = Field(description="Masked to the last 3 characters when found by name.")
    payer_name: str | None
    amount_cents: int | None
    currency: str | None
    received_at: datetime | None
    used: bool
    enough: bool


class PaymentCheck(s.BaseModel):
    due_cents: int
    paid_cents: int
    payment_confirmed: bool
    currency: str
    matches: list[PaymentMatch] = []


class PaymentIn(s.Strict):
    code: Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Za-z0-9]{6,24}$")] | None = None
    receipt_id: uuid.UUID | None = None


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
    busy = await conn.fetchval(
        "select count(*) from deliveries where rider_id = $1 and status in ('accepted', 'picked_up')", rider_id
    )
    ride = "delivering" if busy else "idle" if r["is_online"] else "offline"
    return {**dict(r), "currency": settings.currency, "ride_status": ride, "rules": await _rules(conn)}


async def _rules(conn: asyncpg.Connection) -> dict:
    return dict(await dispatch.rules(conn))


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
    select d.*, o.id as order_id, o.number as order_number, o.created_at as placed_at, o.shipping_address,
           o.payment_method, so.payment_status, so.subtotal_cents, so.discount_cents, so.shipping_cents,
           st.slug as store_slug, st.name as store_name,
           (select coalesce(sum(quantity), 0) from order_items where store_order_id = so.id)::int as items
      from deliveries d
      join store_orders so on so.id = d.store_order_id
      join orders o on o.id = so.order_id
      join stores st on st.id = d.store_id
"""


async def _due(conn: asyncpg.Connection, order_id: uuid.UUID, store_order_id: uuid.UUID) -> tuple[int, bool]:
    state = await bank.payment_state(conn, order_id, store_order_id)
    return state["due_cents"], state["payment_confirmed"]


async def _view(conn: asyncpg.Connection, d: asyncpg.Record) -> dict:
    accepted = d["status"] in ("accepted", "picked_up", "delivered")
    live = d["status"] in ("accepted", "picked_up")
    addr = d["shipping_address"] or {}
    due, confirmed = await _due(conn, d["order_id"], d["store_order_id"])
    status = d["status"]
    if status == "picked_up" and d["arrived_at"] is not None:
        status = "arrived"
    return {
        "id": d["id"],
        "status": status,
        "order_number": d["order_number"],
        "placed_at": d["placed_at"],
        "store": {"id": d["store_id"], "slug": d["store_slug"], "name": d["store_name"]},
        "pickup": d["pickup"],
        # Until the rider accepts, they only see roughly where the job goes.
        "dropoff": d["dropoff"] if accepted else coarse(d["dropoff"]),
        "dropoff_address": {k: addr.get(k) for k in ("line1", "line2", "city", "region", "postal_code")}
        if accepted else {"city": addr.get("city")},
        "customer_name": addr.get("full_name") if accepted else None,
        "customer_phone": addr.get("phone") if live else None,
        "customer_note": addr.get("dropoff_note") if live else None,
        "amount_due_cents": due,
        "cash_to_collect_cents": due,
        "payment_confirmed": confirmed,
        "earning_cents": d["fee_cents"],
        "fee_cents": d["fee_cents"],
        "currency": d["currency"],
        "items": d["items"],
        "run_id": d["run_id"],
        "assigned_at": d["assigned_at"],
        "accepted_at": d["accepted_at"],
        "picked_up_at": d["picked_up_at"],
        "arrived_at": d["arrived_at"],
        "delivered_at": d["delivered_at"],
    }


async def _one(conn: asyncpg.Connection, delivery_id: uuid.UUID, rider_id: uuid.UUID) -> dict:
    d = await conn.fetchrow(DELIVERY_SELECT + " where d.id = $1 and d.rider_id = $2", delivery_id, rider_id)
    if d is None:
        raise not_found("delivery")
    return await _view(conn, d)


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
    return pg.wrap([await _view(conn, r) for r in recs], total)


@router.get("/deliveries/{delivery_id}", response_model=RiderDelivery)
async def my_delivery(delivery_id: uuid.UUID, rider: Rider, conn: Conn):
    return await _one(conn, delivery_id, rider.id)


async def _lock_rider(conn: asyncpg.Connection, rider_id: uuid.UUID) -> None:
    """Serialises one rider's claims and accepts, so two taps at once can't
    take them past the batch size."""
    await conn.execute("select 1 from riders where id = $1 for update", rider_id)


_BLOCKED = {
    "batch_full": (409, "batch_full", "You're carrying as many orders as one run allows. Finish one first."),
    "pickup_far": (409, "not_batchable", "This shop isn't close enough to the shops on your run."),
    "on_run_far": (409, "not_batchable", "This drop-off isn't close enough to the ones on your run."),
}


async def _check_batch(conn: asyncpg.Connection, rider_id: uuid.UUID, store_id: uuid.UUID,
                       pickup: dict | None, dropoff: dict | None) -> None:
    p, q = pickup or {}, dropoff or {}
    reason = await conn.fetchval(
        "select rider_batch_block($1, $2, $3, $4, $5, $6)",
        rider_id, store_id, p.get("lat"), p.get("lng"), q.get("lat"), q.get("lng"),
    )
    if reason:
        status, code, msg = _BLOCKED[reason]
        raise ApiError(status, code, msg)


@router.patch("/deliveries/{delivery_id}", response_model=RiderDelivery,
              dependencies=[sensitive_limit("rider-action")])
async def act(delivery_id: uuid.UUID, body: DeliveryActionIn, rider: Rider, conn: Conn, settings: Cfg):
    """accept or decline an offer, then picked_up at the shop, and delivered
    at the door with the shopper's 6 digit handover code once the payment
    is confirmed (POST .../payment). failed needs a note."""
    now = datetime.now(timezone.utc)
    code_ok = False
    if body.action == "delivered":
        # The payment first: a wrong handover code shouldn't burn an attempt
        # while the shopper is still paying.
        so = await conn.fetchrow(
            """select so.payment_status from deliveries d join store_orders so on so.id = d.store_order_id
                where d.id = $1 and d.rider_id = $2""",
            delivery_id, rider.id,
        )
        if so is None:
            raise not_found("delivery")
        if so["payment_status"] != "paid":
            raise ApiError(409, "payment_not_confirmed",
                           "Confirm the shopper's payment with its transaction code first.")
        # Checked in its own transaction so a wrong guess is counted even
        # though the request fails. Five wrong guesses lock the delivery.
        async with conn.transaction():
            d = await conn.fetchrow(
                "select status, handover_code, code_attempts from deliveries where id = $1 and rider_id = $2 for update",
                delivery_id, rider.id,
            )
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
        if body.action == "accept":
            await _lock_rider(conn, rider.id)
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
            await _check_batch(conn, rider.id, d["store_id"], d["pickup"], d["dropoff"])
            run_id = await dispatch.start_or_join_run(conn, rider.id)
            await conn.execute(
                "update deliveries set status = 'accepted', accepted_at = $2, run_id = $3 where id = $1",
                delivery_id, now, run_id,
            )

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
                # The rider's earning is recorded now, and the store pays it
                # out of its takings as the delivery charge.
                await conn.execute(
                    """insert into rider_earnings (rider_id, delivery_id, amount_cents, currency)
                       values ($1, $2, $3, $4) on conflict (delivery_id) do nothing""",
                    rider.id, delivery_id, d["fee_cents"], d["currency"],
                )
                await conn.execute(
                    """insert into ledger_entries (store_id, kind, amount_cents, currency, ref_type, ref_id, memo)
                       values ($1, 'delivery', $2, $3, 'delivery', $4, 'Rider delivery charge')""",
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
    return await _one(conn, delivery_id, rider.id)


# ---------------------------------------------------------------------------
# The job board
# ---------------------------------------------------------------------------

_BOARD = """
    with me as (select id, last_lat, last_lng from riders where id = $1),
    jobs as (
        select so.id, so.store_id, so.shipping_cents, o.id as order_id, o.number, o.created_at as placed_at,
               o.shipping_address, o.currency, st.slug, st.name, st.pickup_lat, st.pickup_lng, st.pickup_address,
               null::uuid as delivery_id, null::timestamptz as assigned_at, null::integer as offer_fee
          from store_orders so
          join orders o on o.id = so.order_id
          join stores st on st.id = so.store_id, me
         where so.status = 'processing' and so.auto_dispatch and st.pickup_lat is not null
           and not exists (select 1 from deliveries d where d.store_order_id = so.id
                            and d.status in ('assigned', 'accepted', 'picked_up'))
           and not exists (select 1 from deliveries d where d.store_order_id = so.id and d.rider_id = me.id
                            and d.status in ('declined', 'failed'))
           and not exists (select 1 from rider_job_skips k where k.store_order_id = so.id and k.rider_id = me.id)
           and km(me.last_lat, me.last_lng, st.pickup_lat, st.pickup_lng)
               <= (select rider_pool_radius_km from app_settings)
        union all
        select so.id, so.store_id, so.shipping_cents, o.id, o.number, o.created_at, o.shipping_address, o.currency,
               st.slug, st.name, st.pickup_lat, st.pickup_lng, st.pickup_address, d.id, d.assigned_at, d.fee_cents
          from deliveries d
          join store_orders so on so.id = d.store_order_id
          join orders o on o.id = so.order_id
          join stores st on st.id = d.store_id
         where d.rider_id = $1 and d.status = 'assigned'
    )
    select j.*, (select coalesce(sum(quantity), 0) from order_items where store_order_id = j.id)::int as items,
           km(me.last_lat, me.last_lng, j.pickup_lat, j.pickup_lng) as distance_km,
           rider_batch_block(me.id, j.store_id, j.pickup_lat, j.pickup_lng,
                             (j.shipping_address->>'lat')::float8, (j.shipping_address->>'lng')::float8) as blocked
      from jobs j, me
     order by j.delivery_id is null, j.placed_at
     limit 50
"""


def _num(v) -> float | None:
    return float(v) if isinstance(v, (int, float)) else None


@router.get("/open-jobs", response_model=OpenJobs)
async def open_jobs(rider: Rider, conn: Conn, settings: Cfg):
    """Jobs waiting for a rider near you, and offers made to you, oldest
    order first (offers on top). While you're on a run, a job you can't add
    to it comes back with batchable false and the reason, so the app can
    grey it out. Needs you on shift with a recent location."""
    me = await _rider_me(conn, rider.id, settings)
    if me["ride_status"] == "offline" or me["last_seen_at"] is None:
        return {"items": [], "ride_status": me["ride_status"], "rules": me["rules"]}
    rules = await dispatch.rules(conn)
    items = []
    for j in await conn.fetch(_BOARD, rider.id):
        addr = j["shipping_address"] or {}
        drop = {"lat": addr.get("lat"), "lng": addr.get("lng")}
        trip = None
        if _num(drop["lat"]) is not None and _num(drop["lng"]) is not None:
            trip = round(haversine_km(j["pickup_lat"], j["pickup_lng"], drop["lat"], drop["lng"]), 2)
        due, _ = await _due(conn, j["order_id"], j["id"])
        offered = j["delivery_id"] is not None
        items.append({
            "id": j["id"],
            "delivery_id": j["delivery_id"],
            "offered": offered,
            "offer_expires_at": (j["assigned_at"] + timedelta(seconds=settings.dispatch_accept_seconds))
            if offered else None,
            "order_number": j["number"],
            "placed_at": j["placed_at"],
            "store": {"id": j["store_id"], "slug": j["slug"], "name": j["name"]},
            "pickup": {"lat": j["pickup_lat"], "lng": j["pickup_lng"],
                       "label": (j["pickup_address"] or {}).get("label") or j["name"]},
            "dropoff": coarse(drop),
            "area": addr.get("city"),
            "earning_cents": j["offer_fee"] if offered else dispatch.earning(rules, j["shipping_cents"]),
            "amount_due_cents": due,
            "currency": j["currency"],
            "items": j["items"],
            "distance_km": round(j["distance_km"], 2) if j["distance_km"] is not None else None,
            "trip_km": trip,
            "batchable": j["blocked"] is None,
            "blocked_reason": j["blocked"],
        })
    return {"items": items, "ride_status": me["ride_status"], "rules": me["rules"]}


@router.post("/open-jobs/{store_order_id}/claim", response_model=RiderDelivery,
             dependencies=[sensitive_limit("rider-action")])
async def claim(store_order_id: uuid.UUID, rider: Rider, conn: Conn, settings: Cfg):
    """Take a job from the board. It goes straight to accepted and joins your
    run. If it was offered to you, this accepts the offer."""
    async with conn.transaction():
        await _lock_rider(conn, rider.id)
        me = await conn.fetchrow(
            "select is_online, last_lat, last_lng, last_seen_at from riders where id = $1", rider.id
        )
        if not me["is_online"]:
            raise ApiError(409, "offline", "Go on shift to take jobs.")
        offer = await conn.fetchval(
            "select id from deliveries where store_order_id = $1 and rider_id = $2 and status = 'assigned'",
            store_order_id, rider.id,
        )
        if offer is None:
            so = await dispatch.ready_order(conn, store_order_id)
            if so is None:
                raise not_found("job")
            if so["status"] != "processing" or so["has_rider"] or not so["auto_dispatch"] or so["pickup_lat"] is None:
                raise ApiError(409, "taken", "Someone else has this job, or it isn't ready any more.")
            if me["last_lat"] is None:
                raise ApiError(409, "location_needed", "Share your location to take jobs.")
            pool = (await dispatch.rules(conn))["pool_radius_km"]
            if haversine_km(me["last_lat"], me["last_lng"], so["pickup_lat"], so["pickup_lng"]) > pool:
                raise ApiError(409, "too_far", "This shop is outside your area.")
            dlat, dlng = dispatch._dropoff(so)
            await _check_batch(conn, rider.id, so["store_id"],
                               {"lat": so["pickup_lat"], "lng": so["pickup_lng"]}, {"lat": dlat, "lng": dlng})
            await conn.execute(
                "delete from rider_job_skips where rider_id = $1 and store_order_id = $2", rider.id, store_order_id
            )
            delivery_id = await dispatch.create_delivery(conn, so, rider.id, settings, status="accepted")
    if offer is not None:
        return await act(offer, DeliveryActionIn(action="accept"), rider, conn, settings)
    return await _one(conn, delivery_id, rider.id)


@router.post("/open-jobs/{store_order_id}/skip", response_model=s.Message)
async def skip(store_order_id: uuid.UUID, rider: Rider, conn: Conn, settings: Cfg):
    """Not interested. The job leaves your board and won't be offered to you
    again. An offer you skip is declined and passes to the next rider."""
    async with conn.transaction():
        if not await conn.fetchval("select 1 from store_orders where id = $1", store_order_id):
            raise not_found("job")
        await conn.execute(
            "insert into rider_job_skips (rider_id, store_order_id) values ($1, $2) on conflict do nothing",
            rider.id, store_order_id,
        )
        declined = await conn.fetchval(
            """update deliveries set status = 'declined', ended_at = now(), note = coalesce(note, 'Skipped')
                where store_order_id = $1 and rider_id = $2 and status = 'assigned' returning id""",
            store_order_id, rider.id,
        )
    if declined:
        await dispatch.try_assign(conn, [store_order_id], settings)
    return {"ok": True}


# ---------------------------------------------------------------------------
# The run: stops and route
# ---------------------------------------------------------------------------


@router.get("/run", response_model=RiderRun)
async def run(rider: Rider, conn: Conn):
    """The jobs on your current run in the order they were placed, and the
    way to go: shops you still have to collect from, then drop-offs, oldest
    order first. Stops stay on the run (delivered ones too) until you start
    the next one."""
    r = await conn.fetchrow("select current_run_id, last_lat, last_lng from riders where id = $1", rider.id)
    if r["current_run_id"] is None:
        return {"run_id": None, "stops": [], "route": []}
    recs = await conn.fetch(
        DELIVERY_SELECT + """ where d.rider_id = $1 and d.run_id = $2
                               and d.status in ('accepted', 'picked_up', 'delivered', 'failed')
                             order by o.created_at, d.accepted_at""",
        rider.id, r["current_run_id"],
    )
    stops = [await _view(conn, d) for d in recs]
    route: list[dict] = []
    if r["last_lat"] is not None:
        route.append({"kind": "rider", "lat": r["last_lat"], "lng": r["last_lng"], "label": None, "delivery_ids": []})
    shops: dict[uuid.UUID, dict] = {}
    for d, stop in zip(recs, stops, strict=True):
        p = d["pickup"] or {}
        if d["status"] == "accepted" and _num(p.get("lat")) is not None:
            wp = shops.get(d["store_id"])
            if wp is None:
                wp = shops[d["store_id"]] = {"kind": "pickup", "lat": p["lat"], "lng": p["lng"],
                                             "label": stop["store"]["name"], "delivery_ids": []}
                route.append(wp)
            wp["delivery_ids"].append(d["id"])
    for d in recs:
        q = d["dropoff"] or {}
        if d["status"] in ("accepted", "picked_up") and _num(q.get("lat")) is not None:
            route.append({"kind": "dropoff", "lat": q["lat"], "lng": q["lng"], "label": q.get("label"),
                          "delivery_ids": [d["id"]]})
    return {"run_id": r["current_run_id"], "stops": stops, "route": route}


# ---------------------------------------------------------------------------
# At the door: arrived, then the payment
# ---------------------------------------------------------------------------


@router.post("/deliveries/{delivery_id}/arrived", response_model=RiderDelivery,
             dependencies=[sensitive_limit("rider-action")])
async def arrived(delivery_id: uuid.UUID, rider: Rider, conn: Conn):
    """You're at the drop-off. Admins get a payment check ping, and the
    shopper is told to pay the till now, quoting their order number."""
    async with conn.transaction():
        d = await conn.fetchrow(
            """select d.id, d.status, d.arrived_at, d.store_order_id, o.id as order_id, o.number, o.user_id
                 from deliveries d join store_orders so on so.id = d.store_order_id
                 join orders o on o.id = so.order_id
                where d.id = $1 and d.rider_id = $2 for update of d""",
            delivery_id, rider.id,
        )
        if d is None:
            raise not_found("delivery")
        if d["status"] != "picked_up":
            raise ApiError(409, "bad_transition", "Collect the parcel before marking yourself arrived.")
        if d["arrived_at"] is None:
            await conn.execute("update deliveries set arrived_at = now() where id = $1", delivery_id)
            due, confirmed = await _due(conn, d["order_id"], d["store_order_id"])
            event = {"type": "arrived", "delivery_id": str(delivery_id), "order_id": str(d["order_id"]),
                     "order_number": d["number"], "amount_due_cents": due, "payment_confirmed": confirmed}
            await publish(conn, ["ops", f"user:{d['user_id']}", f"delivery:{delivery_id}"], event)
    return await _one(conn, delivery_id, rider.id)


async def _door(conn: asyncpg.Connection, delivery_id: uuid.UUID, rider_id: uuid.UUID) -> asyncpg.Record:
    d = await conn.fetchrow(
        """select d.id, d.status, d.arrived_at, d.store_order_id, so.order_id
             from deliveries d join store_orders so on so.id = d.store_order_id
            where d.id = $1 and d.rider_id = $2""",
        delivery_id, rider_id,
    )
    if d is None:
        raise not_found("delivery")
    if d["status"] != "picked_up" or d["arrived_at"] is None:
        raise ApiError(409, "not_arrived", "Mark yourself arrived at the drop-off first.")
    return d


_CODE = re.compile(r"^(?=.*[0-9])(?=.*[A-Z])[A-Z0-9]{6,24}$")


@router.get("/deliveries/{delivery_id}/payment", response_model=PaymentCheck,
            dependencies=[sensitive_limit("rider-payment")])
async def payment_lookup(
    delivery_id: uuid.UUID,
    rider: Rider,
    conn: Conn,
    q: Annotated[str | None, Query(max_length=80)] = None,
):
    """What's still owed at this door, and the payments that match q: a
    transaction code (exact) or the payer's name (3 or more letters, up to 3
    recent unused payments, codes masked). A used code shows used: true and
    nothing else about it."""
    d = await _door(conn, delivery_id, rider.id)
    state = await bank.payment_state(conn, d["order_id"], d["store_order_id"])
    matches: list[dict] = []
    term = " ".join((q or "").split())
    if term:
        code = term.upper().replace(" ", "")
        if _CODE.match(code):
            recs = await conn.fetch(
                "select * from payment_receipts where code = $1 order by provider = 'mpesa' desc", code
            )
            for r in recs:
                used = r["status"] == "confirmed"
                mine = r["order_id"] == d["order_id"]
                hide = (used and not mine) or r["status"] == "void"
                matches.append({
                    "receipt_id": r["id"], "code": r["code"],
                    "payer_name": None if hide else r["payer_name"],
                    "amount_cents": None if hide else r["amount_cents"],
                    "currency": None if hide else r["currency"],
                    "received_at": None if hide else r["received_at"],
                    "used": used or r["status"] == "void",
                    "enough": (not hide) and not used and r["amount_cents"] >= state["due_cents"],
                })
        elif len(term) >= 3 and re.fullmatch(r"[A-Za-z .'-]+", term):
            words = [w.lower() for w in term.split() if len(w) >= 2][:4]
            recs = await conn.fetch(
                """select * from payment_receipts
                    where status = 'unconfirmed' and expires_at > now()
                      and (select bool_and(strpos(lower(coalesce(payer_name, '')), w) > 0) from unnest($1::text[]) w)
                    order by received_at desc limit 3""",
                words,
            )
            for r in recs:
                matches.append({
                    "receipt_id": r["id"], "code": bank.mask_code(r["code"]), "payer_name": r["payer_name"],
                    "amount_cents": r["amount_cents"], "currency": r["currency"], "received_at": r["received_at"],
                    "used": False, "enough": r["amount_cents"] >= state["due_cents"],
                })
    return {**state, "matches": matches}


@router.post("/deliveries/{delivery_id}/payment", response_model=PaymentCheck,
             dependencies=[sensitive_limit("rider-payment")])
async def payment_confirm(delivery_id: uuid.UUID, body: PaymentIn, rider: Rider, conn: Conn):
    """Use a payment for this order: by its transaction code, or by the
    receipt_id a name search returned. The payment is spent for good; using
    it again anywhere fails with 409 code_used. Partial payments add up."""
    if (body.code is None) == (body.receipt_id is None):
        raise ApiError(422, "one_of", "Send the transaction code or the receipt_id.")
    d = await _door(conn, delivery_id, rider.id)
    async with conn.transaction():
        await bank.set_actor(conn, rider.id)
        if body.receipt_id is not None:
            receipt_id = body.receipt_id
        else:
            receipt_id = await conn.fetchval(
                "select id from payment_receipts where code = $1 order by provider = 'mpesa' desc limit 1",
                body.code,
            )
            if receipt_id is None:
                raise ApiError(404, "not_found",
                               "No payment with that code has reached the till yet. Check it, or wait a minute.")
        await bank.apply_receipt(
            conn, receipt_id=receipt_id, order_id=d["order_id"], actor=rider.id, role="rider",
            hold_days=await dispatch.hold_days(conn), store_order_id=d["store_order_id"], delivery_id=delivery_id,
        )
    return {**await bank.payment_state(conn, d["order_id"], d["store_order_id"]), "matches": []}


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
