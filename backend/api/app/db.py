import json
from collections.abc import AsyncIterator

import asyncpg
from fastapi import Request

from .config import Settings


async def _init_connection(conn: asyncpg.Connection) -> None:
    for typ in ("json", "jsonb"):
        await conn.set_type_codec(typ, encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    # Hard ceiling so one slow query cannot pin a worker.
    await conn.execute("set statement_timeout = '15s'")


async def create_pool(settings: Settings) -> asyncpg.Pool:
    return await asyncpg.create_pool(
        settings.database_url,
        min_size=settings.db_pool_min,
        max_size=settings.db_pool_max,
        init=_init_connection,
        # Supabase's transaction pooler (port 6543) does not support prepared
        # statements; turning the cache off keeps both poolers working.
        statement_cache_size=0,
        command_timeout=30,
    )


async def get_conn(request: Request) -> AsyncIterator[asyncpg.Connection]:
    async with request.app.state.pool.acquire() as conn:
        yield conn


def row(r: asyncpg.Record | None) -> dict | None:
    return dict(r) if r is not None else None


def rows(rs: list[asyncpg.Record]) -> list[dict]:
    return [dict(r) for r in rs]
