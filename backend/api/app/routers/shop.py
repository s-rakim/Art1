"""Cart, checkout, orders and the payment webhook."""

import logging
import uuid
from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, Query, Request, Response

from .. import schemas as s
from ..auth import CurrentUser
from ..common import Paging, paging
from ..config import Settings, get_settings
from ..db import get_conn
from ..dispatch import ready_store_orders, try_assign
from ..errors import ApiError, not_found
from ..geo import eta_minutes, haversine_km, point
from ..realtime import publish
from ..payments import PaymentError, create_stripe_checkout, refund_stripe, verify_stripe_event
from ..security import sensitive_limit

log = logging.getLogger("api.shop")
router = APIRouter(tags=["shop"])
Conn = Annotated[asyncpg.Connection, Depends(get_conn)]
Cfg = Annotated[Settings, Depends(get_settings)]

MAX_CART_LINES = 100

# ---------------------------------------------------------------------------
# Cart
# ---------------------------------------------------------------------------


async def _cart_id(conn: asyncpg.Connection, user_id: uuid.UUID) -> uuid.UUID:
    return await conn.fetchval(
        """insert into carts (user_id) values ($1)
           on conflict (user_id) do update set updated_at = now()
           returning id""",
        user_id,
    )


async def _cart(conn: asyncpg.Connection, user_id: uuid.UUID, settings: Settings) -> dict:
    cart_id = await conn.fetchval("select id from carts where user_id = $1", user_id)
    recs = []
    if cart_id:
        recs = await conn.fetch(
            """
            select ci.id, ci.variant_id, ci.quantity, p.id as product_id, p.slug as product_slug, p.title,
                   v.title as variant_title, v.options, v.compare_at_cents, v.stock, v.min_order_qty,
                   variant_unit_price(v.price_cents, v.tier_prices, ci.quantity) as unit_price_cents,
                   (select url from product_images i where i.product_id = p.id order by sort, id limit 1) as image_url,
                   (v.is_active and p.status = 'active' and s.status = 'active' and v.stock >= ci.quantity
                    and ci.quantity >= v.min_order_qty) as available,
                   s.id as store_id, s.slug as store_slug, s.name as store_name, p.currency
              from cart_items ci
              join product_variants v on v.id = ci.variant_id
              join products p on p.id = v.product_id
              join stores s on s.id = p.store_id
             where ci.cart_id = $1
             order by ci.added_at
            """,
            cart_id,
        )
    items, subtotal, per_store = [], 0, {}
    for r in recs:
        line = r["unit_price_cents"] * r["quantity"]
        items.append(
            {
                **{k: r[k] for k in ("id", "variant_id", "product_id", "product_slug", "title", "variant_title",
                                      "options", "image_url", "unit_price_cents", "compare_at_cents", "quantity",
                                      "stock", "min_order_qty", "available")},
                "line_total_cents": line,
                "store": {"slug": r["store_slug"], "name": r["store_name"]},
            }
        )
        if r["available"]:
            subtotal += line
            per_store[r["store_id"]] = per_store.get(r["store_id"], 0) + line
    fees = await conn.fetchrow("select standard_shipping_cents, free_shipping_over_cents from app_settings")
    free_over = fees["free_shipping_over_cents"]
    shipping = sum(
        0 if free_over and sub >= free_over else fees["standard_shipping_cents"]
        for sub in per_store.values()
    )
    return {
        "id": cart_id,
        "items": items,
        "item_count": sum(i["quantity"] for i in items),
        "subtotal_cents": subtotal,
        "shipping_estimate_cents": shipping,
        "currency": recs[0]["currency"] if recs else settings.currency,
    }


async def _purchasable_variant(conn: asyncpg.Connection, variant_id: uuid.UUID) -> asyncpg.Record:
    v = await conn.fetchrow(
        """select v.id, v.stock, v.min_order_qty, s.owner_id
             from product_variants v
             join products p on p.id = v.product_id
             join stores s on s.id = p.store_id
            where v.id = $1 and v.is_active and p.status = 'active' and s.status = 'active'""",
        variant_id,
    )
    if v is None:
        raise not_found("product")
    return v


