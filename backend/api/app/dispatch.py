"""Matching orders with riders.

When a store order is ready to leave the shop (cash on delivery straight
away, transfers once the store confirms the money), it is offered to the
closest free rider to the shop:

  * hired and active, on shift, and heard from in the last ten minutes
  * carrying fewer than MAX_ACTIVE_DELIVERIES jobs
  * within DISPATCH_RADIUS_KM of the shop, measured from the rider's last
    GPS fix to the store's pickup point
  * hasn't already turned this order down or failed it

The rider has DISPATCH_ACCEPT_SECONDS to accept. A decline, or silence,
passes the order on to the next closest rider. With nobody free, the order
waits and the worker tries again every few seconds, so a rider coming on
shift picks it up. The store can always step in and choose a rider itself.

Callers run assign_nearest() inside their own transaction. The rider row is
locked with SKIP LOCKED, so two orders being matched at the same moment
never both land on a rider who only had room for one.
"""

import logging
import secrets
import uuid

import asyncpg

from .config import Settings
from .errors import ApiError

log = logging.getLogger("api.dispatch")

MAX_ACTIVE_DELIVERIES = 3
LIVE = ("assigned", "accepted", "picked_up")
FRESH_FIX = "interval '10 minutes'"

# Great circle distance in km between ($lat, $lng) and the rider's last fix.
_DISTANCE = """
    6371 * 2 * asin(sqrt(
        power(sin(radians(r.last_lat - {lat}) / 2), 2)
        + cos(radians({lat})) * cos(radians(r.last_lat)) * power(sin(radians(r.last_lng - {lng}) / 2), 2)))
"""

AVAILABLE = f"""
    r.status = 'active' and p.role = 'rider' and r.is_online
    and r.last_seen_at > now() - {FRESH_FIX}
    and r.last_lat is not null and r.last_lng is not null
    and (select count(*) from deliveries d where d.rider_id = r.id
          and d.status in ('assigned', 'accepted', 'picked_up')) < {MAX_ACTIVE_DELIVERIES}
"""


async def rider_fee(conn: asyncpg.Connection) -> int:
    """What the store pays the rider per delivery, as the admin last set it."""
    return await conn.fetchval("select rider_fee_cents from app_settings")


def _point(p) -> bool:
    return isinstance(p, (int, float))


async def create_delivery(
    conn: asyncpg.Connection,
    so: asyncpg.Record,
    rider_id: uuid.UUID,
    settings: Settings,
    note: str | None = None,
) -> uuid.UUID:
    """so: the row from _ready_order()."""
    addr = so["shipping_address"] or {}
    label = (so["pickup_address"] or {}).get("label") or so["store_name"]
    pickup = {"lat": so["pickup_lat"], "lng": so["pickup_lng"], "label": label}
    dropoff = {"label": ", ".join(x for x in (addr.get("line1"), addr.get("city")) if x)}
    if _point(addr.get("lat")) and _point(addr.get("lng")):
        dropoff.update(lat=addr["lat"], lng=addr["lng"])
    return await conn.fetchval(
        """insert into deliveries (store_order_id, store_id, rider_id, pickup, dropoff, handover_code,
                                   fee_cents, currency, note)
           values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9) returning id""",
        so["id"], so["store_id"], rider_id, pickup, dropoff,
        f"{secrets.randbelow(1_000_000):06d}", await rider_fee(conn), so["currency"], note,
    )


async def ready_order(conn: asyncpg.Connection, store_order_id: uuid.UUID, store_id: uuid.UUID | None = None):
    """Lock the store order and return it with what a delivery needs, or
    None if it doesn't exist (or isn't this store's)."""
    return await conn.fetchrow(
        """select so.id, so.store_id, so.status, so.auto_dispatch, o.shipping_address, o.currency,
                  st.name as store_name, st.pickup_lat, st.pickup_lng, st.pickup_address,
                  exists (select 1 from deliveries d where d.store_order_id = so.id
                           and d.status in ('assigned', 'accepted', 'picked_up')) as has_rider
             from store_orders so
             join orders o on o.id = so.order_id
             join stores st on st.id = so.store_id
            where so.id = $1 and ($2::uuid is null or so.store_id = $2)
            for update of so""",
        store_order_id, store_id,
    )


