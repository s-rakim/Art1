"""Background jobs. Run as a separate container from the same image:

    python -m app.worker

Every 15 seconds it matches waiting orders with the closest free rider and
passes on offers nobody answered. Every minute it bills rent that has come
due, switches placements on and off and releases stock held by unpaid
orders, and every hour it prunes old rider breadcrumbs. Each job is a database
function that is safe to run concurrently, so running two workers by
accident does no harm.
"""

import asyncio
import logging
import signal
import time

import asyncpg

from . import dispatch
from .config import get_settings
from .db import create_pool

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("worker")


async def tick(pool: asyncpg.Pool, hourly: bool) -> None:
    settings = get_settings()
    async with pool.acquire() as conn:
        async with conn.transaction():
            billed = await conn.fetchval("select bill_rent(now())")
            await conn.execute("select refresh_placements(current_date)")
            expired = await conn.fetchval(
                "select expire_unpaid_orders(make_interval(mins => $1), interval '72 hours')",
                settings.unpaid_order_ttl_minutes,
            )
        if billed or expired:
            log.info("billed %s subscriptions, expired %s unpaid orders", billed, expired)
        if hourly:
            pruned = await conn.fetchval(
                "select prune_rider_locations(make_interval(days => $1))", settings.rider_location_retention_days
            )
            log.info("pruned %s rider locations", pruned)


async def dispatch_tick(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        timed_out, assigned = await dispatch.sweep(conn, get_settings())
    if timed_out or assigned:
        log.info("dispatch: %s offers timed out, %s orders assigned", timed_out, assigned)


async def main() -> None:
    settings = get_settings()
    pool = await create_pool(settings.model_copy(update={"db_pool_min": 1, "db_pool_max": 2}))
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    last_hourly = 0.0
    last_minute = 0.0
    log.info("worker started")
    while not stop.is_set():
        try:
            await dispatch_tick(pool)
        except Exception:
            log.exception("dispatch tick failed")
        if time.monotonic() - last_minute >= 60:
            last_minute = time.monotonic()
            hourly = time.monotonic() - last_hourly > 3600
            try:
                await tick(pool, hourly)
                if hourly:
                    last_hourly = time.monotonic()
            except Exception:
                log.exception("worker tick failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=15)
        except TimeoutError:
            pass
    await pool.close()
    log.info("worker stopped")


if __name__ == "__main__":
    asyncio.run(main())
