import Link from "next/link";
import { Countdown } from "@/components/countdown";
import { ProductArt } from "@/components/product-art";
import { ProductCard, ProductGrid } from "@/components/product-card";
import { RecentlyViewed } from "@/components/recently-viewed";
import { CheckCircle, Chevron } from "@/components/icons";
import { SectionHead } from "@/components/ui";
import { api } from "@/lib/api";
import { STORE_NAME } from "@/lib/config";
import { compact, money } from "@/lib/format";
import { safeColor } from "@/lib/safe";
import type { ArtShape, ProductCard as Card, Store } from "@/lib/types";

const catArt: Record<string, { shape: ArtShape; bg: string; fg: string }> = {
  women: { shape: "dress", bg: "#e5ddd0", fg: "#b4532a" },
  men: { shape: "jacket", bg: "#dcd6c7", fg: "#25324a" },
  shoes: { shape: "sneaker", bg: "#e9e3d6", fg: "#d23a1f" },
  bags: { shape: "bag", bg: "#e8dfd2", fg: "#4a2c1d" },
  home: { shape: "chair", bg: "#dfe1dc", fg: "#5b3b26" },
  kitchen: { shape: "mug", bg: "#e9e3d6", fg: "#5f8a8b" },
  electronics: { shape: "headphones", bg: "#d8ddd4", fg: "#2b2e33" },
  beauty: { shape: "bottle", bg: "#dfe7df", fg: "#2f5d50" },
};

