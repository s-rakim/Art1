"""The payments bank: reading M-Pesa and bank messages, and using a payment
against an order.

Shoppers pay The Bazaar's till or bank account, quoting the order number.
Every payment that reaches the till ends up as a row in payment_receipts,
from one of three places:

  * an admin pastes the till's or bank's messages into the console
  * a phone that receives those messages forwards them (any SMS forwarding
    app that can POST text to a URL)
  * Safaricom's Daraja API posts each C2B payment to us

Message text comes from outside and is treated as hostile: it is length
capped, stripped of control characters and only ever matched with regular
expressions. Nothing in it is trusted except the fields we pull out, and
those are validated again by the database.

Using a payment (`apply_receipt`) is the only way an order gets paid on
this path. It locks the order, then the receipt, refuses a receipt that is
already used, void or (for riders) stale, and marks it confirmed. Store
orders are then marked paid in turn while the money covers them, starting
with the one at the door.
"""

import re
import unicodedata
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import asyncpg

from .errors import ApiError

MAX_TEXT = 200_000          # one paste
MAX_MESSAGE = 2_000         # one message
MAX_MESSAGES = 500          # per paste

_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f​-‏‪-‮⁦-⁩]")
_MPESA_START = re.compile(r"\b([A-Z0-9]{10})\s+Confirmed\b", re.I)
_AMOUNT = re.compile(
    r"\b(KES|KSH|KSHS|USD|UGX|TZS|GHS|NGN|RWF|ZAR)\s?\.?\s?([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(\.[0-9]{1,2})?\b", re.I
)
_CURRENCY = {"KES": "KES", "KSH": "KES", "KSHS": "KES"}
_WORD = r"(?:[A-Z]\.|[A-Z][A-Za-z'-]*)"
_NAME = re.compile(
    r"\b(?:from|by)\s+(?:[0-9*+]{6,15}\s+)?(" + _WORD + r"(?:\s+" + _WORD + r"){0,4})"
    r"(?=\s+(?:[0-9*+]{6,15}|on\b|for\b|ref\b|via\b|account\b|acc\b|at\b)|\s*[.,]|\s*$)"
)
_NAME_AFTER_PHONE = re.compile(r"\bfrom\s+[0-9*+]{6,15}\s+(" + _WORD + r"(?:\s+" + _WORD + r"){0,4})")
_PHONE = re.compile(r"\b(?:\+?254|0)[0-9*]{8,10}\b")
_PAYBILL_ACCOUNT = re.compile(r"\bfor\s+account\s+([A-Za-z0-9-]{1,40})", re.I)
_ORDER_NUMBER = re.compile(r"\bBZ-[0-9]{6}-[0-9]{1,10}\b", re.I)
_BANK_REF = re.compile(
    r"\b(?:ref(?:erence)?|txn\s*(?:id|ref)?|transaction\s*(?:id|code|ref(?:erence)?)|trx)\.?\s*(?:no\.?|number|#)?\s*[:#-]?\s*"
    r"([A-Z0-9]{6,24})\b", re.I
)
_DATE_TIME = re.compile(
    r"\b([0-9]{1,2})[/-]([0-9]{1,2})[/-]([0-9]{2,4})(?:\s+(?:at\s+)?([0-9]{1,2}):([0-9]{2})(?::[0-9]{2})?\s*([AP]M)?)?",
    re.I,
)

# Words a name regex can catch that are never a name.
_NOT_NAMES = {"YOUR", "ACCOUNT", "MPESA", "M-PESA", "CUSTOMER", "THE", "MOBILE", "BANK"}


def clean_text(text: str, limit: int = MAX_TEXT) -> str:
    text = unicodedata.normalize("NFKC", text or "")[:limit]
    return _CTRL.sub(" ", text)


@dataclass
class Parsed:
    provider: str
    code: str
    amount_cents: int
    currency: str
    payer_name: str | None
    payer_phone: str | None
    account_ref: str | None
    received_at: datetime
    raw: str
    order_number: str | None = None


@dataclass
class ParseResult:
    rows: list[Parsed] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)


