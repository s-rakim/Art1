"""The Bazaar's money desk: the payments bank, paying stores, and the
ledger sheets.

  * Admin: import till and bank messages, see every payment, apply or void
    one, settle with stores once their takings have been held for the
    payout interval and their books balance, and read every sheet.
  * Vendors: read their own sheets (never another store's) and keep an
    editable sheet of their own records, which only reaches the read-only
    "entries" sheet once an admin confirms each row by its reference.
  * A phone forwarding the till's messages, or Daraja, posts payments in
    with a secret token in the URL.

Every change to a payment or a sheet entry lands in the append-only audit
log with who made it.
"""

import csv
import io
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal

import asyncpg
from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import Field, StringConstraints, model_validator

from .. import payments_bank as bank
from .. import schemas as s
from ..auth import AdminUser
from ..common import Paging, paging
from ..config import Settings, get_settings
from ..db import get_conn
from ..dispatch import hold_days, try_assign
from ..errors import ApiError, not_found
from ..security import sensitive_limit
from .seller import ActiveSeller, Seller

admin = APIRouter(prefix="/admin", tags=["admin: money"])
vendor = APIRouter(prefix="/seller", tags=["seller: sheets"])
hooks = APIRouter(prefix="/payments", tags=["payment feeds"])
Conn = Annotated[asyncpg.Connection, Depends(get_conn)]
Cfg = Annotated[Settings, Depends(get_settings)]


# ---------------------------------------------------------------------------
# Payments bank
# ---------------------------------------------------------------------------


class ImportIn(s.Strict):
    text: Annotated[str, StringConstraints(min_length=1, max_length=bank.MAX_TEXT)]
    # false: show what would be stored. true: store it.
    commit: bool = False


class ImportedRow(s.BaseModel):
    id: uuid.UUID | None
    provider: Literal["mpesa", "bank"]
    code: str
    payer_name: str | None
    payer_phone: str | None
    amount_cents: int
    currency: str
    received_at: datetime
    account_ref: str | None
    matched_order_number: str | None
    duplicate: bool


class ImportOut(s.BaseModel):
    rows: list[ImportedRow]
    stored: int
    failed: list[str] = Field(description="Snippets of messages that didn't look like a payment.")


class PaymentReceipt(s.BaseModel):
    id: uuid.UUID
    provider: str
    source: str
    code: str
    amount_cents: int
    currency: str
    payer_name: str | None
    payer_phone: str | None
    account_ref: str | None
    received_at: datetime
    status: Literal["unconfirmed", "confirmed", "expired", "void"]
    expires_at: datetime
    order_id: uuid.UUID | None
    order_number: str | None
    confirmed_at: datetime | None
    confirmed_by_name: str | None
    confirmed_role: str | None
    note: str | None
    created_at: datetime


class PaymentUpdate(s.Strict):
    # Apply to this order (same rules as a rider at the door, except an
    # admin may use an expired payment), or void an unused payment.
    order_id: uuid.UUID | None = None
    order_number: Annotated[str, StringConstraints(max_length=40)] | None = None
    status: Literal["void"] | None = None
    note: s.MediumText | None = None

    @model_validator(mode="after")
    def one_thing(self):
        applying = self.order_id is not None or self.order_number is not None
        if applying == (self.status is not None):
            raise ValueError("send an order to apply the payment to, or status void")
        return self


_RECEIPT_SELECT = """
    select r.*, o.number as order_number, p.full_name as confirmed_by_name
      from payment_receipts r
      left join orders o on o.id = r.order_id
      left join profiles p on p.id = r.confirmed_by
"""


async def _import(conn: asyncpg.Connection, text: str, source: str, settings: Settings,
                  actor: uuid.UUID | None, commit: bool) -> dict:
    parsed = bank.parse_text(text, settings.currency, settings.payment_timezone)
    if not commit:
        rows = []
        for p in parsed.rows:
            existing = await conn.fetchval(
                "select id from payment_receipts where provider = $1 and code = $2", p.provider, p.code
            )
            matched = await conn.fetchval("select number from orders where number = $1", p.order_number) \
                if p.order_number else None
            rows.append({"id": existing, "provider": p.provider, "code": p.code, "payer_name": p.payer_name,
                         "payer_phone": p.payer_phone, "amount_cents": p.amount_cents, "currency": p.currency,
                         "received_at": p.received_at, "account_ref": p.account_ref,
                         "matched_order_number": matched, "duplicate": existing is not None})
        return {"rows": rows, "stored": 0, "failed": parsed.failed}
    ttl = await conn.fetchval("select payment_code_ttl_hours from app_settings")
    async with conn.transaction():
        if actor:
            await bank.set_actor(conn, actor)
        rows = await bank.store_parsed(conn, parsed.rows, source, ttl, actor)
    return {"rows": rows, "stored": sum(1 for r in rows if not r["duplicate"]), "failed": parsed.failed}


