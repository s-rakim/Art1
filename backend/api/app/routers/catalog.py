"""Public catalogue: categories, products, stores, plans, placements, reviews, search."""

import uuid
from typing import Annotated, Literal

import asyncpg
from fastapi import APIRouter, Depends, Path, Query, Request, Response

from .. import schemas as s
from ..auth import CurrentUser
from ..common import (
    CARD_SELECT,
    VISIBLE,
    Paging,
    card,
    cards_by_ids,
    paging,
    sql_product_search,
)
from ..db import get_conn
from ..errors import ApiError, not_found
from ..security import sensitive_limit

router = APIRouter(tags=["catalog"])

Conn = Annotated[asyncpg.Connection, Depends(get_conn)]
Sort = Literal["relevance", "price_asc", "price_desc", "newest", "rating", "popular"]
SearchText = Annotated[str | None, Query(max_length=120)]
SlugParam = Annotated[str | None, Query(max_length=80, pattern=r"^[a-z0-9-]+$")]
PriceParam = Annotated[int | None, Query(ge=0, le=100_000_000)]
PathSlug = Annotated[str, Path(min_length=1, max_length=120, pattern=r"^[a-z0-9-]+$")]

PUBLIC_CACHE = "public, max-age=30, stale-while-revalidate=60"


@router.get("/categories", response_model=list[s.Category])
async def categories(conn: Conn, response: Response):
    recs = await conn.fetch("select id, parent_id, slug, name, image_url from categories order by sort, name")
    nodes = {r["id"]: {**dict(r), "children": []} for r in recs}
    roots = []
    for node in nodes.values():
        parent = nodes.get(node["parent_id"])
        (parent["children"] if parent else roots).append(node)
    response.headers["Cache-Control"] = "public, max-age=300"
    return roots


async def _list_products(
    request: Request,
    conn: asyncpg.Connection,
    pg: Paging,
    *,
    q: str | None,
    category: str | None,
    store: str | None,
    brand: str | None,
    min_price: int | None,
    max_price: int | None,
    sort: str,
) -> dict:
    q = (q or "").strip() or None
    if q:
        result = await request.app.state.search.search(
            {
                "q": q,
                "category": category,
                "store": store,
                "brand": brand,
                "min_price": min_price,
                "max_price": max_price,
                "sort": sort,
                "page": pg.page,
                "page_size": pg.page_size,
            }
        )
        if result is not None:
            ids = []
            for raw in result.get("ids", []):
                try:
                    ids.append(uuid.UUID(str(raw)))
                except ValueError:
                    continue
            items = await cards_by_ids(conn, ids)
            page = pg.wrap(items, int(result.get("total", len(items))))
            page["facets"] = result.get("facets") or {}
            return page

    items, total = await sql_product_search(
        conn,
        q=q,
        category=category,
        store=store,
        brand=brand,
        min_price=min_price,
        max_price=max_price,
        sort=sort,
        paging=pg,
    )
    return pg.wrap(items, total)


@router.get("/products", response_model=s.ProductPage)
async def list_products(
    request: Request,
    conn: Conn,
    response: Response,
    pg: Annotated[Paging, Depends(paging)],
    q: SearchText = None,
    category: SlugParam = None,
    store: SlugParam = None,
    brand: Annotated[str | None, Query(max_length=80)] = None,
    min_price: PriceParam = None,
    max_price: PriceParam = None,
    sort: Sort = "relevance",
):
    response.headers["Cache-Control"] = PUBLIC_CACHE
    return await _list_products(
        request, conn, pg, q=q, category=category, store=store, brand=brand,
        min_price=min_price, max_price=max_price, sort=sort,
    )


@router.get("/search/suggest", response_model=list[s.Suggestion])
async def suggest(
    request: Request,
    conn: Conn,
    q: Annotated[str, Query(min_length=1, max_length=80)],
    limit: Annotated[int, Query(ge=1, le=10)] = 8,
):
    found = await request.app.state.search.suggest(q.strip(), limit)
    if found is not None:
        return found[:limit]
    recs = await conn.fetch(
        f"""
        select p.title, p.slug from products p join stores s on s.id = p.store_id
         where {VISIBLE} and (p.title ilike $1 || '%' or p.title % $2)
         order by similarity(p.title, $2) desc, p.sold_count desc
         limit $3
        """,
        q.strip().replace("%", "").replace("_", ""),
        q.strip(),
        limit,
    )
    return [{"text": r["title"], "slug": r["slug"], "kind": "product"} for r in recs]