async def _set_line(conn: asyncpg.Connection, user_id: uuid.UUID, variant_id: uuid.UUID, qty: int, add: bool):
    v = await _purchasable_variant(conn, variant_id)
    cart_id = await _cart_id(conn, user_id)
    lines = await conn.fetchval("select count(*) from cart_items where cart_id = $1", cart_id)
    if lines >= MAX_CART_LINES:
        exists = await conn.fetchval(
            "select 1 from cart_items where cart_id = $1 and variant_id = $2", cart_id, variant_id
        )
        if not exists:
            raise ApiError(409, "cart_full", "Your cart is full.")
    new_qty = await conn.fetchval(
        f"""insert into cart_items (cart_id, variant_id, quantity) values ($1, $2, $3)
            on conflict (cart_id, variant_id) do update
               set quantity = least({'cart_items.quantity + excluded.quantity' if add else 'excluded.quantity'}, 999)
            returning quantity""",
        cart_id,
        variant_id,
        qty,
    )
    if new_qty > v["stock"]:
        raise ApiError(409, "out_of_stock", f"Only {v['stock']} left in stock.")


@router.get("/cart", response_model=s.Cart)
async def get_cart(user: CurrentUser, conn: Conn, settings: Cfg):
    return await _cart(conn, user.id, settings)


@router.post("/cart/items", response_model=s.Cart, status_code=201)
async def add_to_cart(body: s.CartItemIn, user: CurrentUser, conn: Conn, settings: Cfg):
    async with conn.transaction():
        await _set_line(conn, user.id, body.variant_id, body.quantity, add=True)
    return await _cart(conn, user.id, settings)


# Same as POST /cart/items, for clients that treat the cart as one resource.
router.add_api_route(
    "/cart", add_to_cart, methods=["POST"], response_model=s.Cart, status_code=201, include_in_schema=True,
    name="add_to_cart_alias",
)


@router.patch("/cart/items/{item_id}", response_model=s.Cart)
async def update_cart_item(item_id: uuid.UUID, body: s.CartItemUpdate, user: CurrentUser, conn: Conn, settings: Cfg):
    async with conn.transaction():
        variant_id = await conn.fetchval(
            """select ci.variant_id from cart_items ci join carts c on c.id = ci.cart_id
                where ci.id = $1 and c.user_id = $2""",
            item_id,
            user.id,
        )
        if variant_id is None:
            raise not_found("cart item")
        await _set_line(conn, user.id, variant_id, body.quantity, add=False)
    return await _cart(conn, user.id, settings)


@router.delete("/cart/items/{item_id}", response_model=s.Cart)
async def remove_cart_item(item_id: uuid.UUID, user: CurrentUser, conn: Conn, settings: Cfg):
    await conn.execute(
        "delete from cart_items ci using carts c where ci.id = $1 and ci.cart_id = c.id and c.user_id = $2",
        item_id,
        user.id,
    )
    return await _cart(conn, user.id, settings)


@router.delete("/cart", response_model=s.Cart)
async def clear_cart(user: CurrentUser, conn: Conn, settings: Cfg):
    await conn.execute(
        "delete from cart_items ci using carts c where ci.cart_id = c.id and c.user_id = $1", user.id
    )
    return await _cart(conn, user.id, settings)


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------


async def _address_snapshot(conn: asyncpg.Connection, user_id: uuid.UUID, body: s.CheckoutIn) -> dict:
    if body.address_id:
        rec = await conn.fetchrow(
            """select full_name, line1, line2, city, region, postal_code, country, phone, lat, lng
                 from addresses where id = $1 and user_id = $2""",
            body.address_id,
            user_id,
        )
        if rec is None:
            raise not_found("address")
        return dict(rec)
    a = body.shipping_address.model_dump(exclude={"label", "is_default"})
    return a