@admin.post("/payments/import", response_model=ImportOut, dependencies=[sensitive_limit("payments-import")])
async def import_payments(body: ImportIn, user: AdminUser, conn: Conn, settings: Cfg):
    """Paste the till's or bank's messages, as many as you like. Each one is
    read for the transaction code, amount, payer and time. With commit false
    nothing is stored, so you can check the reading first. A code already in
    the bank is never stored twice."""
    return await _import(conn, body.text, "paste", settings, user.id, body.commit)


@admin.get("/payments", response_model=s.Page[PaymentReceipt])
async def list_payments(
    _: AdminUser,
    conn: Conn,
    pg: Annotated[Paging, Depends(paging)],
    status: Literal["unconfirmed", "confirmed", "expired", "void"] | None = None,
    q: Annotated[str | None, Query(max_length=80)] = None,
):
    cond, args = ["true"], []
    if status:
        args.append(status)
        cond.append(f"r.status = ${len(args)}")
    if q and q.strip():
        args.append(f"%{q.strip().replace('%', '').replace('_', '')}%")
        cond.append(f"(r.code ilike ${len(args)} or r.payer_name ilike ${len(args)} or o.number ilike ${len(args)})")
    where = " and ".join(cond)
    total = await conn.fetchval(
        f"select count(*) from payment_receipts r left join orders o on o.id = r.order_id where {where}", *args
    )
    recs = await conn.fetch(
        _RECEIPT_SELECT + f" where {where} order by r.received_at desc limit ${len(args) + 1} offset ${len(args) + 2}",
        *args, pg.page_size, pg.offset,
    )
    return pg.wrap([dict(r) for r in recs], total)


@admin.patch("/payments/{receipt_id}", response_model=PaymentReceipt)
async def update_payment(receipt_id: uuid.UUID, body: PaymentUpdate, user: AdminUser, conn: Conn, settings: Cfg):
    newly: list[uuid.UUID] = []
    async with conn.transaction():
        await bank.set_actor(conn, user.id)
        if body.status == "void":
            r = await conn.fetchrow("select status from payment_receipts where id = $1 for update", receipt_id)
            if r is None:
                raise not_found("payment")
            if r["status"] == "confirmed":
                raise ApiError(409, "code_used", "A used payment can't be voided.")
            await conn.execute(
                "update payment_receipts set status = 'void', note = coalesce($2, note) where id = $1",
                receipt_id, body.note,
            )
        else:
            order_id = body.order_id or await conn.fetchval(
                "select id from orders where number = $1", (body.order_number or "").strip().upper()
            )
            if order_id is None:
                raise not_found("order")
            newly = await bank.apply_receipt(conn, receipt_id=receipt_id, order_id=order_id, actor=user.id,
                                             role="admin", hold_days=await hold_days(conn))
            if body.note:
                await conn.execute("update payment_receipts set note = $2 where id = $1 and status <> 'confirmed'",
                                   receipt_id, body.note)
    if newly:
        # Prepaid orders are ready to leave the shop once the money is in.
        await try_assign(conn, newly, settings)
    rec = await conn.fetchrow(_RECEIPT_SELECT + " where r.id = $1", receipt_id)
    if rec is None:
        raise not_found("payment")
    return dict(rec)


# ---------------------------------------------------------------------------
# Feeds: a phone forwarding the till's messages, and Daraja
# ---------------------------------------------------------------------------


def _token_ok(settings: Settings, token: str) -> bool:
    expected = settings.payment_webhook_token
    return bool(expected) and secrets.compare_digest(token.encode(), expected.encode())


class SmsIn(s.BaseModel):
    # Forwarding apps differ in their field names; take the usual ones.
    text: str | None = Field(None, max_length=bank.MAX_MESSAGE * 5)
    message: str | None = Field(None, max_length=bank.MAX_MESSAGE * 5)
    body: str | None = Field(None, max_length=bank.MAX_MESSAGE * 5)


@hooks.post("/sms/{token}", response_model=s.Message, include_in_schema=True)
async def sms_feed(token: str, body: SmsIn, conn: Conn, settings: Cfg):
    """For an SMS forwarding app on the phone that receives the till's
    messages: POST {"text": "..."} here. The token is PAYMENT_WEBHOOK_TOKEN."""
    if not _token_ok(settings, token):
        raise not_found("page")
    text = body.text or body.message or body.body or ""
    if text.strip():
        await _import(conn, text, "sms_forward", settings, None, True)
    return {"ok": True}