@router.get("/products/{slug}", response_model=s.ProductDetail)
async def product_detail(slug: PathSlug, conn: Conn, response: Response):
    p = await conn.fetchrow(
        f"""
        select p.*, p.rating_avg::float as rating, p.rating_count as review_count,
               s.id as store_id, s.slug as store_slug, s.name as store_name, s.logo_url as store_logo,
               s.rating_avg::float as store_rating, s.rating_count as store_review_count,
               c.id as cat_id, c.slug as cat_slug, c.name as cat_name
          from products p
          join stores s on s.id = p.store_id
          left join categories c on c.id = p.category_id
         where p.slug = $1 and {VISIBLE}
        """,
        slug,
    )
    if p is None:
        raise not_found("product")
    variants = await conn.fetch(
        """select id, sku, title, options, price_cents, compare_at_cents, stock, stock > 0 as in_stock,
                  min_order_qty, tier_prices
             from product_variants where product_id = $1 and is_active order by price_cents, created_at""",
        p["id"],
    )
    images = await conn.fetch(
        "select id, url, alt from product_images where product_id = $1 order by sort, id", p["id"]
    )
    response.headers["Cache-Control"] = PUBLIC_CACHE
    return {
        "id": p["id"],
        "slug": p["slug"],
        "title": p["title"],
        "description": p["description"],
        "brand": p["brand"],
        "attributes": p["attributes"],
        "tags": p["tags"],
        "currency": p["currency"],
        "price_cents": p["min_price_cents"],
        "max_price_cents": p["max_price_cents"],
        "rating": p["rating"],
        "review_count": p["review_count"],
        "sold_count": p["sold_count"],
        "variants": [dict(v) for v in variants],
        "images": [dict(i) for i in images],
        "store": {
            "id": p["store_id"],
            "slug": p["store_slug"],
            "name": p["store_name"],
            "logo_url": p["store_logo"],
            "rating": p["store_rating"],
            "review_count": p["store_review_count"],
        },
        "category": {"id": p["cat_id"], "slug": p["cat_slug"], "name": p["cat_name"]} if p["cat_id"] else None,
    }


async def _visible_product_id(conn: asyncpg.Connection, slug: str) -> uuid.UUID:
    pid = await conn.fetchval(
        f"select p.id from products p join stores s on s.id = p.store_id where p.slug = $1 and {VISIBLE}", slug
    )
    if pid is None:
        raise not_found("product")
    return pid


def _display_name(full_name: str | None) -> str:
    # Never expose emails. "Jane Doe" becomes "Jane D."
    if not full_name:
        return "Verified shopper"
    parts = full_name.split()
    return parts[0] if len(parts) == 1 else f"{parts[0]} {parts[-1][0]}."


@router.get("/products/{slug}/reviews", response_model=s.Page[s.Review])
async def product_reviews(
    slug: PathSlug,
    conn: Conn,
    pg: Annotated[Paging, Depends(paging)],
    rating: Annotated[int | None, Query(ge=1, le=5)] = None,
):
    pid = await _visible_product_id(conn, slug)
    cond, args = "r.product_id = $1", [pid]
    if rating:
        cond += " and r.rating = $2"
        args.append(rating)
    total = await conn.fetchval(f"select count(*) from reviews r where {cond}", *args)
    recs = await conn.fetch(
        f"""select r.id, r.rating, r.title, r.body, r.verified, r.created_at, pr.full_name
              from reviews r join profiles pr on pr.id = r.user_id
             where {cond} order by r.verified desc, r.created_at desc
             limit {pg.page_size} offset {pg.offset}""",
        *args,
    )
    items = [{**dict(r), "author_name": _display_name(r["full_name"])} for r in recs]
    return pg.wrap(items, total)


@router.post(
    "/products/{slug}/reviews",
    response_model=s.Review,
    status_code=201,
    dependencies=[sensitive_limit("review")],
)
async def create_review(slug: PathSlug, body: s.ReviewIn, user: CurrentUser, conn: Conn):
    pid = await _visible_product_id(conn, slug)
    # Only people who bought it, and paid, may review it. Stops review farms
    # and sellers reviewing their own products from a second account
    # without at least paying the commission.
    bought = await conn.fetchval(
        """select exists (select 1 from order_items oi join orders o on o.id = oi.order_id
                           where o.user_id = $1 and oi.product_id = $2
                             and o.status in ('paid', 'partially_fulfilled', 'fulfilled'))""",
        user.id,
        pid,
    )
    if not bought:
        raise ApiError(403, "purchase_required", "You can review products you have bought.")
    own = await conn.fetchval(
        "select exists (select 1 from products p join stores s on s.id = p.store_id where p.id = $1 and s.owner_id = $2)",
        pid,
        user.id,
    )
    if own:
        raise ApiError(403, "own_product", "You can't review your own store's products.")
    rec = await conn.fetchrow(
        """insert into reviews (product_id, user_id, rating, title, body, verified)
           values ($1, $2, $3, $4, $5, true)
           on conflict (product_id, user_id) do update
              set rating = excluded.rating, title = excluded.title, body = excluded.body, created_at = now()
           returning id, rating, title, body, verified, created_at""",
        pid,
        user.id,
        body.rating,
        body.title,
        body.body,
    )
    name = await conn.fetchval("select full_name from profiles where id = $1", user.id)
    return {**dict(rec), "author_name": _display_name(name)}


