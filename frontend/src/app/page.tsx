import Link from "next/link";
import { Countdown } from "@/components/countdown";
import { ProductArt } from "@/components/product-art";
import { ProductCard, ProductGrid } from "@/components/product-card";
import { RecentlyViewed } from "@/components/recently-viewed";
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
    <>
      {/* Hero */}
      <section className="border-b border-ink">
        <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-10 md:grid-cols-[1.1fr_1fr] md:py-16">
          <div className="flex flex-col justify-between gap-8">
            <div>
              <p className="label mb-4">Est. 2026 · {stores.total} shops open today</p>
              <h1 className="display text-[64px] sm:text-[88px] lg:text-[120px]">
                Every stall<br />has an<br /><span className="text-signal">owner.</span>
              </h1>
              <p className="mt-6 max-w-md text-[17px] text-ink-2">
                {STORE_NAME} is a covered market for the internet. Independent shops rent a stall, set their own prices and ship
                their own orders. You check out once.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/deals" className="btn btn-signal">Shop today&apos;s deals</Link>
              <Link href="/stores" className="btn btn-line">Walk the aisles</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 grid-rows-3 gap-2 self-end" aria-label="Featured stores">
            {active.slice(0, 4).map((s, i) => (
              <Link
                key={s.id}
                href={`/s/${s.slug}`}
                className={`group relative flex flex-col justify-between overflow-hidden p-4 ${i === 0 ? "row-span-3 min-h-[380px]" : "min-h-[120px]"}`}
                style={{ background: safeColor(s.banner_color), color: safeColor(s.accent_color, "#f4f0e6") }}
              >
                <span className="font-mono text-[11px] uppercase tracking-wider opacity-80">Stall {String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className={`display ${i === 0 ? "text-[44px] md:text-[56px]" : "text-[26px]"} group-hover:underline`}>{s.name}</p>
                  <p className="mt-1 text-[13px] opacity-85">{s.tagline}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Departments */}
      <section className="mx-auto max-w-[1400px] px-4 pt-10">
        <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-8 md:px-0">
          {roots.map((c) => (
            <li key={c.id} className="w-28 shrink-0 md:w-auto">
              <Link href={`/c/${c.slug}`} className="group block">
                <div className="aspect-square overflow-hidden border border-transparent group-hover:border-ink">
                  <ProductArt art={catArt[c.slug]} label={c.name} className="h-full w-full" />
                </div>
                <p className="mt-2 text-center text-[13px] font-semibold group-hover:underline">{c.name}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Deals */}
      <section className="mx-auto mt-14 max-w-[1400px] px-4">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-2">
          <div>
            <p className="label mb-1 !text-signal">Ends at midnight UTC</p>
            <h2 className="display text-[32px] md:text-[40px]">Today&apos;s deals</h2>
          </div>
          <div className="flex items-center gap-4 pb-1">
            <Countdown />
            <Link href="/deals" className="link-u text-[13px] font-semibold">See all</Link>
          </div>
        </div>
        <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2">
          {deals.items.map((p) => (
            <div key={p.id} className="w-[44%] shrink-0 snap-start sm:w-[30%] md:w-[22%] lg:w-[15.5%]">
              <ProductCard p={p} />
            </div>
          ))}
        </div>
      </section>

      {/* Rented shelves */}
      {shelves.map(({ store: s, headline, items }) => (
        <section key={s.id} className="mx-auto mt-14 max-w-[1400px] px-4">
          <div className="grid overflow-hidden border border-ink md:grid-cols-[280px_1fr]">
            <Link
              href={`/s/${s.slug}`}
              className="flex flex-col justify-between gap-6 p-6"
              style={{ background: safeColor(s.banner_color), color: safeColor(s.accent_color, "#f4f0e6") }}
            >
              <span className="font-mono text-[11px] uppercase tracking-wider opacity-80">Shelf rented by</span>
              <div>
                <p className="display text-[40px]">{s.name}</p>
                <p className="mt-2 text-[14px] opacity-90">{headline ?? s.tagline}</p>
                <p className="mt-4 font-mono text-[12px] opacity-80">
                  ★ {s.rating.toFixed(1)} · {s.follower_count != null ? `${compact(s.follower_count)} followers` : `${s.product_count} items`} · {s.country}
                </p>
              </div>
              <span className="text-[13px] font-semibold underline underline-offset-4">Visit the store →</span>
            </Link>
            <div className="grid grid-cols-2 gap-4 bg-card p-4 lg:grid-cols-4">
              {items.map((p) => <ProductCard key={p.id} p={p} sponsored />)}
            </div>
          </div>
        </section>
      ))}

      {/* New in */}
      <section className="mx-auto mt-16 max-w-[1400px] px-4">
        <SectionHead kicker="Dropped this fortnight" title="New in" href="/search?sort=newest" />
        <ProductGrid items={fresh.items} dense />
      </section>

      {/* Wholesale band */}
      <section className="mt-16 bg-market text-paper">
        <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-12 md:grid-cols-2 md:items-center">
          <div>
            <p className="label !text-paper/60 mb-3">For shops, offices and resellers</p>
            <h2 className="display text-[48px] md:text-[64px]">Buy by the case.</h2>
            <p className="mt-4 max-w-md text-paper/80">
              Stores marked with bulk pricing drop the unit price as your quantity goes up. Order straight from the listing or ask the
              supplier for a quote on custom runs.
            </p>
            <Link href="/wholesale" className="btn mt-6 bg-paper text-ink hover:bg-tag">Browse wholesale</Link>
          </div>
          <table className="w-full border border-paper/30 font-mono text-[14px]">
            <caption className="label !text-paper/60 mb-2 text-left">Example: insulated bottle, 750ml</caption>
            <thead>
              <tr className="border-b border-paper/30 text-left text-paper/60">
                <th className="p-3 font-normal">Quantity</th><th className="p-3 font-normal">Per unit</th><th className="p-3 font-normal">You save</th>
              </tr>
            </thead>
            <tbody>
              {[[1, 1599, 0], [10, 1407, 12], [50, 1215, 24], [200, 1023, 36]].map(([q, c, s]) => (
                <tr key={q} className="border-b border-paper/15 last:border-0">
                  <td className="p-3">{q}+</td><td className="p-3">{money(c)}</td><td className="p-3 text-tag">{s ? `${s}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Stores */}
      <section className="mx-auto mt-16 max-w-[1400px] px-4">
        <SectionHead kicker="Who's selling" title="Shops in the market" href="/stores" />
        <ul className="grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
          {active.map((s) => (
            <li key={s.id} className="bg-paper">
              <Link href={`/s/${s.slug}`} className="flex h-full items-start gap-4 p-5 hover:bg-card">
                <span className="display flex h-12 w-12 shrink-0 items-center justify-center text-[22px]" style={{ background: safeColor(s.banner_color), color: safeColor(s.accent_color, "#f4f0e6") }}>
                  {s.name.slice(0, 1)}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="truncate">{s.name}</span>
                    {s.verified && <span className="ticket ticket-market !text-[9px]">VERIFIED</span>}
                  </span>
                  <span className="block truncate text-[13px] text-ink-2">{s.tagline}</span>
                  <span className="mt-1 block font-mono text-[11px] text-ink-3">★ {s.rating.toFixed(1)} · {s.product_count} items · {s.country}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Sell CTA */}
      <section className="mx-auto mt-16 max-w-[1400px] px-4">
        <div className="grid gap-6 border-2 border-ink bg-tag p-8 md:grid-cols-[1fr_auto] md:items-center md:p-12">
          <div>
            <h2 className="display text-[44px] md:text-[60px]">Got something to sell?</h2>
            <p className="mt-3 max-w-xl text-[16px]">
              Rent a stall from {money(1900)} a month. You get a storefront, your own customers, and payouts as often as daily.
              Lower commission as you grow.
            </p>
          </div>
          <Link href="/sell" className="btn btn-ink h-12 px-8 text-[15px]">See plans and fees</Link>
        </div>
      </section>

      <RecentlyViewed titles={titles} />
    </>
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