@hooks.post("/till/{token}/validation", include_in_schema=False)
async def daraja_validation(token: str, settings: Cfg):
    if not _token_ok(settings, token):
        raise not_found("page")
    return {"ResultCode": 0, "ResultDesc": "Accepted"}


@hooks.post("/till/{token}/confirmation", include_in_schema=False)
async def daraja_confirmation(token: str, request: Request, conn: Conn, settings: Cfg):
    """Daraja C2B: Safaricom posts each payment to the till here. The path
    avoids the words Daraja refuses in callback URLs (such as "mpesa")."""
    if not _token_ok(settings, token):
        raise not_found("page")
    try:
        payload = await request.json()
    except ValueError:
        payload = None
    if not isinstance(payload, dict):
        return {"ResultCode": 0, "ResultDesc": "Accepted"}
    if settings.mpesa_shortcode and str(payload.get("BusinessShortCode") or "") != settings.mpesa_shortcode:
        return {"ResultCode": 0, "ResultDesc": "Accepted"}
    p = bank.parse_daraja(payload, settings.currency, settings.payment_timezone)
    if p is not None:
        ttl = await conn.fetchval("select payment_code_ttl_hours from app_settings")
        async with conn.transaction():
            await bank.store_parsed(conn, [p], "daraja", ttl, None)
    return {"ResultCode": 0, "ResultDesc": "Accepted"}


# ---------------------------------------------------------------------------
# Settling with stores
# ---------------------------------------------------------------------------


class Settlement(s.BaseModel):
    store_id: uuid.UUID
    store_name: str
    store_slug: str
    currency: str
    owed_cents: int = Field(description="Takings past the holding period, after rent, commission and delivery.")
    held_cents: int = Field(description="Takings still inside the payout interval.")
    sales_cents: int
    commission_cents: int
    fees_cents: int
    delivery_cents: int
    rent_cents: int
    paid_out_cents: int
    net_cents: int = Field(description="What a settlement now would pay: owed_cents if positive.")
    books_balanced: bool
    blockers: list[str]
    last_payout_at: datetime | None
    next_payout_at: datetime


class SettleIn(s.Strict):
    amount_cents: Annotated[int, Field(gt=0, le=10_000_000_000)] | None = None
    reference: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=64)]
    note: s.MediumText | None = None
    # Pay before the interval is up or with the books unbalanced. Needs a note.
    force: bool = False


_SETTLEMENTS = """
    select st.id as store_id, st.name as store_name, st.slug as store_slug,
           coalesce(max(le.currency), $1) as currency,
           coalesce(sum(le.amount_cents) filter (where le.available_at <= now()), 0)::bigint as owed_cents,
           coalesce(sum(le.amount_cents) filter (where le.available_at > now()), 0)::bigint as held_cents,
           coalesce(sum(le.amount_cents) filter (where le.kind = 'sale'), 0)::bigint as sales_cents,
           coalesce(-sum(le.amount_cents) filter (where le.kind = 'commission'), 0)::bigint as commission_cents,
           coalesce(-sum(le.amount_cents) filter (where le.kind = 'fee'), 0)::bigint as fees_cents,
           coalesce(-sum(le.amount_cents) filter (where le.kind = 'delivery'), 0)::bigint as delivery_cents,
           coalesce(-sum(le.amount_cents) filter (where le.kind in ('rent', 'placement')), 0)::bigint as rent_cents,
           coalesce(-sum(le.amount_cents) filter (where le.kind = 'payout'), 0)::bigint as paid_out_cents,
           (select max(processed_at) from payouts p where p.store_id = st.id and p.status = 'paid') as last_payout_at,
           (select count(*) from sheet_entries e where e.store_id = st.id and e.status = 'pending')::int as pending_entries,
           (select count(*) from store_orders so where so.store_id = st.id and so.status = 'delivered'
              and so.payment_status <> 'paid')::int as unpaid_delivered,
           (select count(*) from deliveries d join store_orders so on so.id = d.store_order_id
             where d.store_id = st.id and d.arrived_at is not null and d.status = 'picked_up'
               and so.payment_status <> 'paid')::int as waiting_payment
      from stores st
      left join ledger_entries le on le.store_id = st.id
     where ($2::uuid is null or st.id = $2) and st.status in ('active', 'suspended')
     group by st.id
     order by st.name
"""