# ---------------------------------------------------------------------------
# Stores
# ---------------------------------------------------------------------------

STORE_PUBLIC = """
    select s.id, s.slug, s.name, s.tagline, s.description, s.logo_url, s.banner_url,
           s.banner_color, s.accent_color, s.country, s.support_email,
           s.rating_avg::float as rating, s.rating_count as review_count, s.created_at,
           (select count(*) from products p where p.store_id = s.id and p.status = 'active')::int as product_count
      from stores s
"""


@router.get("/stores", response_model=s.Page[s.Store])
async def list_stores(
    conn: Conn,
    pg: Annotated[Paging, Depends(paging)],
    q: SearchText = None,
):
    cond, args = "s.status = 'active'", []
    if q and q.strip():
        cond += " and s.name ilike '%' || $1 || '%'"
        args.append(q.strip().replace("%", "").replace("_", ""))
    total = await conn.fetchval(f"select count(*) from stores s where {cond}", *args)
    recs = await conn.fetch(
        STORE_PUBLIC + f" where {cond} order by s.rating_count desc, s.created_at limit {pg.page_size} offset {pg.offset}",
        *args,
    )
    return pg.wrap([dict(r) for r in recs], total)


@router.get("/stores/{slug}", response_model=s.Store)
async def store_detail(slug: PathSlug, conn: Conn, response: Response):
    rec = await conn.fetchrow(STORE_PUBLIC + " where s.slug = $1 and s.status = 'active'", slug)
    if rec is None:
        raise not_found("store")
    response.headers["Cache-Control"] = PUBLIC_CACHE
    return dict(rec)


@router.get("/stores/{slug}/products", response_model=s.ProductPage)
async def store_products(
    slug: PathSlug,
    request: Request,
    conn: Conn,
    pg: Annotated[Paging, Depends(paging)],
    q: SearchText = None,
    category: SlugParam = None,
    min_price: PriceParam = None,
    max_price: PriceParam = None,
    sort: Sort = "relevance",
):
    exists = await conn.fetchval("select 1 from stores where slug = $1 and status = 'active'", slug)
    if not exists:
        raise not_found("store")
    return await _list_products(
        request, conn, pg, q=q, category=category, store=slug, brand=None,
        min_price=min_price, max_price=max_price, sort=sort,
    )


# ---------------------------------------------------------------------------
# Plans and placements
# ---------------------------------------------------------------------------


@router.get("/plans", response_model=list[s.Plan])
async def plans(conn: Conn, response: Response):
    recs = await conn.fetch(
        """select id, code, name, description, monthly_price_cents, currency, commission_rate::float,
                  per_item_fee_cents, product_limit, featured_slots, features
             from store_plans where is_active order by sort, monthly_price_cents"""
    )
    response.headers["Cache-Control"] = "public, max-age=300"
    return [dict(r) for r in recs]


@router.get("/placement-slots", response_model=list[s.PlacementSlot])
async def placement_slots(conn: Conn):
    recs = await conn.fetch(
        """select id, code, name, description, location, daily_price_cents, currency, capacity
             from placement_slots where is_active order by daily_price_cents desc"""
    )
    return [dict(r) for r in recs]


@router.get("/placements", response_model=list[s.Placement])
async def placements(
    conn: Conn,
    response: Response,
    location: Literal["home_hero", "home_grid", "category_top", "search_top"] = "home_hero",
):
    recs = await conn.fetch(
        """select b.id, sl.code as slot_code, sl.location, b.headline, b.image_url, b.product_id,
                  st.slug as store_slug, st.name as store_name
             from placement_bookings b
             join placement_slots sl on sl.id = b.slot_id
             join stores st on st.id = b.store_id
            where sl.location = $1 and st.status = 'active'
              and b.status in ('scheduled', 'live')
              and current_date between b.starts_on and b.ends_on
            order by random()
            limit 24""",
        location,
    )
    product_ids = [r["product_id"] for r in recs if r["product_id"]]
    cards = {c["id"]: {**c, "sponsored": True} for c in await cards_by_ids(conn, product_ids)}
    response.headers["Cache-Control"] = "public, max-age=60"
    out = []
    for r in recs:
        product = cards.get(r["product_id"]) if r["product_id"] else None
        if r["product_id"] and product is None:
            continue  # product was unpublished; don't advertise a dead link
        out.append(
            {
                "id": r["id"],
                "slot_code": r["slot_code"],
                "location": r["location"],
                "headline": r["headline"],
                "image_url": r["image_url"],
                "store": {"slug": r["store_slug"], "name": r["store_name"]},
                "product": product,
            }
        )
    return out


__all__ = ["router", "CARD_SELECT", "card"]