def split_messages(text: str) -> list[str]:
    """One pasted blob into messages: M-Pesa messages start with their code
    and "Confirmed"; anything else is split on blank lines."""
    text = clean_text(text)
    chunks = [c.strip() for c in re.split(r"\n\s*\n", text) if c.strip()]
    out: list[str] = []
    for chunk in chunks:
        starts = [m.start() for m in _MPESA_START.finditer(chunk)]
        if len(starts) <= 1:
            out.append(chunk)
            continue
        if starts[0] > 0:
            out.append(chunk[: starts[0]].strip())
        for a, b in zip(starts, starts[1:] + [len(chunk)], strict=True):
            out.append(chunk[a:b].strip())
    return [" ".join(m.split())[:MAX_MESSAGE] for m in out if m][:MAX_MESSAGES]


def _amount(text: str, default_currency: str) -> tuple[int, str] | None:
    m = _AMOUNT.search(text)
    if not m:
        return None
    cur = m.group(1).upper()
    whole = int(m.group(2).replace(",", ""))
    frac = (m.group(3) or ".0")[1:].ljust(2, "0")
    cents = whole * 100 + int(frac)
    if cents <= 0 or cents > 10_000_000_000:
        return None
    return cents, _CURRENCY.get(cur, cur if len(cur) == 3 else default_currency)


def _when(text: str, tz: ZoneInfo) -> datetime | None:
    m = _DATE_TIME.search(text)
    if not m:
        return None
    day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if year < 100:
        year += 2000
    hour, minute = int(m.group(4) or 0), int(m.group(5) or 0)
    if m.group(6):
        hour = hour % 12 + (12 if m.group(6).upper() == "PM" else 0)
    try:
        return datetime(year, month, day, hour, minute, tzinfo=tz).astimezone(timezone.utc)
    except ValueError:
        return None


def _name(text: str) -> str | None:
    for rx in (_NAME_AFTER_PHONE, _NAME):
        m = rx.search(text)
        if m:
            name = " ".join(m.group(1).split()).strip(" .,'-")
            if name and name.upper() not in _NOT_NAMES and len(name) <= 80:
                return name
    return None


def parse_message(text: str, default_currency: str, tz: ZoneInfo, now: datetime | None = None) -> Parsed | None:
    now = now or datetime.now(timezone.utc)
    text = " ".join(clean_text(text, MAX_MESSAGE).split())
    amount = _amount(text, default_currency)
    if amount is None:
        return None
    mpesa = _MPESA_START.search(text)
    if mpesa and mpesa.start() < 40:
        provider, code = "mpesa", mpesa.group(1).upper()
        # Real receipt codes mix letters and digits; this keeps words out.
        if not (re.search(r"[A-Z]", code) and re.search(r"[0-9]", code)):
            return None
    else:
        ref = _BANK_REF.search(text)
        if not ref:
            return None
        provider, code = "bank", ref.group(1).upper()
        if not re.search(r"[0-9]", code):
            return None
    when = _when(text, tz)
    if when is None or when > now + timedelta(days=1) or when < now - timedelta(days=366):
        when = now
    phone = _PHONE.search(text)
    order = _ORDER_NUMBER.search(text)
    account = _PAYBILL_ACCOUNT.search(text)
    return Parsed(
        provider=provider,
        code=code,
        amount_cents=amount[0],
        currency=amount[1],
        payer_name=_name(text),
        payer_phone=phone.group(0) if phone else None,
        account_ref=(account.group(1) if account else None) or (order.group(0) if order else None),
        received_at=when,
        raw=text,
        order_number=order.group(0).upper() if order else None,
    )


def parse_text(text: str, default_currency: str, tz_name: str) -> ParseResult:
    tz = ZoneInfo(tz_name)
    result = ParseResult()
    seen: set[tuple[str, str]] = set()
    for msg in split_messages(text):
        p = parse_message(msg, default_currency, tz)
        if p is None:
            result.failed.append(msg[:160])
            continue
        if (p.provider, p.code) in seen:
            continue
        seen.add((p.provider, p.code))
        result.rows.append(p)
    return result