export default async function Home() {
  const [deals, fresh, stores, categories, best] = await Promise.all([
    api.products({ on_sale: true, sort: "popular", page_size: 12 }),
    api.products({ sort: "newest", page_size: 10 }),
    api.stores(),
    api.categories(),
    api.products({ sort: "popular", page_size: 60 }),
  ]);
  const roots = categories.filter((c) => !c.parent_id);
  const active = stores.items.slice(0, 8);
  const shelves = await rentedShelves(active);
  const titles = Object.fromEntries(best.items.map((p) => [p.slug, p.title]));

  return (
    <div className="px-4 py-5 md:px-6">
      {/* Greeting, in the spirit of Nextcloud's dashboard */}
      <section className="flex flex-col gap-4 pt-2 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="label">{stores.total} shops open today</p>
          <h1 className="heading mt-0.5 text-[26px]">Every stall has an owner</h1>
          <p className="mt-1 max-w-xl text-maxcontrast">
            {STORE_NAME} is a covered market for the internet. Independent shops rent a stall, set their own prices and ship
            their own orders. You check out once.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/deals" className="btn btn-primary">Shop today&apos;s deals</Link>
          <Link href="/stores" className="btn">Browse stores</Link>
        </div>
      </section>

      {/* Featured stores */}
      <section aria-label="Featured stores" className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4">
        {active.slice(0, 4).map((s) => (
          <Link
            key={s.id}
            href={`/s/${s.slug}`}
            className="group flex min-h-[120px] w-[80%] shrink-0 snap-start flex-col justify-between rounded-container p-4 transition-transform hover:-translate-y-0.5 sm:min-h-[148px] sm:w-auto"
            style={{ background: safeColor(s.banner_color), color: safeColor(s.accent_color, "#ffffff") }}
          >
            <span className="text-[13px] font-medium opacity-85">Featured store</span>
            <div>
              <p className="text-[18px] font-semibold group-hover:underline">{s.name}</p>
              <p className="mt-0.5 line-clamp-2 text-[14px] opacity-90">{s.tagline}</p>
            </div>
          </Link>
        ))}
      </section>

      {/* Departments */}
      <section className="mt-8">
        <SectionHead title="Departments" />
        <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-4 md:px-0 xl:grid-cols-8">
          {roots.map((c) => (
            <li key={c.id} className="w-28 shrink-0 md:w-auto">
              <Link href={`/c/${c.slug}`} className="group block rounded-container p-1.5 hover:bg-background-hover">
                <div className="aspect-square overflow-hidden rounded-element">
                  <ProductArt art={catArt[c.slug]} label={c.name} className="h-full w-full" />
                </div>
                <p className="mt-1.5 truncate text-center text-[14px] font-medium">{c.name}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Deals */}
      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label">Ends at midnight UTC</p>
            <h2 className="heading text-[20px]">Today&apos;s deals</h2>
          </div>
          <div className="flex items-center gap-2">
            <Countdown />
            <Link href="/deals" className="btn btn-tertiary btn-sm">See all<Chevron size={18} /></Link>
          </div>
        </div>
        <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          {deals.items.map((p) => (
            <div key={p.id} className="w-[44%] shrink-0 snap-start sm:w-[30%] md:w-[23%] xl:w-[15.6%]">
              <ProductCard p={p} />
            </div>
          ))}
        </div>
      </section>

      {/* Rented shelves */}
      {shelves.map(({ store: s, headline, items }) => (
        <section key={s.id} className="mt-10 overflow-hidden rounded-large border border-border-dark">
          <div className="grid md:grid-cols-[260px_1fr]">
            <Link
              href={`/s/${s.slug}`}
              className="flex flex-col justify-between gap-6 p-5"
              style={{ background: safeColor(s.banner_color), color: safeColor(s.accent_color, "#ffffff") }}
            >
              <span className="text-[13px] font-medium opacity-85">Shelf rented by</span>
              <div>
                <p className="text-[20px] font-semibold">{s.name}</p>
                <p className="mt-1 text-[14px] opacity-90">{headline ?? s.tagline}</p>
                <p className="mt-3 text-[13px] opacity-85">
                  ★ {s.rating.toFixed(1)} · {s.follower_count != null ? `${compact(s.follower_count)} followers` : `${s.product_count} items`} · {s.country}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-[14px] font-semibold">Visit the store <Chevron size={18} /></span>
            </Link>
            <div className="grid grid-cols-2 gap-3 p-3 lg:grid-cols-4">
              {items.map((p) => <ProductCard key={p.id} p={p} sponsored />)}
            </div>
          </div>
        </section>
      ))}

      {/* New in */}
      <section className="mt-10">
        <SectionHead kicker="Dropped this fortnight" title="New in" href="/search?sort=newest" />
        <ProductGrid items={fresh.items} dense />
      </section>

      {/* Wholesale */}
      <section className="panel mt-10 grid gap-6 p-5 md:grid-cols-2 md:items-center md:p-7">
        <div>
          <p className="label">For shops, offices and resellers</p>
          <h2 className="heading text-[20px]">Buy by the case</h2>
          <p className="mt-1 max-w-md text-maxcontrast">
            Stores marked with bulk pricing drop the unit price as your quantity goes up. Order straight from the listing or ask the
            supplier for a quote on custom runs.
          </p>
          <Link href="/wholesale" className="btn btn-primary mt-4">Browse wholesale</Link>
        </div>
        <div className="card overflow-hidden">
          <table className="w-full text-[15px]">
            <caption className="label px-3 pt-3 pb-1 text-left">Example: insulated bottle, 750ml</caption>
            <thead>
              <tr className="border-b border-border text-left">
                <th className="label px-3 py-2 font-normal">Quantity</th><th className="label px-3 py-2 font-normal">Per unit</th><th className="label px-3 py-2 font-normal">You save</th>
              </tr>
            </thead>
            <tbody className="price">
              {[[1, 1599, 0], [10, 1407, 12], [50, 1215, 24], [200, 1023, 36]].map(([q, c, s]) => (
                <tr key={q} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{q}+</td><td className="px-3 py-2">{money(c)}</td><td className="px-3 py-2 text-text-success">{s ? `${s}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Stores */}
      <section className="mt-10">
        <SectionHead kicker="Who's selling" title="Shops in the market" href="/stores" />
        <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-4">
          {active.map((s) => (
            <li key={s.id}>
              <Link href={`/s/${s.slug}`} className="flex h-full items-center gap-3 rounded-element p-2 hover:bg-background-hover">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[18px] font-semibold" style={{ background: safeColor(s.banner_color), color: safeColor(s.accent_color, "#ffffff") }}>
                  {s.name.slice(0, 1)}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <span className="truncate">{s.name}</span>
                    {s.verified && <CheckCircle size={16} className="shrink-0 text-element-success" aria-label="Verified store" />}
                  </span>
                  <span className="block truncate text-[14px] text-maxcontrast">★ {s.rating.toFixed(1)} · {s.product_count} items · {s.country}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Sell */}
      <section className="mt-10 flex flex-col gap-4 rounded-large bg-primary-element-light p-5 text-primary-element-light-text md:flex-row md:items-center md:justify-between md:p-7">
        <div>
          <h2 className="heading text-[20px]">Got something to sell?</h2>
          <p className="mt-1 max-w-xl">
            Rent a stall from {money(1900)} a month. You get a storefront, your own customers, and payouts as often as daily.
            Lower commission as you grow.
          </p>
        </div>
        <Link href="/sell" className="btn btn-primary btn-lg shrink-0">See plans and fees</Link>
      </section>

      <RecentlyViewed titles={titles} />
    </div>
  );
}

/**
 * Homepage shelves are space that vendors rent by the day (slot "home_shelf").
 * Live bookings come from the API. With no bookings yet (or in demo mode) we fall back to
 * the first two stores on a paid plan so the layout still shows what a shelf looks like.
 */
async function rentedShelves(active: Store[]): Promise<Array<{ store: Store; headline: string | null; items: Card[] }>> {
  const booked = (await api.placements().catch(() => [])).filter((b) => b.slot_code === "home_shelf");
  if (booked.length) {
    const bySlug = new Map<string, { headline: string | null; items: Card[] }>();
    for (const b of booked) {
      const entry = bySlug.get(b.store.slug) ?? { headline: b.headline, items: [] };
      if (b.product && !entry.items.some((x) => x.id === b.product!.id)) entry.items.push(b.product);
      bySlug.set(b.store.slug, entry);
    }
    const picked = [...bySlug.entries()].slice(0, 2);
    const out = await Promise.all(
      picked.map(async ([slug, entry]) => {
        const store = active.find((s) => s.slug === slug) ?? (await api.store(slug).catch(() => null));
        if (!store) return null;
        // A booking can feature one product; fill the rest of the shelf with the store's best sellers.
        if (entry.items.length < 4) {
          const more = await api.products({ store: slug, page_size: 4, sort: "popular" }).catch(() => ({ items: [] as Card[] }));
          for (const p of more.items) if (entry.items.length < 4 && !entry.items.some((x) => x.id === p.id)) entry.items.push(p);
        }
        return { store, headline: entry.headline, items: entry.items.slice(0, 4) };
      }),
    );
    return out.filter((x): x is NonNullable<typeof x> => x !== null);
  }
  const fallback = active.filter((s) => s.plan && s.plan !== "stall").slice(0, 2);
  const products = await Promise.all(fallback.map((s) => api.products({ store: s.slug, page_size: 4, sort: "popular" })));
  return fallback.map((store, i) => ({ store, headline: null, items: products[i].items }));
}