@router.post("/checkout", response_model=s.CheckoutOut, status_code=201, dependencies=[sensitive_limit("checkout")])
async def checkout(body: s.CheckoutIn, user: CurrentUser, conn: Conn, settings: Cfg):
    """Turns the cart (or the `items` sent) into an order.

    Only variant ids and quantities are read from the client. Prices, volume
    tiers, coupons, shipping and tax are all worked out by place_order() in
    the database while the stock rows are locked.
    """
    address = await _address_snapshot(conn, user.id, body)
    if body.payment_method == "card" and settings.payment_provider not in ("stripe", "test"):
        raise ApiError(422, "card_unavailable", "Card payments aren't available yet. Choose cash on delivery or bank transfer.")
    # Fees as the admin last set them (Admin > Settings).
    fees = await conn.fetchrow(
        """select standard_shipping_cents, express_shipping_cents, free_shipping_over_cents, tax_rate::float
             from app_settings"""
    )
    if body.shipping_method == "express":
        flat, free_over = fees["express_shipping_cents"], 0
    else:
        flat, free_over = fees["standard_shipping_cents"], fees["free_shipping_over_cents"] or 0

    async with conn.transaction():
        if body.items is not None:
            # The client sent the basket explicitly; make the server cart match.
            cart_id = await _cart_id(conn, user.id)
            await conn.execute("delete from cart_items where cart_id = $1", cart_id)
            merged: dict[uuid.UUID, int] = {}
            for line in body.items:
                merged[line.variant_id] = min(merged.get(line.variant_id, 0) + line.quantity, 999)
            for variant_id, qty in merged.items():
                await _purchasable_variant(conn, variant_id)
                await conn.execute(
                    "insert into cart_items (cart_id, variant_id, quantity) values ($1, $2, $3)",
                    cart_id, variant_id, qty,
                )

        # Buying from your own store would let a seller farm "verified" reviews
        # and sales rank for the cost of the commission.
        own = await conn.fetchval(
            """select exists (select 1 from cart_items ci join carts c on c.id = ci.cart_id
                                join product_variants v on v.id = ci.variant_id
                                join products p on p.id = v.product_id
                                join stores st on st.id = p.store_id
                               where c.user_id = $1 and st.owner_id = $1)""",
            user.id,
        )
        if own:
            raise ApiError(422, "own_store_item", "You can't buy from your own store.")

        order_id = await conn.fetchval(
            "select place_order($1, $2::jsonb, $3, $4, $5, $6, $7)",
            user.id, address, body.coupon_code, flat, free_over, fees["tax_rate"], body.payment_method,
        )
        order = dict(await conn.fetchrow(
            "select id, number, status, total_cents, currency from orders where id = $1", order_id
        ))

        out = {
            "order_id": order["id"],
            "order_number": order["number"],
            "status": order["status"],
            "total_cents": order["total_cents"],
            "currency": order["currency"],
        }

        if body.payment_method != "card":
            # Cash on delivery or transfer: the store confirms it got paid.
            await conn.execute("update orders set payment_provider = 'manual' where id = $1", order_id)
        elif settings.payment_provider == "test":
            await conn.execute("select mark_order_paid($1, 'test', null, $2)", order_id, settings.payout_hold_days)
            out["status"] = "paid"
        elif settings.payment_provider == "stripe":
            # Created inside the transaction: if Stripe is down, the order and
            # the stock reservation roll back with it.
            try:
                session_id, url = await create_stripe_checkout(settings, order, user.email)
            except PaymentError as exc:
                raise ApiError(502, "payment_unavailable", str(exc)) from None
            await conn.execute(
                "update orders set payment_provider = 'stripe', payment_ref = $2 where id = $1", order_id, session_id
            )
            out["payment_url"] = url
    # Cash on delivery orders are ready to leave the shop now.
    await try_assign(conn, await ready_store_orders(conn, order_id), settings)
    return out


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------


