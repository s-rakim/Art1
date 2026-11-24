"""Bits shared between routers: paging, product cards, the search client."""

import logging
import re
import secrets
import unicodedata
import uuid
from dataclasses import dataclass
from typing import Annotated, Any

import asyncpg
import httpx
from fastapi import Query

log = logging.getLogger("api")

MAX_OFFSET = 10_000


@dataclass
class Paging:
    page: int
    page_size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    def wrap(self, items: list, total: int) -> dict:
        return {"items": items, "total": total, "page": self.page, "page_size": self.page_size}


def paging(
    page: Annotated[int, Query(ge=1, le=1000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 24,
) -> Paging:
    p = Paging(page, page_size)
    if p.offset > MAX_OFFSET:
        # Deep offsets are slow and only useful to scrapers.
        p.page = MAX_OFFSET // page_size + 1
    return p


def slugify(text: str, max_len: int = 60) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return (text[:max_len].strip("-")) or "item"


def unique_suffix() -> str:
    return secrets.token_hex(3)


# ---------------------------------------------------------------------------
# Product cards
# ---------------------------------------------------------------------------

CARD_SELECT = """
    select p.id, p.slug, p.title, p.brand, p.currency,
           p.min_price_cents as price_cents,
           (select v.compare_at_cents from product_variants v
             where v.product_id = p.id and v.is_active
             order by v.price_cents limit 1) as compare_at_cents,
           p.rating_avg::float as rating, p.rating_count as review_count, p.sold_count,
           (select i.url from product_images i where i.product_id = p.id
             order by i.sort, i.id limit 1) as image_url,
           s.slug as store_slug, s.name as store_name,
           c.slug as category_slug,
           p.created_at
      from products p
      join stores s on s.id = p.store_id
      left join categories c on c.id = p.category_id
"""

VISIBLE = "p.status = 'active' and s.status = 'active'"


def card(r: asyncpg.Record | dict, sponsored: bool = False) -> dict:
    r = dict(r)
    return {
        "id": r["id"],
        "slug": r["slug"],
        "title": r["title"],
        "brand": r["brand"],
        "image_url": r["image_url"],
        "price_cents": r["price_cents"],
        "compare_at_cents": r["compare_at_cents"],
        "currency": r["currency"],
        "rating": float(r["rating"] or 0),
        "review_count": r["review_count"],
        "sold_count": r["sold_count"],
        "store": {"slug": r["store_slug"], "name": r["store_name"]},
        "category_slug": r["category_slug"],
        "sponsored": sponsored,
    }


async def cards_by_ids(conn: asyncpg.Connection, ids: list[uuid.UUID]) -> list[dict]:
    if not ids:
        return []
    recs = await conn.fetch(
        CARD_SELECT + f" where p.id = any($1::uuid[]) and {VISIBLE} order by array_position($1::uuid[], p.id)",
        ids,
    )
    return [card(r) for r in recs]


SORTS = {
    "relevance": "p.sold_count desc, p.rating_avg desc, p.created_at desc",
    "price_asc": "p.min_price_cents asc nulls last, p.id",
    "price_desc": "p.min_price_cents desc nulls last, p.id",
    "newest": "p.created_at desc, p.id",
    "rating": "p.rating_avg desc, p.rating_count desc, p.id",
    "popular": "p.sold_count desc, p.id",
}


async def category_ids(conn: asyncpg.Connection, slug: str) -> list[uuid.UUID]:
    """A category and everything under it."""
    recs = await conn.fetch(
        """
        with recursive tree as (
            select id from categories where slug = $1
            union all
            select c.id from categories c join tree t on c.parent_id = t.id
        ) select id from tree
        """,
        slug,
    )
    return [r["id"] for r in recs]


async def sql_product_search(
    conn: asyncpg.Connection,
    *,
    q: str | None,
    category: str | None,
    store: str | None,
    brand: str | None,
    min_price: int | None,
    max_price: int | None,
    sort: str,
    paging: Paging,
) -> tuple[list[dict], int]:
    """Postgres only listing. Used when there is no query, and as the fallback
    when the search service is down."""
    where = [VISIBLE]
    args: list[Any] = []

    def arg(v) -> str:
        args.append(v)
        return f"${len(args)}"

    if category:
        ids = await category_ids(conn, category)
        if not ids:
            return [], 0
        where.append(f"p.category_id = any({arg(ids)}::uuid[])")
    if store:
        where.append(f"s.slug = {arg(store)}")
    if brand:
        where.append(f"lower(p.brand) = lower({arg(brand)})")
    if min_price is not None:
        where.append(f"p.min_price_cents >= {arg(min_price)}")
    if max_price is not None:
        where.append(f"p.min_price_cents <= {arg(max_price)}")

    order = SORTS.get(sort, SORTS["relevance"])
    if q:
        qa = arg(q)
        where.append(f"(p.search @@ websearch_to_tsquery('simple', {qa}) or p.title % {qa})")
        if sort == "relevance":
            order = f"ts_rank(p.search, websearch_to_tsquery('simple', {qa})) desc, similarity(p.title, {qa}) desc, p.id"

    cond = " and ".join(where)
    total = await conn.fetchval(
        f"select count(*) from products p join stores s on s.id = p.store_id where {cond}", *args
    )
    recs = await conn.fetch(
        CARD_SELECT + f" where {cond} order by {order} limit {arg(paging.page_size)} offset {arg(paging.offset)}",
        *args,
    )
    return [card(r) for r in recs], total


# ---------------------------------------------------------------------------
# Search service client
# ---------------------------------------------------------------------------


class SearchClient:
    """Talks to the Go search service. Every call is allowed to fail: the
    caller falls back to Postgres."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self._client = httpx.AsyncClient(base_url=self.base_url, timeout=httpx.Timeout(1.5, connect=0.5))

    async def search(self, params: dict) -> dict | None:
        if not self.base_url:
            return None
        try:
            resp = await self._client.get("/search", params={k: v for k, v in params.items() if v is not None})
            resp.raise_for_status()
            return resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("search service unavailable: %s", exc)
            return None

    async def suggest(self, q: str, limit: int) -> list[dict] | None:
        if not self.base_url:
            return None
        try:
            resp = await self._client.get("/suggest", params={"q": q, "limit": limit})
            resp.raise_for_status()
            return resp.json().get("suggestions", [])
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("search suggest unavailable: %s", exc)
            return None

    async def close(self):
        await self._client.aclose()