def _settlement(r: asyncpg.Record, interval: int) -> dict:
    blockers = []
    if r["pending_entries"]:
        blockers.append(f"{r['pending_entries']} sheet entries waiting for confirmation")
    if r["unpaid_delivered"]:
        blockers.append(f"{r['unpaid_delivered']} delivered orders without a confirmed payment")
    if r["waiting_payment"]:
        blockers.append(f"{r['waiting_payment']} riders at a door waiting for payment")
    last = r["last_payout_at"]
    nxt = (last + timedelta(days=interval)) if last else datetime.now(timezone.utc)
    return {**dict(r), "books_balanced": not blockers, "blockers": blockers,
            "net_cents": max(r["owed_cents"], 0), "next_payout_at": nxt}


@admin.get("/settlements", response_model=list[Settlement])
async def settlements(_: AdminUser, conn: Conn, settings: Cfg):
    """What each store is owed. Takings become owed once they've been held
    for the payout interval; rent, commission, fees and delivery charges
    are already taken off. Books balance when every delivered order has a
    confirmed payment and the store has no sheet entries waiting."""
    interval = await hold_days(conn)
    return [_settlement(r, interval) for r in await conn.fetch(_SETTLEMENTS, settings.currency, None)]


@admin.post("/settlements/{store_id}", response_model=s.Message, dependencies=[sensitive_limit("settle")])
async def settle(store_id: uuid.UUID, body: SettleIn, user: AdminUser, conn: Conn, settings: Cfg):
    """Record that you've paid a store. Defaults to everything owed."""
    async with conn.transaction():
        if not await conn.fetchval("select 1 from stores where id = $1 for update", store_id):
            raise not_found("store")
        r = await conn.fetchrow(_SETTLEMENTS, settings.currency, store_id)
        if r is None:
            raise not_found("store")
        st = _settlement(r, await hold_days(conn))
        if body.force and not body.note:
            raise ApiError(422, "note_required", "Say why you're paying early or with the books open.")
        if not body.force:
            if not st["books_balanced"]:
                raise ApiError(409, "books_not_balanced", "; ".join(st["blockers"]).capitalize() + ".")
            if st["next_payout_at"] > datetime.now(timezone.utc):
                raise ApiError(409, "too_early", "This store was paid within the payout interval.")
        amount = body.amount_cents or st["net_cents"]
        if amount <= 0:
            raise ApiError(409, "nothing_owed", "Nothing is owed to this store right now.")
        if amount > st["owed_cents"]:
            raise ApiError(409, "more_than_owed", "That's more than the store is owed.")
        payout_id = await conn.fetchval(
            """insert into payouts (store_id, amount_cents, currency, status, method, note, processed_at)
               values ($1, $2, $3, 'paid', jsonb_build_object('reference', $4::text, 'by', $5::text), $6, now())
               returning id""",
            store_id, amount, st["currency"], body.reference, str(user.id), body.note,
        )
        await conn.execute(
            """insert into ledger_entries (store_id, kind, amount_cents, currency, ref_type, ref_id, memo)
               values ($1, 'payout', $2, $3, 'payout', $4, $5)""",
            store_id, -amount, st["currency"], payout_id, f"Paid out, ref {body.reference}",
        )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Sheets
# ---------------------------------------------------------------------------

Sheet = Literal["ledger", "sales", "payments", "inventory", "entries", "payouts"]


class Column(s.BaseModel):
    key: str
    label: str
    type: Literal["text", "date", "money", "number"]


class SheetOut(s.BaseModel):
    sheet: str
    columns: list[Column]
    rows: list[dict]
    total: int
    page: int
    page_size: int


def _c(key: str, label: str, type_: str = "text") -> dict:
    return {"key": key, "label": label, "type": type_}


