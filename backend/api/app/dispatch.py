"""Matching orders with riders.

When a store order is ready to leave the shop (pay on arrival straight
away, prepaid transfers once the payment is confirmed), two things happen:

  * it appears on the job board of every hired rider on shift within the
    admin's pool radius of the shop, who can claim it or skip it
  * it is offered to the closest free rider to the shop, who has
    DISPATCH_ACCEPT_SECONDS to accept before it passes to the next one

"Free" means hired and active, on shift, heard from in the last ten
minutes, within the pool radius, hasn't turned this order down or skipped
it, and can carry it under the batching rules (rider_batch_block in the
database): an idle rider can take anything; a rider already on a run only
takes jobs from the same or a nearby shop going near every drop-off they
already carry, up to the admin's batch size. Idle riders are preferred.

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

LIVE = ("assigned", "accepted", "picked_up")
FRESH_FIX = "interval '10 minutes'"

AVAILABLE = f"""
    r.status = 'active' and p.role = 'rider' and r.is_online
    and r.last_seen_at > now() - {FRESH_FIX}
    and r.last_lat is not null and r.last_lng is not null
    and not exists (select 1 from deliveries d where d.rider_id = r.id and d.status = 'assigned')
"""


async def rules(conn: asyncpg.Connection) -> asyncpg.Record:
    """The admin's rider settings."""
    return await conn.fetchrow(
        """select rider_fee_cents, rider_commission_rate::float as commission_rate,
                  rider_pool_radius_km::float as pool_radius_km, rider_batch_radius_km::float as batch_radius_km,
                  rider_pickup_radius_km::float as pickup_radius_km, rider_max_batch as max_batch
             from app_settings"""
    )


async def hold_days(conn: asyncpg.Connection) -> int:
    """Days a store's takings are held before they can be paid out."""
    return await conn.fetchval("select payout_interval_days from app_settings")


def earning(r: asyncpg.Record, shipping_cents: int) -> int:
    """What a rider earns for one delivery: the admin's flat fee plus their
    share of the delivery charge the shopper paid."""
    return r["rider_fee_cents"] + round(r["commission_rate"] * (shipping_cents or 0))


def _point(p) -> bool:
    return isinstance(p, (int, float))


async def create_delivery(
    conn: asyncpg.Connection,
    so: asyncpg.Record,
    rider_id: uuid.UUID,
    settings: Settings,
    note: str | None = None,
    status: str = "assigned",
) -> uuid.UUID:
    """so: the row from ready_order(). status "accepted" is a rider claiming
    the job themselves; the delivery then joins their current run."""
    addr = so["shipping_address"] or {}
    label = (so["pickup_address"] or {}).get("label") or so["store_name"]
    pickup = {"lat": so["pickup_lat"], "lng": so["pickup_lng"], "label": label}
    dropoff = {"label": ", ".join(x for x in (addr.get("line1"), addr.get("city")) if x)}
    if _point(addr.get("lat")) and _point(addr.get("lng")):
        dropoff.update(lat=addr["lat"], lng=addr["lng"])
    run_id = await start_or_join_run(conn, rider_id) if status == "accepted" else None
    return await conn.fetchval(
        """insert into deliveries (store_order_id, store_id, rider_id, pickup, dropoff, handover_code,
                                   fee_cents, currency, note, status, accepted_at, run_id)
           values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10,
                   case when $10 = 'accepted' then now() end, $11) returning id""",
        so["id"], so["store_id"], rider_id, pickup, dropoff,
        f"{secrets.randbelow(1_000_000):06d}", earning(await rules(conn), so["shipping_cents"]),
        so["currency"], note, status, run_id,
    )


async def start_or_join_run(conn: asyncpg.Connection, rider_id: uuid.UUID) -> uuid.UUID:
    """The run a newly accepted job belongs to: the rider's current one if
    they still have jobs on it, otherwise a fresh one."""
    busy = await conn.fetchval(
        "select count(*) from deliveries where rider_id = $1 and status in ('accepted', 'picked_up')", rider_id
    )
    current = await conn.fetchval("select current_run_id from riders where id = $1", rider_id)
    if busy and current:
        return current
    run_id = uuid.uuid4()
    await conn.execute("update riders set current_run_id = $2 where id = $1", rider_id, run_id)
    return run_id


def _dropoff(so: asyncpg.Record) -> tuple[float | None, float | None]:
    addr = so["shipping_address"] or {}
    if _point(addr.get("lat")) and _point(addr.get("lng")):
        return float(addr["lat"]), float(addr["lng"])
    return None, None


async def ready_order(conn: asyncpg.Connection, store_order_id: uuid.UUID, store_id: uuid.UUID | None = None):
    """Lock the store order and return it with what a delivery needs, or
    None if it doesn't exist (or isn't this store's).

    The lock is taken first and the row read in a second statement. Under
    read committed a statement keeps the snapshot it started with, so a
    single locking select that had to wait would still see no rider in
    `has_rider` after a rival committed one."""
    if not await conn.fetchval(
        "select 1 from store_orders where id = $1 and ($2::uuid is null or store_id = $2) for update",
        store_order_id, store_id,
    ):
        return None
    return await conn.fetchrow(
        """select so.id, so.store_id, so.status, so.auto_dispatch, so.shipping_cents, o.shipping_address, o.currency,
                  st.name as store_name, st.pickup_lat, st.pickup_lng, st.pickup_address,
                  exists (select 1 from deliveries d where d.store_order_id = so.id
                           and d.status in ('assigned', 'accepted', 'picked_up')) as has_rider
             from store_orders so
             join orders o on o.id = so.order_id
             join stores st on st.id = so.store_id
            where so.id = $1 and ($2::uuid is null or so.store_id = $2)""",
        store_order_id, store_id,
    )


async def nearest_rider(conn: asyncpg.Connection, so: asyncpg.Record, settings: Settings) -> asyncpg.Record | None:
    dlat, dlng = _dropoff(so)
    return await conn.fetchrow(
        f"""select r.id, km(r.last_lat, r.last_lng, $2, $3) as km
              from riders r join profiles p on p.id = r.id
             where {AVAILABLE}
               and km(r.last_lat, r.last_lng, $2, $3) <= (select rider_pool_radius_km from app_settings)
               and not exists (select 1 from deliveries d where d.store_order_id = $1 and d.rider_id = r.id
                                  and d.status in ('declined', 'failed'))
               and not exists (select 1 from rider_job_skips k where k.store_order_id = $1 and k.rider_id = r.id)
               and rider_batch_block(r.id, $4, $2, $3, $5, $6) is null
             order by (select count(*) from deliveries d where d.rider_id = r.id
                        and d.status in ('accepted', 'picked_up')) > 0,
                      km, r.last_seen_at desc
             limit 1
             for update of r skip locked""",
        so["id"], so["pickup_lat"], so["pickup_lng"], so["store_id"], dlat, dlng,
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