async def nearest_rider(conn: asyncpg.Connection, so: asyncpg.Record, settings: Settings) -> asyncpg.Record | None:
    dist = _DISTANCE.format(lat="$2", lng="$3")
    return await conn.fetchrow(
        f"""select r.id, {dist} as km
              from riders r join profiles p on p.id = r.id
             where {AVAILABLE}
               and {dist} <= $4
               and not exists (select 1 from deliveries d where d.store_order_id = $1 and d.rider_id = r.id
                                  and d.status in ('declined', 'failed'))
             order by km, r.last_seen_at desc
             limit 1
             for update of r skip locked""",
        so["id"], so["pickup_lat"], so["pickup_lng"], settings.dispatch_radius_km,
    )


async def assign_nearest(conn: asyncpg.Connection, store_order_id: uuid.UUID, settings: Settings,
                         store_id: uuid.UUID | None = None, manual: bool = False) -> uuid.UUID | None:
    """Offer the order to the closest free rider. Returns the delivery id,
    or None when nobody is free (or the order isn't waiting for a rider).
    `manual` is the store pressing "find a rider": it raises instead of
    quietly returning None, and switches automatic dispatch back on."""
    so = await ready_order(conn, store_order_id, store_id)
    if so is None:
        if manual:
            raise ApiError(404, "not_found", "We couldn't find that order.")
        return None
    if so["status"] != "processing" or so["has_rider"]:
        if manual:
            raise ApiError(409, "not_ready" if so["status"] != "processing" else "already_dispatched",
                           "Only orders being prepared without a rider can be dispatched.")
        return None
    if so["pickup_lat"] is None:
        if manual:
            raise ApiError(422, "pickup_missing", "Set your store's pickup location before dispatching riders.")
        return None
    if not manual and not (so["auto_dispatch"] and settings.auto_dispatch):
        return None
    if manual and not so["auto_dispatch"]:
        await conn.execute("update store_orders set auto_dispatch = true where id = $1", so["id"])
    rider = await nearest_rider(conn, so, settings)
    if rider is None:
        if manual:
            raise ApiError(409, "no_riders", "No rider is free near your shop right now. "
                           "We'll keep trying and assign one as soon as someone is.")
        return None
    delivery_id = await create_delivery(conn, so, rider["id"], settings)
    log.info("order %s offered to rider %s (%.2f km)", so["id"], rider["id"], rider["km"])
    return delivery_id


async def try_assign(pool_or_conn, store_order_ids: list[uuid.UUID], settings: Settings) -> None:
    """Best effort matching after something made orders ready (checkout,
    payment confirmed, a rider declined). Each order in its own transaction:
    one failure never undoes the change that triggered it."""
    if not settings.auto_dispatch:
        return
    for so_id in store_order_ids:
        try:
            async with pool_or_conn.transaction():
                await assign_nearest(pool_or_conn, so_id, settings)
        except Exception:  # pragma: no cover - logged and retried by the worker
            log.exception("auto dispatch failed for %s", so_id)


async def sweep(conn: asyncpg.Connection, settings: Settings) -> tuple[int, int]:
    """Worker job: pass on offers nobody answered, then match every order
    still waiting. Returns (timed out, assigned)."""
    if not settings.auto_dispatch:
        return 0, 0
    async with conn.transaction():
        timed_out = await conn.fetchval(
            """with t as (
                   update deliveries set status = 'declined', ended_at = now(),
                          note = coalesce(note, 'No answer in time')
                    where status = 'assigned' and assigned_at < now() - make_interval(secs => $1)
                    returning 1)
               select count(*) from t""",
            settings.dispatch_accept_seconds,
        )
    waiting = await conn.fetch(
        """select so.id from store_orders so
            where so.status = 'processing' and so.auto_dispatch
              and not exists (select 1 from deliveries d where d.store_order_id = so.id
                                and d.status in ('assigned', 'accepted', 'picked_up'))
            order by so.created_at limit 200""",
    )
    assigned = 0
    for w in waiting:
        try:
            async with conn.transaction():
                if await assign_nearest(conn, w["id"], settings):
                    assigned += 1
        except Exception:  # pragma: no cover
            log.exception("auto dispatch failed for %s", w["id"])
    return timed_out, assigned


async def ready_store_orders(conn: asyncpg.Connection, order_id: uuid.UUID) -> list[uuid.UUID]:
    recs = await conn.fetch(
        "select id from store_orders where order_id = $1 and status = 'processing'", order_id
    )
    return [r["id"] for r in recs]