# Each sheet: columns, the FROM/WHERE body with $1 store (null = all),
# $2 from, $3 to, and the select list. Store columns are added for admins.
_SHEETS: dict[str, dict] = {
    "ledger": {
        "columns": [_c("date", "Date", "date"), _c("kind", "Type"), _c("description", "Description"),
                    _c("amount_cents", "Amount", "money"), _c("available_on", "Available", "date")],
        "select": """le.created_at as date, le.kind, le.memo as description, le.amount_cents,
                     le.available_at as available_on, le.currency""",
        "from": "ledger_entries le join stores st on st.id = le.store_id",
        "date": "le.created_at",
        "order": "le.created_at desc, le.id",
    },
    "sales": {
        "columns": [_c("date", "Paid", "date"), _c("order_number", "Order"), _c("product", "Product"),
                    _c("variant", "Variant"), _c("sku", "SKU"), _c("quantity", "Qty", "number"),
                    _c("unit_price_cents", "Unit price", "money"), _c("line_total_cents", "Total", "money")],
        "select": """so.paid_at as date, o.number as order_number, oi.title as product, oi.variant_title as variant,
                     oi.sku, oi.quantity, oi.unit_price_cents, oi.line_total_cents, o.currency""",
        "from": """order_items oi join store_orders so on so.id = oi.store_order_id
                   join orders o on o.id = so.order_id join stores st on st.id = so.store_id""",
        "where": "so.payment_status = 'paid'",
        "date": "so.paid_at",
        "order": "so.paid_at desc, oi.id",
    },
    "payments": {
        "columns": [_c("date", "Ordered", "date"), _c("order_number", "Order"), _c("method", "Method"),
                    _c("codes", "Transaction codes"), _c("amount_cents", "Paid by shopper", "money"),
                    _c("commission_cents", "Commission", "money"), _c("fees_cents", "Fees", "money"),
                    _c("delivery_cents", "Delivery", "money"), _c("net_cents", "Store's share", "money"),
                    _c("payment_status", "Payment"), _c("paid_at", "Confirmed", "date")],
        "select": """o.created_at as date, o.number as order_number, o.payment_method as method,
                     (select string_agg(r.code, ', ' order by r.confirmed_at) from payment_receipts r
                       where r.order_id = o.id and r.status = 'confirmed') as codes,
                     so.subtotal_cents - so.discount_cents + so.shipping_cents as amount_cents,
                     so.commission_cents, so.fee_cents as fees_cents,
                     coalesce((select sum(d.fee_cents) from deliveries d where d.store_order_id = so.id
                                 and d.status = 'delivered'), 0)::bigint as delivery_cents,
                     so.payout_cents - coalesce((select sum(d.fee_cents) from deliveries d
                                                  where d.store_order_id = so.id and d.status = 'delivered'), 0)
                         as net_cents,
                     so.payment_status, so.paid_at, o.currency""",
        "from": """store_orders so join orders o on o.id = so.order_id join stores st on st.id = so.store_id""",
        "where": "so.status <> 'canceled'",
        "date": "o.created_at",
        "order": "o.created_at desc, so.id",
    },
    "inventory": {
        "columns": [_c("product", "Product"), _c("variant", "Variant"), _c("sku", "SKU"),
                    _c("in_stock", "In stock", "number"), _c("sold", "Sold", "number"),
                    _c("price_cents", "Price", "money"), _c("last_change", "Last stock change", "date")],
        "select": """p.title as product, v.title as variant, v.sku, v.stock as in_stock,
                     coalesce((select sum(oi.quantity) from order_items oi join store_orders so2
                                 on so2.id = oi.store_order_id
                                where oi.variant_id = v.id and so2.payment_status = 'paid'
                                  and ($2::date is null or so2.paid_at >= $2)
                                  and ($3::date is null or so2.paid_at < $3 + 1)), 0)::bigint as sold,
                     v.price_cents,
                     (select max(created_at) from inventory_adjustments a where a.variant_id = v.id) as last_change,
                     p.currency""",
        "from": """product_variants v join products p on p.id = v.product_id join stores st on st.id = p.store_id""",
        "where": "p.status <> 'archived'",
        "date": None,
        "order": "p.title, v.sku",
    },
    "entries": {
        "columns": [_c("date", "Date", "date"), _c("kind", "Type"), _c("description", "Description"),
                    _c("quantity", "Qty", "number"), _c("amount_cents", "Amount", "money"),
                    _c("reference", "Reference"), _c("confirmed_at", "Confirmed", "date")],
        "select": """e.entry_date as date, e.kind, e.description, e.quantity, e.amount_cents, e.reference,
                     e.confirmed_at""",
        "from": "sheet_entries e join stores st on st.id = e.store_id",
        "where": "e.status = 'confirmed'",
        "date": "e.entry_date",
        "order": "e.entry_date desc, e.id",
    },
    "payouts": {
        "columns": [_c("date", "Date", "date"), _c("status", "Status"), _c("amount_cents", "Amount", "money"),
                    _c("reference", "Reference"), _c("note", "Note")],
        "select": """coalesce(po.processed_at, po.requested_at) as date, po.status, po.amount_cents,
                     po.method->>'reference' as reference, po.note, po.currency""",
        "from": "payouts po join stores st on st.id = po.store_id",
        "date": "coalesce(po.processed_at, po.requested_at)",
        "order": "coalesce(po.processed_at, po.requested_at) desc, po.id",
    },
}


