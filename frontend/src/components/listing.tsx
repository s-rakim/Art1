import Link from "next/link";
import { Suspense } from "react";
import { api, type ProductQuery } from "@/lib/api";
import { money } from "@/lib/format";
import { toParams, type SP } from "@/lib/query";
import type { Category } from "@/lib/types";
import { Filter, Search, X } from "./icons";
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
    <form action={basePath} method="get" className="space-y-5 text-[15px]">
      {query.q && <input type="hidden" name="q" value={query.q} />}
      {query.sort && <input type="hidden" name="sort" value={query.sort} />}
      {lockCategory && query.category && <input type="hidden" name="category" value={query.category} />}
      {!lockCategory && (
        <fieldset>
          <legend className="mb-1 font-semibold">Department</legend>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
            {categories.filter((c) => !c.parent_id).map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="category" value={c.slug} defaultChecked={query.category === c.slug} />
                  {c.name}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <fieldset>
        <legend className="mb-1 font-semibold">Price</legend>
        <div className="flex items-center gap-2">
          <input name="min" inputMode="numeric" pattern="[0-9]*" placeholder="Min" defaultValue={query.min_price ? query.min_price / 100 : ""} className="field" aria-label="Minimum price" />
          <span className="text-maxcontrast">to</span>
          <input name="max" inputMode="numeric" pattern="[0-9]*" placeholder="Max" defaultValue={query.max_price ? query.max_price / 100 : ""} className="field" aria-label="Maximum price" />
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 font-semibold">Customer rating</legend>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
          {[4, 3].map((r) => (
            <li key={r}>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" name="rating" value={r} defaultChecked={query.min_rating === r} />
                {r}★ and up
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {!lockSale && (
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" name="sale" value="1" defaultChecked={!!query.on_sale} />
          On sale only
        </label>
      )}
      <fieldset>
        <legend className="mb-1 font-semibold">Store</legend>
        <select name="store" defaultValue={query.store ?? ""} className="field">
          <option value="">Any store</option>
          {stores.items.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
        </select>
      </fieldset>
      <div className="flex gap-2">
        <button className="btn btn-primary flex-1" type="submit">Apply filters</button>
        <Link href={href({ min: null, max: null, rating: null, sale: null, store: null, ...(lockCategory ? {} : { category: null }) })} className="btn btn-tertiary">Clear</Link>
      </div>
    </form>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14px] text-maxcontrast">
          <span className="price text-main-text">{result.total.toLocaleString("en-US")}</span> {result.total === 1 ? "item" : "items"}
        </p>
        <div className="flex items-center gap-2">
          <details className="group relative">
            <summary className="btn list-none [&::-webkit-details-marker]:hidden">
              <Filter size={18} /> Filters{chips.length > 0 && <span className="counter counter-highlighted ml-0.5">{chips.length}</span>}
            </summary>
            <div className="menu fixed inset-x-2 bottom-2 z-50 max-h-[80vh] overflow-y-auto !p-4 sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-auto sm:mt-1 sm:w-[360px]">
              {filters}
            </div>
          </details>
          <Suspense><SortSelect /></Suspense>
        </div>
      </div>
      <div>
        {chips.length > 0 && (
          <ul className="mb-4 flex flex-wrap gap-1.5">
            {chips.map(([label, patch]) => (
              <li key={label}>
                <Link href={href(patch)} className="chip chip-secondary h-[28px] rounded-pill pr-2 hover:bg-primary-element-light-hover">
                  {label} <X size={16} />
                  <span className="sr-only">Remove filter</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {result.items.length === 0 ? (
          <Empty icon={<Search />} title="Nothing on the shelf" body="Try a broader search, or clear a filter or two." action={<Link className="btn btn-primary" href={basePath}>Clear everything</Link>} />
        ) : (
          <ProductGrid items={result.items} />
        )}
        {pages > 1 && (
          <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-1">
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={href({ page: n === 1 ? null : String(n) })}
                aria-current={n === result.page ? "page" : undefined}
                className={`price flex h-[34px] min-w-[34px] items-center justify-center rounded-element px-2 text-[14px] ${n === result.page ? "bg-primary-element text-primary-element-text" : "hover:bg-background-hover"}`}
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