async def order_detail(conn: asyncpg.Connection, order_id: uuid.UUID, user_id: uuid.UUID | None) -> dict:
    """user_id=None is for admins; otherwise the order must belong to the user."""
    o = await conn.fetchrow(
        """select id, number, status, currency, subtotal_cents, discount_cents, shipping_cents, tax_cents,
                  total_cents, coupon_code, shipping_address, payment_provider, paid_at, created_at
             from orders where id = $1 and ($2::uuid is null or user_id = $2)""",
        order_id,
        user_id,
    )
    if o is None:
        raise not_found("order")
    shipments = await conn.fetch(
        """select so.id, so.status, so.subtotal_cents, so.shipping_cents, so.discount_cents,
                  so.tracking_carrier, so.tracking_number, so.shipped_at, so.delivered_at,
                  st.slug as store_slug, st.name as store_name
             from store_orders so join stores st on st.id = so.store_id
            where so.order_id = $1 order by st.name""",
        order_id,
    )
    items = await conn.fetch(
        """select oi.id, oi.store_order_id, oi.product_id, p.slug as product_slug, oi.variant_id, oi.title,
                  oi.variant_title, oi.sku, oi.image_url, oi.unit_price_cents, oi.quantity, oi.line_total_cents
             from order_items oi left join products p on p.id = oi.product_id
            where oi.order_id = $1""",
        order_id,
    )
    by_shipment: dict[uuid.UUID, list] = {}
    for it in items:
        d = dict(it)
        by_shipment.setdefault(d.pop("store_order_id"), []).append(d)
    return {
        **dict(o),
        "shipments": [
            {
                **{k: sh[k] for k in sh.keys() if not k.startswith("store_")},
                "store": {"slug": sh["store_slug"], "name": sh["store_name"]},
                "items": by_shipment.get(sh["id"], []),
            }
            for sh in shipments
        ],
    }


@router.get("/orders", response_model=s.Page[s.OrderSummary])
async def list_orders(
    user: CurrentUser,
    conn: Conn,
    pg: Annotated[Paging, Depends(paging)],
    status: Annotated[str | None, Query(pattern=r"^[a-z_]+$", max_length=30)] = None,
):
    cond, args = "o.user_id = $1", [user.id]
    if status:
        cond += " and o.status = $2"
        args.append(status)
    total = await conn.fetchval(f"select count(*) from orders o where {cond}", *args)
    recs = await conn.fetch(
        f"""select o.id, o.number, o.status, o.currency, o.total_cents, o.created_at,
                   (select coalesce(sum(quantity), 0) from order_items where order_id = o.id)::int as item_count
              from orders o where {cond} order by o.created_at desc
             limit {pg.page_size} offset {pg.offset}""",
        *args,
    )
    return pg.wrap([dict(r) for r in recs], total)


@router.get("/orders/{order_id}", response_model=s.Order)
async def get_order(order_id: uuid.UUID, user: CurrentUser, conn: Conn):
    return await order_detail(conn, order_id, user.id)


@router.post("/orders/{order_id}/cancel", response_model=s.Order, dependencies=[sensitive_limit("cancel")])
async def cancel(order_id: uuid.UUID, user: CurrentUser, conn: Conn, settings: Cfg):
    async with conn.transaction():
        o = await conn.fetchrow(
            "select status, payment_provider, payment_ref from orders where id = $1 and user_id = $2 for update",
            order_id,
            user.id,
        )
        if o is None:
            raise not_found("order")
        previous = await conn.fetchval("select cancel_order($1)", order_id)
        if previous == "paid" and o["payment_provider"] == "stripe":
            # Refund before commit: if Stripe refuses, the cancel rolls back.
            try:
                await refund_stripe(settings, o["payment_ref"], order_id)
            except PaymentError as exc:
                raise ApiError(502, "refund_failed", str(exc)) from None
    return await order_detail(conn, order_id, user.id)


