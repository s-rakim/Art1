"""Background jobs. Run as a separate container from the same image:

    python -m app.worker

Every minute it bills rent that has come due, switches placements on and
off, releases stock held by unpaid orders, and every hour it prunes old
rider breadcrumbs and marks silent riders offline. Each job is a database
function that is safe to run concurrently, so running two workers by
accident does no harm.
"""

import asyncio
import logging
import signal
import time

import asyncpg

from .config import get_settings

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


async def main() -> None:
    settings = get_settings()
    pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=2, statement_cache_size=0)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    last_hourly = 0.0
    log.info("worker started")
    while not stop.is_set():
        hourly = time.monotonic() - last_hourly > 3600
        try:
            await tick(pool, hourly)
            if hourly:
                last_hourly = time.monotonic()
        except Exception:
            log.exception("worker tick failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=60)
        except asyncio.TimeoutError:
            pass
    await pool.close()
    log.info("worker stopped")


if __name__ == "__main__":
    asyncio.run(main())