async def _sheet(conn: asyncpg.Connection, sheet: str, store_id: uuid.UUID | None, start: date | None,
                 end: date | None, limit: int, offset: int, with_store: bool) -> tuple[list[dict], list[dict], int]:
    spec = _SHEETS[sheet]
    where = ["($1::uuid is null or st.id = $1)"]
    if spec.get("where"):
        where.append(spec["where"])
    if spec["date"]:
        where.append(f"($2::date is null or {spec['date']} >= $2) and ($3::date is null or {spec['date']} < $3 + 1)")
    else:
        where.append("($2::date is null or true) and ($3::date is null or true)")
    body = f"from {spec['from']} where {' and '.join(where)}"
    total = await conn.fetchval(f"select count(*) {body}", store_id, start, end)
    store_cols = "st.name as store, st.slug as stall, " if with_store else ""
    recs = await conn.fetch(
        f"select {store_cols}{spec['select']} {body} order by {spec['order']} limit $4 offset $5",
        store_id, start, end, limit, offset,
    )
    columns = ([_c("store", "Store"), _c("stall", "Stall")] if with_store else []) + spec["columns"]
    rows = [dict(r) for r in recs]
    return columns, rows, total


_FORMULA = ("=", "+", "-", "@", "\t", "\r")


def _cell(v) -> str:
    """Spreadsheet-safe CSV cell. Text that a spreadsheet would run as a
    formula is prefixed with a quote, since vendors type some of it."""
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M")
    if isinstance(v, date):
        return v.isoformat()
    text = str(v)
    if not isinstance(v, (int, float)) and text.startswith(_FORMULA):
        return "'" + text
    return text


def _csv(sheet: str, columns: list[dict], rows: list[dict]) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([c["label"] for c in columns])
    for r in rows:
        line = []
        for c in columns:
            v = r.get(c["key"])
            if c["type"] == "money" and isinstance(v, int):
                v = f"{v / 100:.2f}"
            line.append(_cell(v))
        w.writerow(line)
    name = f"bazaar-{sheet}-{date.today().isoformat()}.csv"
    return Response(buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})


async def _sheet_response(conn, sheet, store_id, start, end, fmt, pg, with_store):
    if fmt == "csv":
        columns, rows, _ = await _sheet(conn, sheet, store_id, start, end, 10_000, 0, with_store)
        return _csv(sheet, columns, rows)
    columns, rows, total = await _sheet(conn, sheet, store_id, start, end, pg.page_size, pg.offset, with_store)
    return {"sheet": sheet, "columns": columns, "rows": rows, "total": total, "page": pg.page,
            "page_size": pg.page_size}


_SHEET_DOC = """Read-only sheets, built from the books themselves: ledger (every
movement of the store's balance), sales (items sold and paid), payments
(each order, its transaction codes and the store's share), inventory
(stock and units sold), entries (vendor sheet rows an admin confirmed) and
payouts. Filter by date with from and to. format=csv downloads the lot."""


@admin.get("/sheets/{sheet}", response_model=SheetOut, description=_SHEET_DOC + " Every store, or one with store_id.",
           responses={200: {"content": {"text/csv": {}}}})
async def admin_sheet(
    sheet: Sheet,
    _: AdminUser,
    conn: Conn,
    pg: Annotated[Paging, Depends(paging)],
    store_id: uuid.UUID | None = None,
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
    format: Literal["json", "csv"] = "json",
):
    return await _sheet_response(conn, sheet, store_id, start, end, format, pg, with_store=store_id is None)


@vendor.get("/sheets/{sheet}", response_model=SheetOut, description=_SHEET_DOC + " Your store only.",
            responses={200: {"content": {"text/csv": {}}}})
async def vendor_sheet(
    sheet: Sheet,
    ctx: Seller,
    conn: Conn,
    pg: Annotated[Paging, Depends(paging)],
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
    format: Literal["json", "csv"] = "json",
):
    return await _sheet_response(conn, sheet, ctx.store_id, start, end, format, pg, with_store=False)


# ---------------------------------------------------------------------------
# The vendor's editable sheet
# ---------------------------------------------------------------------------

EntryKind = Literal["sale", "expense", "stock_in", "stock_out", "payment", "other"]
Reference = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=64,
                                             pattern=r"^[A-Za-z0-9 ./#_-]+$")]


class EntryIn(s.Strict):
    entry_date: date
    kind: EntryKind
    description: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    quantity: Annotated[int, Field(ge=-1_000_000, le=1_000_000)] | None = None
    amount_cents: Annotated[int, Field(ge=-100_000_000_000, le=100_000_000_000)] | None = None
    # The transaction code, receipt number or other key the admin will
    # check the row against.
    reference: Reference

    @model_validator(mode="after")
    def sane_date(self):
        today = date.today()
        if self.entry_date > today + timedelta(days=1) or self.entry_date < today - timedelta(days=3660):
            raise ValueError("entry_date is out of range")
        return self


