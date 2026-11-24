import type { ProductQuery } from "./api";
import { clampInt, safeSlug } from "./safe";

export type SP = Record<string, string | string[] | undefined>;
const SORTS = ["relevance", "price_asc", "price_desc", "newest", "rating", "popular"] as const;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/** Turns untrusted search params into a bounded, typed query. */
export function parseQuery(sp: SP, overrides: Partial<ProductQuery> = {}): ProductQuery {
  const sort = one(sp.sort);
  const cat = one(sp.category);
  const store = one(sp.store);
  const min = one(sp.min);
  const max = one(sp.max);
  return {
    q: one(sp.q)?.slice(0, 120) || undefined,
    category: cat ? safeSlug(cat) ?? undefined : undefined,
    store: store ? safeSlug(store) ?? undefined : undefined,
    sort: (SORTS as readonly string[]).includes(sort ?? "") ? (sort as ProductQuery["sort"]) : undefined,
    min_price: min ? clampInt(min, 0, 1_000_000, 0) * 100 || undefined : undefined,
    max_price: max ? clampInt(max, 0, 1_000_000, 0) * 100 || undefined : undefined,
    min_rating: one(sp.rating) ? clampInt(one(sp.rating), 1, 5, 0) || undefined : undefined,
    on_sale: one(sp.sale) === "1" || undefined,
    page: clampInt(one(sp.page), 1, 500, 1),
    page_size: 24,
    ...overrides,
  };
}

export function toParams(sp: SP, patch: Record<string, string | null>) {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = one(v);
    if (val) out.set(k, val);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) out.delete(k);
    else out.set(k, v);
  }
  if (!("page" in patch)) out.delete("page");
  return out.toString();
}
