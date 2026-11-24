import Link from "next/link";
import { Suspense } from "react";
import { api, type ProductQuery } from "@/lib/api";
import { money } from "@/lib/format";
import { toParams, type SP } from "@/lib/query";
import type { Category } from "@/lib/types";
import { Filter, X } from "./icons";
import { ProductGrid } from "./product-card";
import { SortSelect } from "./sort-select";
import { Empty } from "./ui";

type Props = {
  basePath: string;
  sp: SP;
  query: ProductQuery;
  categories: Category[];
  lockCategory?: boolean;
  lockSale?: boolean;
};

export async function Listing({ basePath, sp, query, categories, lockCategory, lockSale }: Props) {
  const [result, stores] = await Promise.all([api.products(query), api.stores()]);
  const pages = Math.max(1, Math.ceil(result.total / result.page_size));
  const href = (patch: Record<string, string | null>) => {
    const s = toParams(sp, patch);
    return s ? `${basePath}?${s}` : basePath;
  };

  const chips: Array<[string, Record<string, string | null>]> = [];
  if (query.q) chips.push([`“${query.q}”`, { q: null }]);
  if (query.category && !lockCategory) chips.push([categories.find((c) => c.slug === query.category)?.name ?? query.category, { category: null }]);
  if (query.store) chips.push([stores.items.find((s) => s.slug === query.store)?.name ?? query.store, { store: null }]);
  if (query.min_price || query.max_price)
    chips.push([`${query.min_price ? money(query.min_price) : "$0"} to ${query.max_price ? money(query.max_price) : "any"}`, { min: null, max: null }]);
  if (query.min_rating) chips.push([`${query.min_rating}★ and up`, { rating: null }]);
  if (query.on_sale && !lockSale) chips.push(["On sale", { sale: null }]);

  const filters = (
    <form action={basePath} method="get" className="space-y-7 text-[14px]">
      {query.q && <input type="hidden" name="q" value={query.q} />}
      {query.sort && <input type="hidden" name="sort" value={query.sort} />}
      {lockCategory && query.category && <input type="hidden" name="category" value={query.category} />}
      {!lockCategory && (
        <fieldset>
          <legend className="label mb-2">Department</legend>
          <ul className="space-y-1.5">
            {categories.filter((c) => !c.parent_id).map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="category" value={c.slug} defaultChecked={query.category === c.slug} className="accent-ink" />
                  {c.name}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <fieldset>
        <legend className="label mb-2">Price</legend>
        <div className="flex items-center gap-2">
          <input name="min" inputMode="numeric" pattern="[0-9]*" placeholder="Min" defaultValue={query.min_price ? query.min_price / 100 : ""} className="field !h-9" aria-label="Minimum price" />
          <span className="text-ink-3">to</span>
          <input name="max" inputMode="numeric" pattern="[0-9]*" placeholder="Max" defaultValue={query.max_price ? query.max_price / 100 : ""} className="field !h-9" aria-label="Maximum price" />
        </div>
      </fieldset>
      <fieldset>
        <legend className="label mb-2">Customer rating</legend>
        <ul className="space-y-1.5">
          {[4, 3].map((r) => (
            <li key={r}>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" name="rating" value={r} defaultChecked={query.min_rating === r} className="accent-ink" />
                {r}★ and up
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {!lockSale && (
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" name="sale" value="1" defaultChecked={!!query.on_sale} className="accent-signal" />
          On sale only
        </label>
      )}
      <fieldset>
        <legend className="label mb-2">Store</legend>
        <select name="store" defaultValue={query.store ?? ""} className="field !h-9">
          <option value="">Any store</option>
          {stores.items.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
        </select>
      </fieldset>
      <div className="flex gap-2">
        <button className="btn btn-ink btn-sm flex-1" type="submit">Apply</button>
        <Link href={href({ min: null, max: null, rating: null, sale: null, store: null, ...(lockCategory ? {} : { category: null }) })} className="btn btn-ghost btn-sm">Clear</Link>
      </div>
    </form>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
      <aside className="hidden lg:block">
        <div className="sticky top-44">{filters}</div>
      </aside>
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
          <p className="text-[13px] text-ink-2">
            <span className="price text-ink">{result.total.toLocaleString("en-US")}</span> {result.total === 1 ? "item" : "items"}
          </p>
          <div className="flex items-center gap-2">
            <details className="relative lg:hidden">
              <summary className="btn btn-line btn-sm list-none"><Filter size={16} /> Filters</summary>
              <div className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto border-t-2 border-ink bg-paper p-5 shadow-[0_-8px_0_0_rgba(22,19,15,0.08)]">
                {filters}
              </div>
            </details>
            <Suspense><SortSelect /></Suspense>
          </div>
        </div>
        {chips.length > 0 && (
          <ul className="mb-5 flex flex-wrap gap-2">
            {chips.map(([label, patch]) => (
              <li key={label}>
                <Link href={href(patch)} className="inline-flex items-center gap-1.5 border border-ink bg-card px-2.5 py-1 text-[12px] font-medium hover:bg-ink hover:text-paper">
                  {label} <X size={12} />
                  <span className="sr-only">Remove filter</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {result.items.length === 0 ? (
          <Empty title="Nothing on the shelf" body="Try a broader search, or clear a filter or two." action={<Link className="btn btn-ink" href={basePath}>Clear everything</Link>} />
        ) : (
          <ProductGrid items={result.items} />
        )}
        {pages > 1 && (
          <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-1">
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={href({ page: n === 1 ? null : String(n) })}
                aria-current={n === result.page ? "page" : undefined}
                className={`price flex h-9 w-9 items-center justify-center border text-[13px] ${n === result.page ? "border-ink bg-ink text-paper" : "border-rule hover:border-ink"}`}
              >
                {n}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