def parse_daraja(body: dict, default_currency: str, tz_name: str) -> Parsed | None:
    """A Daraja C2B confirmation. TransTime is YYYYMMDDHHmmss, Nairobi time."""
    code = str(body.get("TransID") or "").strip().upper()
    if not re.fullmatch(r"[A-Z0-9]{6,24}", code):
        return None
    try:
        cents = round(float(str(body.get("TransAmount") or "0").replace(",", "")) * 100)
    except ValueError:
        return None
    if cents <= 0 or cents > 10_000_000_000:
        return None
    when = datetime.now(timezone.utc)
    t = str(body.get("TransTime") or "")
    if re.fullmatch(r"[0-9]{14}", t):
        try:
            when = datetime.strptime(t, "%Y%m%d%H%M%S").replace(tzinfo=ZoneInfo(tz_name)).astimezone(timezone.utc)
        except ValueError:
            pass
    name = " ".join(
        clean_text(str(body.get(k) or ""), 40).strip() for k in ("FirstName", "MiddleName", "LastName")
    ).strip()
    ref = clean_text(str(body.get("BillRefNumber") or ""), 40).strip() or None
    order = _ORDER_NUMBER.search(ref or "")
    return Parsed(
        provider="mpesa", code=code, amount_cents=cents, currency=default_currency if default_currency else "KES",
        payer_name=" ".join(name.split())[:80] or None, payer_phone=None, account_ref=ref,
        received_at=when, raw=clean_text(str({k: body.get(k) for k in ("TransID", "TransAmount", "BillRefNumber",
                                                                        "TransTime")}), 500),
        order_number=order.group(0).upper() if order else None,
    )


async def store_parsed(conn: asyncpg.Connection, rows: list[Parsed], source: str, ttl_hours: int,
                       created_by: uuid.UUID | None) -> list[dict]:
    """Insert what isn't stored yet. Returns one dict per row with its id and
    whether it was already there."""
    out = []
    for p in rows:
        order_id = None
        if p.order_number:
            order_id = await conn.fetchval("select id from orders where number = $1", p.order_number)
        rec = await conn.fetchrow(
            """insert into payment_receipts (provider, source, code, amount_cents, currency, payer_name, payer_phone,
                                             account_ref, received_at, expires_at, raw_text, created_by)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
               on conflict (provider, code) do nothing
               returning id""",
            p.provider, source, p.code, p.amount_cents, p.currency, p.payer_name, p.payer_phone,
            p.account_ref, p.received_at, max(p.received_at, datetime.now(timezone.utc)) + timedelta(hours=ttl_hours),
            p.raw, created_by,
        )
        duplicate = rec is None
        rid = rec["id"] if rec else await conn.fetchval(
            "select id from payment_receipts where provider = $1 and code = $2", p.provider, p.code
        )
        out.append({
            "id": rid, "code": p.code, "provider": p.provider, "payer_name": p.payer_name,
            "payer_phone": p.payer_phone, "amount_cents": p.amount_cents, "currency": p.currency,
            "received_at": p.received_at, "account_ref": p.account_ref,
            "matched_order_number": p.order_number if order_id else None, "duplicate": duplicate,
        })
    return out


# ---------------------------------------------------------------------------
# Using a payment
# ---------------------------------------------------------------------------


async def store_order_dues(conn: asyncpg.Connection, order_id: uuid.UUID) -> list[dict]:
    """What each store's part of an order costs the shopper, with the order's
    tax shared out by value (the remainder on the last one so it adds up)."""
    o = await conn.fetchrow("select total_cents, tax_cents from orders where id = $1", order_id)
    recs = await conn.fetch(
        """select id, subtotal_cents - discount_cents + shipping_cents as base, payment_status, status
             from store_orders where order_id = $1 order by created_at, id""",
        order_id,
    )
    goods = sum(r["base"] for r in recs if r["status"] != "canceled") or 1
    out, given = [], 0
    live = [r for r in recs if r["status"] != "canceled"]
    for i, r in enumerate(live):
        tax = o["tax_cents"] - given if i == len(live) - 1 else round(o["tax_cents"] * r["base"] / goods)
        given += tax
        out.append({"id": r["id"], "due": r["base"] + tax, "paid": r["payment_status"] == "paid"})
    return out


