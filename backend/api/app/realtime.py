"""Live delivery tracking.

Riders post their position over HTTP. The API writes it and fires
pg_notify('delivery_events', ...). Every API worker keeps one LISTEN
connection and fans events out to the websockets it holds, so this works with
several uvicorn workers or replicas without Redis pub/sub.

Websocket protocol (/api/v1/ws/tracking):

    client -> {"type": "auth", "token": "<supabase access token>"}     within 10 s
    server -> {"type": "ready", "role": "customer"}
    client -> {"type": "subscribe", "delivery_id": "<uuid>"}
           or {"type": "subscribe", "scope": "admin"}                  admins only
    server -> {"type": "subscribed", ...} then a stream of
              {"type": "location", "delivery_id", "lat", "lng", "heading", "at"}
              {"type": "status", "delivery_id", "status", "at"}

The token goes in the first message, not the URL, so it never lands in proxy
logs.
"""

import asyncio
import contextlib
import json
import logging
import uuid
from collections import defaultdict

import asyncpg
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .auth import _load_user, decode_token
from .config import get_settings
from .errors import ApiError

log = logging.getLogger("api.realtime")
CHANNEL = "delivery_events"
ADMIN_TOPIC = "admin"


class Hub:
    def __init__(self):
        self._subs: dict[str, set[asyncio.Queue]] = defaultdict(set)
        self._conn: asyncpg.Connection | None = None
        self._dsn: str | None = None
        self._task: asyncio.Task | None = None

    async def start(self, dsn: str):
        self._dsn = dsn
        self._task = asyncio.create_task(self._run())

    async def _run(self):
        # Reconnect forever: a dropped LISTEN connection must not kill tracking.
        while True:
            try:
                self._conn = await asyncpg.connect(self._dsn, statement_cache_size=0)
                await self._conn.add_listener(CHANNEL, self._on_notify)
                log.info("listening on %s", CHANNEL)
                while not self._conn.is_closed():
                    await asyncio.sleep(5)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # pragma: no cover - network failures
                log.warning("realtime listener dropped: %s", exc)
            await asyncio.sleep(2)

    def _on_notify(self, _conn, _pid, _channel, payload: str):
        try:
            event = json.loads(payload)
        except ValueError:
            return
        topics = [str(event.get("delivery_id")), ADMIN_TOPIC]
        for topic in topics:
            for q in list(self._subs.get(topic, ())):
                if q.qsize() < 100:  # slow consumer: drop rather than grow without bound
                    q.put_nowait(event)

    def subscribe(self, topic: str, q: asyncio.Queue):
        self._subs[topic].add(q)

    def unsubscribe_all(self, q: asyncio.Queue):
        for topic in list(self._subs):
            self._subs[topic].discard(q)
            if not self._subs[topic]:
                del self._subs[topic]

    async def stop(self):
        if self._task:
            self._task.cancel()
            with contextlib.suppress(BaseException):
                await self._task
        if self._conn and not self._conn.is_closed():
            await self._conn.close()


async def publish(conn: asyncpg.Connection, event: dict):
    """Delivered when the surrounding transaction commits."""
    await conn.execute("select pg_notify($1, $2)", CHANNEL, json.dumps(event, default=str))


async def can_watch(conn: asyncpg.Connection, user_id: uuid.UUID, role: str, delivery_id: uuid.UUID) -> bool:
    if role == "admin":
        return True
    return bool(
        await conn.fetchval(
            """select exists (
                   select 1 from deliveries d
                     join store_orders so on so.id = d.store_order_id
                     join orders o on o.id = so.order_id
                     join stores s on s.id = d.store_id
                    where d.id = $1 and (o.user_id = $2 or s.owner_id = $2 or d.rider_id = $2))""",
            delivery_id,
            user_id,
        )
    )


router = APIRouter()


@router.websocket("/ws/tracking")
async def tracking_socket(ws: WebSocket):
    settings = get_settings()
    origin = ws.headers.get("origin")
    if origin and origin not in settings.cors_origins:
        await ws.close(code=1008)
        return
    await ws.accept()
    hub: Hub = ws.app.state.hub
    pool: asyncpg.Pool = ws.app.state.pool
    queue: asyncio.Queue = asyncio.Queue()
    subscribed = 0

    try:
        first = await asyncio.wait_for(ws.receive_json(), timeout=10)
        if not isinstance(first, dict) or first.get("type") != "auth" or not isinstance(first.get("token"), str):
            await ws.close(code=1008)
            return
        try:
            claims = await decode_token(first["token"], settings)
            async with pool.acquire() as conn:
                user = await _load_user(conn, claims)
        except ApiError:
            await ws.send_json({"type": "error", "code": "unauthorized"})
            await ws.close(code=1008)
            return
        await ws.send_json({"type": "ready", "role": user.role})

        async def pump():
            while True:
                event = await queue.get()
                await ws.send_json(event)

        pump_task = asyncio.create_task(pump())
        try:
            while True:
                msg = await ws.receive_json()
                if not isinstance(msg, dict) or msg.get("type") != "subscribe":
                    continue
                if subscribed >= 20:
                    await ws.send_json({"type": "error", "code": "too_many_subscriptions"})
                    continue
                if msg.get("scope") == "admin":
                    if user.role != "admin":
                        await ws.send_json({"type": "error", "code": "forbidden"})
                        continue
                    hub.subscribe(ADMIN_TOPIC, queue)
                    subscribed += 1
                    await ws.send_json({"type": "subscribed", "scope": "admin"})
                    continue
                try:
                    delivery_id = uuid.UUID(str(msg.get("delivery_id")))
                except ValueError:
                    await ws.send_json({"type": "error", "code": "bad_delivery_id"})
                    continue
                async with pool.acquire() as conn:
                    allowed = await can_watch(conn, user.id, user.role, delivery_id)
                if not allowed:
                    # Same answer for "not yours" and "doesn't exist".
                    await ws.send_json({"type": "error", "code": "not_found"})
                    continue
                hub.subscribe(str(delivery_id), queue)
                subscribed += 1
                await ws.send_json({"type": "subscribed", "delivery_id": str(delivery_id)})
        finally:
            pump_task.cancel()
    except (WebSocketDisconnect, asyncio.TimeoutError, ValueError, RuntimeError):
        pass
    finally:
        hub.unsubscribe_all(queue)
        with contextlib.suppress(Exception):
            await ws.close()