# ---------------------------------------------------------------------------
# Stripe webhook
# ---------------------------------------------------------------------------


@router.post("/webhooks/stripe", include_in_schema=False)
async def stripe_webhook(request: Request, conn: Conn, settings: Cfg):
    if settings.payment_provider != "stripe" or not settings.stripe_webhook_secret:
        raise not_found()
    signature = request.headers.get("stripe-signature")
    if not signature:
        raise ApiError(400, "bad_signature", "Missing signature.")
    payload = await request.body()
    try:
        event = verify_stripe_event(settings, payload, signature)
    except Exception:
        log.warning("rejected stripe webhook with bad signature from %s", request.client.host if request.client else "?")
        raise ApiError(400, "bad_signature", "Invalid signature.") from None

    if event["type"] in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        session = event["data"]["object"]
        if session.get("payment_status") != "paid":
            return Response(status_code=200)
        try:
            order_id = uuid.UUID(session["metadata"]["order_id"])
        except (KeyError, TypeError, ValueError):
            return Response(status_code=200)
        async with conn.transaction():
            o = await conn.fetchrow(
                "select total_cents, currency, payment_ref from orders where id = $1 for update", order_id
            )
            # Cross-check the amount and the session so a replayed or
            # mismatched event can't mark the wrong order paid.
            if (
                o is None
                or o["payment_ref"] != session.get("id")
                or session.get("amount_total") != o["total_cents"]
                or (session.get("currency") or "").upper() != o["currency"]
            ):
                log.error("stripe session %s does not match order %s", session.get("id"), order_id)
                return Response(status_code=200)
            await conn.execute(
                "select mark_order_paid($1, 'stripe', $2, $3)",
                order_id,
                session.get("payment_intent"),
                settings.payout_hold_days,
            )
        await try_assign(conn, await ready_store_orders(conn, order_id), settings)
    elif event["type"] == "checkout.session.expired":
        session = event["data"]["object"]
        try:
            order_id = uuid.UUID(session["metadata"]["order_id"])
        except (KeyError, TypeError, ValueError):
            return Response(status_code=200)
        async with conn.transaction():
            status = await conn.fetchval(
                "select status from orders where id = $1 and payment_ref = $2 for update", order_id, session.get("id")
            )
            if status == "pending_payment":
                await conn.execute("select cancel_order($1)", order_id)
    return Response(status_code=200)


# ---------------------------------------------------------------------------
# Delivery tracking for the buyer
# ---------------------------------------------------------------------------


def _mask_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = [c for c in phone if c.isdigit()]
    return "•••• " + "".join(digits[-3:]) if len(digits) >= 3 else None


def _first_name(name: str | None) -> str:
    return (name or "Your rider").split()[0]