async def payment_state(conn: asyncpg.Connection, order_id: uuid.UUID, store_order_id: uuid.UUID | None) -> dict:
    paid = await conn.fetchval(
        "select coalesce(sum(amount_cents), 0) from payment_receipts where order_id = $1 and status = 'confirmed'",
        order_id,
    )
    o = await conn.fetchrow("select total_cents, currency from orders where id = $1", order_id)
    dues = await store_order_dues(conn, order_id)
    if store_order_id is not None:
        mine = next((d for d in dues if d["id"] == store_order_id), None)
        confirmed = bool(mine and mine["paid"])
        due = 0 if confirmed else (mine["due"] if mine else 0)
    else:
        confirmed = all(d["paid"] for d in dues)
        due = max(o["total_cents"] - paid, 0)
    return {"due_cents": due, "paid_cents": paid, "payment_confirmed": confirmed, "currency": o["currency"]}


async def apply_receipt(
    conn: asyncpg.Connection,
    *,
    receipt_id: uuid.UUID,
    order_id: uuid.UUID,
    actor: uuid.UUID,
    role: str,
    hold_days: int,
    store_order_id: uuid.UUID | None = None,
    delivery_id: uuid.UUID | None = None,
) -> list[uuid.UUID]:
    """Use a receipt against an order. Run inside a transaction. Returns the
    store orders that became paid. Raises on a used, void or stale receipt."""
    order = await conn.fetchrow(
        "select id, status, currency, number from orders where id = $1 for update", order_id
    )
    if order is None:
        raise ApiError(404, "not_found", "We couldn't find that order.")
    if order["status"] in ("canceled", "refunded"):
        raise ApiError(409, "order_canceled", "This order was canceled.")
    r = await conn.fetchrow("select * from payment_receipts where id = $1 for update", receipt_id)
    if r is None:
        raise ApiError(404, "not_found", "No payment with that code.")
    if r["status"] == "confirmed":
        raise ApiError(409, "code_used", "This payment code has already been used.")
    if r["status"] == "void":
        raise ApiError(409, "code_void", "This payment was voided by an admin.")
    stale = r["status"] == "expired" or r["expires_at"] < datetime.now(timezone.utc)
    if stale and role != "admin":
        raise ApiError(409, "code_expired", "This payment is too old to use here. Ask an admin to check it.")
    if r["currency"] != order["currency"]:
        raise ApiError(409, "currency_mismatch",
                       f"This payment is in {r['currency']} but the order is in {order['currency']}.")
    await conn.execute(
        """update payment_receipts
              set status = 'confirmed', order_id = $2, confirmed_at = now(), confirmed_by = $3,
                  confirmed_role = $4, delivery_id = $5
            where id = $1""",
        receipt_id, order_id, actor, role, delivery_id,
    )
    await conn.execute("update orders set payment_ref = coalesce(payment_ref, $2) where id = $1", order_id, r["code"])

    paid = await conn.fetchval(
        "select coalesce(sum(amount_cents), 0) from payment_receipts where order_id = $1 and status = 'confirmed'",
        order_id,
    )
    dues = await store_order_dues(conn, order_id)
    covered = sum(d["due"] for d in dues if d["paid"])
    # The store order at the door first, then the rest in order.
    dues.sort(key=lambda d: (d["id"] != store_order_id,))
    newly = []
    for d in dues:
        if d["paid"]:
            continue
        if covered + d["due"] > paid:
            if d["id"] == store_order_id:
                continue
            break
        await conn.execute("select mark_store_order_paid($1, 'platform', $2)", d["id"], hold_days)
        covered += d["due"]
        newly.append(d["id"])
    if newly:
        await conn.execute(
            """update orders set payment_provider = coalesce(payment_provider, 'manual'),
                                 paid_at = coalesce(paid_at, case when not exists (
                                     select 1 from store_orders where order_id = $1 and payment_status <> 'paid'
                                       and status <> 'canceled') then now() end)
                where id = $1""",
            order_id,
        )
    return newly


async def set_actor(conn: asyncpg.Connection, user_id: uuid.UUID) -> None:
    """Who the audit log records for the rest of this transaction."""
    await conn.execute("select set_config('app.actor', $1, true)", str(user_id))


def mask_code(code: str) -> str:
    return "•" * max(len(code) - 3, 0) + code[-3:]