class EntryUpdate(s.Strict):
    entry_date: date | None = None
    kind: EntryKind | None = None
    description: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)] | None = None
    quantity: Annotated[int, Field(ge=-1_000_000, le=1_000_000)] | None = None
    amount_cents: Annotated[int, Field(ge=-100_000_000_000, le=100_000_000_000)] | None = None
    reference: Reference | None = None


class Entry(s.BaseModel):
    id: uuid.UUID
    store_id: uuid.UUID
    store_name: str | None = None
    entry_date: date
    kind: str
    description: str
    quantity: int | None
    amount_cents: int | None
    reference: str | None
    status: Literal["pending", "confirmed", "rejected"]
    admin_note: str | None
    created_at: datetime
    updated_at: datetime
    confirmed_at: datetime | None


class AuditRow(s.BaseModel):
    id: int
    entity: str
    entity_id: uuid.UUID
    store_id: uuid.UUID | None
    action: str
    actor_id: uuid.UUID | None
    actor_name: str | None
    before: dict | None
    after: dict | None
    at: datetime


_ENTRY_SELECT = "select e.*, st.name as store_name from sheet_entries e join stores st on st.id = e.store_id"


@vendor.get("/sheet-entries", response_model=s.Page[Entry])
async def my_entries(
    ctx: Seller,
    conn: Conn,
    pg: Annotated[Paging, Depends(paging)],
    status: Literal["pending", "confirmed", "rejected"] | None = None,
):
    total = await conn.fetchval(
        "select count(*) from sheet_entries where store_id = $1 and ($2::text is null or status = $2)",
        ctx.store_id, status,
    )
    recs = await conn.fetch(
        _ENTRY_SELECT + """ where e.store_id = $1 and ($2::text is null or e.status = $2)
                           order by e.entry_date desc, e.created_at desc limit $3 offset $4""",
        ctx.store_id, status, pg.page_size, pg.offset,
    )
    return pg.wrap([dict(r) for r in recs], total)


@vendor.post("/sheet-entries", response_model=Entry, status_code=201, dependencies=[sensitive_limit("sheet")])
async def add_entry(body: EntryIn, ctx: ActiveSeller, conn: Conn):
    async with conn.transaction():
        await bank.set_actor(conn, ctx.user.id)
        entry_id = await conn.fetchval(
            """insert into sheet_entries (store_id, entry_date, kind, description, quantity, amount_cents,
                                          reference, created_by)
               values ($1, $2, $3, $4, $5, $6, $7, $8) returning id""",
            ctx.store_id, body.entry_date, body.kind, body.description, body.quantity, body.amount_cents,
            body.reference, ctx.user.id,
        )
    return dict(await conn.fetchrow(_ENTRY_SELECT + " where e.id = $1", entry_id))


async def _own_entry(conn: asyncpg.Connection, entry_id: uuid.UUID, store_id: uuid.UUID) -> asyncpg.Record:
    e = await conn.fetchrow("select * from sheet_entries where id = $1 and store_id = $2 for update",
                            entry_id, store_id)
    if e is None:
        raise not_found("entry")
    if e["status"] == "confirmed":
        raise ApiError(409, "entry_locked", "Confirmed entries can't be changed.")
    return e


@vendor.patch("/sheet-entries/{entry_id}", response_model=Entry, dependencies=[sensitive_limit("sheet")])
async def edit_entry(entry_id: uuid.UUID, body: EntryUpdate, ctx: ActiveSeller, conn: Conn):
    """Editing a rejected entry sends it back to the admin as pending."""
    data = body.model_dump(exclude_unset=True)
    for k in ("entry_date", "kind", "description", "reference"):
        if k in data and data[k] is None:
            raise ApiError(422, "invalid_value", f"{k} can't be empty.")
    async with conn.transaction():
        await bank.set_actor(conn, ctx.user.id)
        await _own_entry(conn, entry_id, ctx.store_id)
        if data:
            cols = list(data)
            sets = ", ".join(f"{c} = ${i + 2}" for i, c in enumerate(cols))
            await conn.execute(
                f"update sheet_entries set {sets}, status = 'pending', admin_note = null where id = $1",
                entry_id, *[data[c] for c in cols],
            )
    return dict(await conn.fetchrow(_ENTRY_SELECT + " where e.id = $1", entry_id))


@vendor.delete("/sheet-entries/{entry_id}", response_model=s.Message)
async def delete_entry(entry_id: uuid.UUID, ctx: ActiveSeller, conn: Conn):
    async with conn.transaction():
        await bank.set_actor(conn, ctx.user.id)
        await _own_entry(conn, entry_id, ctx.store_id)
        await conn.execute("delete from sheet_entries where id = $1", entry_id)
    return {"ok": True}