@router.get("/orders/{order_id}/tracking", response_model=s.Tracking)
async def tracking(order_id: uuid.UUID, user: CurrentUser, conn: Conn):
    o = await conn.fetchrow(
        "select id, status, shipping_address from orders where id = $1 and user_id = $2", order_id, user.id
    )
    if o is None:
        raise not_found("order")
    recs = await conn.fetch(
        """select distinct on (so.id)
                  so.id as store_order_id, so.status as store_order_status, st.name as store_name,
                  d.id, d.status, d.pickup, d.dropoff, d.handover_code, d.assigned_at, d.picked_up_at,
                  d.delivered_at, r.full_name as rider_name, r.phone as rider_phone, r.vehicle,
                  r.last_lat, r.last_lng, r.last_heading, r.last_seen_at
             from store_orders so
             join stores st on st.id = so.store_id
             left join deliveries d on d.store_order_id = so.id and d.status not in ('declined', 'canceled')
             left join riders r on r.id = d.rider_id
            where so.order_id = $1
            order by so.id, d.assigned_at desc nulls last""",
        order_id,
    )
    deliveries = []
    for r in recs:
        live = r["status"] in ("accepted", "picked_up")
        position = None
        eta = None
        if live and r["last_lat"] is not None:
            position = {"lat": r["last_lat"], "lng": r["last_lng"], "heading": r["last_heading"],
                        "at": r["last_seen_at"]}
            here = (r["last_lat"], r["last_lng"])
            pickup, dropoff = point(r["pickup"]), point(r["dropoff"])
            km = 0.0
            if r["status"] == "accepted" and pickup:
                km += haversine_km(*here, *pickup)
                here = pickup
            if dropoff:
                km += haversine_km(*here, *dropoff)
                eta = eta_minutes(km, r["vehicle"])
        deliveries.append({
            "delivery_id": r["id"],
            "store_name": r["store_name"],
            "status": r["status"] or r["store_order_status"],
            "eta_minutes": eta,
            "rider": {
                "name": _first_name(r["rider_name"]),
                "phone_masked": _mask_phone(r["rider_phone"]),
                "vehicle": r["vehicle"],
            } if r["id"] and r["status"] in ("accepted", "picked_up", "delivered") else None,
            "rider_position": position,
            "pickup": r["pickup"] if point(r["pickup"]) else None,
            "dropoff": r["dropoff"] if point(r["dropoff"]) else None,
            # Shown to the buyer only; they read it to the rider at the door.
            "handover_code": r["handover_code"] if r["status"] in ("accepted", "picked_up") else None,
        })
    primary = next((d for d in deliveries if d["rider_position"]), deliveries[0] if deliveries else None)
    return {
        "order_status": o["status"],
        **({k: primary[k] for k in ("delivery_id", "status", "eta_minutes", "rider", "rider_position",
                                     "pickup", "dropoff", "handover_code")} if primary else
           {"delivery_id": None, "status": o["status"], "eta_minutes": None, "rider": None,
            "rider_position": None, "pickup": None, "dropoff": None, "handover_code": None}),
        "deliveries": deliveries,
    }


@router.put("/orders/{order_id}/dropoff", response_model=s.Tracking, dependencies=[sensitive_limit("dropoff")])
async def move_dropoff(order_id: uuid.UUID, body: s.DropoffIn, user: CurrentUser, conn: Conn):
    """Move the drop-off pin, for example to the gate the rider should come
    to. Works until the parcel is delivered. A rider already on the way sees
    the new pin straight away."""
    async with conn.transaction():
        o = await conn.fetchrow(
            "select status, shipping_address from orders where id = $1 and user_id = $2 for update", order_id, user.id
        )
        if o is None:
            raise not_found("order")
        if o["status"] in ("fulfilled", "canceled", "refunded"):
            raise ApiError(409, "order_closed", "This order can't be changed any more.")
        if await conn.fetchval(
            "select 1 from store_orders where order_id = $1 and status = 'delivered' limit 1", order_id
        ):
            raise ApiError(409, "order_closed", "Part of this order is already delivered.")
        addr = dict(o["shipping_address"] or {})
        addr.update(lat=body.lat, lng=body.lng)
        if body.note is not None:
            addr["dropoff_note"] = body.note
        await conn.execute("update orders set shipping_address = $2::jsonb where id = $1", order_id, addr)
        label = ", ".join(x for x in (addr.get("line1"), addr.get("city")) if x)
        live = await conn.fetch(
            """update deliveries d set dropoff = jsonb_build_object('lat', $2::float8, 'lng', $3::float8, 'label', $4::text)
                 from store_orders so
                where so.id = d.store_order_id and so.order_id = $1
                  and d.status in ('assigned', 'accepted', 'picked_up')
                returning d.id, d.rider_id""",
            order_id, body.lat, body.lng, label,
        )
        for d in live:
            await publish(conn, [f"delivery:{d['id']}", f"rider:{d['rider_id']}", "admin"], {
                "type": "dropoff", "delivery_id": str(d["id"]), "lat": body.lat, "lng": body.lng,
            })
    return await tracking(order_id, user, conn)