_AUDIT_SELECT = """select a.*, p.full_name as actor_name from audit_log a left join profiles p on p.id = a.actor_id"""


@vendor.get("/sheet-entries/{entry_id}/history", response_model=list[AuditRow])
async def entry_history(entry_id: uuid.UUID, ctx: Seller, conn: Conn):
    rows = await conn.fetch(
        _AUDIT_SELECT + " where a.entity = 'sheet_entries' and a.entity_id = $1 and a.store_id = $2 order by a.id",
        entry_id, ctx.store_id,
    )
    if not rows:
        raise not_found("entry")
    return [dict(r) for r in rows]


@admin.get("/sheet-entries", response_model=s.Page[Entry])
async def all_entries(
    _: AdminUser,
    conn: Conn,
    pg: Annotated[Paging, Depends(paging)],
    status: Literal["pending", "confirmed", "rejected"] | None = None,
    store_id: uuid.UUID | None = None,
):
    cond = "($1::text is null or e.status = $1) and ($2::uuid is null or e.store_id = $2)"
    total = await conn.fetchval(f"select count(*) from sheet_entries e where {cond}", status, store_id)
    recs = await conn.fetch(
        _ENTRY_SELECT + f" where {cond} order by e.created_at limit $3 offset $4",
        status, store_id, pg.page_size, pg.offset,
    )
    return pg.wrap([dict(r) for r in recs], total)


class ConfirmIn(s.Strict):
    # Type the transaction code or other key from your own records. It has
    # to match the vendor's reference, which proves you checked it.
    key: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=64)]
    note: s.MediumText | None = None


class RejectIn(s.Strict):
    note: s.MediumText


def _norm(key: str) -> str:
    return "".join(key.split()).upper()


@admin.post("/sheet-entries/{entry_id}/confirm", response_model=Entry, dependencies=[sensitive_limit("sheet")])
async def confirm_entry(entry_id: uuid.UUID, body: ConfirmIn, user: AdminUser, conn: Conn):
    async with conn.transaction():
        await bank.set_actor(conn, user.id)
        e = await conn.fetchrow("select * from sheet_entries where id = $1 for update", entry_id)
        if e is None:
            raise not_found("entry")
        if e["status"] == "confirmed":
            raise ApiError(409, "entry_locked", "Already confirmed.")
        if not e["reference"] or _norm(body.key) != _norm(e["reference"]):
            raise ApiError(422, "key_mismatch", "That key doesn't match the entry's reference.")
        await conn.execute(
            """update sheet_entries set status = 'confirmed', confirmed_by = $2, confirmed_at = now(),
                      admin_note = $3 where id = $1""",
            entry_id, user.id, body.note,
        )
    return dict(await conn.fetchrow(_ENTRY_SELECT + " where e.id = $1", entry_id))


@admin.post("/sheet-entries/{entry_id}/reject", response_model=Entry)
async def reject_entry(entry_id: uuid.UUID, body: RejectIn, user: AdminUser, conn: Conn):
    async with conn.transaction():
        await bank.set_actor(conn, user.id)
        e = await conn.fetchrow("select status from sheet_entries where id = $1 for update", entry_id)
        if e is None:
            raise not_found("entry")
        if e["status"] == "confirmed":
            raise ApiError(409, "entry_locked", "Confirmed entries can't be rejected.")
        await conn.execute("update sheet_entries set status = 'rejected', admin_note = $2 where id = $1",
                           entry_id, body.note)
    return dict(await conn.fetchrow(_ENTRY_SELECT + " where e.id = $1", entry_id))


@admin.get("/audit", response_model=s.Page[AuditRow])
async def audit(
    _: AdminUser,
    conn: Conn,
    pg: Annotated[Paging, Depends(paging)],
    entity: Literal["sheet_entries", "payment_receipts"] | None = None,
    entity_id: uuid.UUID | None = None,
    store_id: uuid.UUID | None = None,
):
    cond = ("($1::text is null or a.entity = $1) and ($2::uuid is null or a.entity_id = $2)"
            " and ($3::uuid is null or a.store_id = $3)")
    total = await conn.fetchval(f"select count(*) from audit_log a where {cond}", entity, entity_id, store_id)
    recs = await conn.fetch(
        _AUDIT_SELECT + f" where {cond} order by a.id desc limit $4 offset $5",
        entity, entity_id, store_id, pg.page_size, pg.offset,
    )
    return pg.wrap([dict(r) for r in recs], total)

