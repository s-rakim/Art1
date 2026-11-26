import Link from "next/link";
import { Greeting } from "@/components/greeting";
import { HomeRail } from "@/components/home-rail";
import { Archive, CheckCircle, Fire, Megaphone, Shop, Sparkle, Store, Tag } from "@/components/icons";
import { Avatar, ProductItem, Widget } from "@/components/widget";
import { api } from "@/lib/api";
import { STORE_NAME } from "@/lib/config";
import { compact } from "@/lib/format";
import type { ProductCard as Card, Store as StoreT } from "@/lib/types";

export default async function Home() {
  const [deals, fresh, stores, categories, women, men] = await Promise.all([
    api.products({ on_sale: true, sort: "popular", page_size: 6 }),
    api.products({ sort: "newest", page_size: 6 }),
    api.stores(),
    api.categories(),
    api.products({ category: "women", sort: "newest", page_size: 12 }).catch(() => null),
    api.products({ category: "men", sort: "newest", page_size: 12 }).catch(() => null),
  ]);
  // Clothing for the rail, alternating women's and men's pieces, shoes left out.
  const notShoe = (p: Card) => p.art?.shape !== "sneaker" && !/shoe|sneaker|trainer|boot|sandal/i.test(`${p.title} ${p.category_slug}`);
  const lists = [women, men].map((r) => (r?.items ?? []).filter(notShoe));
  const clothes = Array.from({ length: Math.max(0, ...lists.map((l) => l.length)) }, (_, i) => lists.map((l) => l[i]))
    .flat()
    .filter((p): p is Card => !!p);
  const roots = categories.filter((c) => !c.parent_id);
  const active = stores.items.slice(0, 8);
  const shelves = await rentedShelves(active);

  return (
    <div className="px-2 pb-6">
      <h1 className="px-2 pt-10 pb-6 text-center text-[32px] leading-[1.3] font-semibold text-background-plain-text [text-shadow:0_1px_3px_rgb(0_0_0/0.25)] sm:pt-14 sm:pb-8">
        <Greeting fallback={`Welcome to ${STORE_NAME}`} />
      </h1>

      <HomeRail products={clothes} />

      <div className="mx-auto flex max-w-[1800px] flex-wrap items-stretch justify-center gap-4 py-2 sm:gap-8">
        <Widget title="Today's deals" icon={<Fire size={26} />} more={{ href: "/deals", label: "More deals" }}>
          {deals.items.slice(0, 5).map((p) => <ProductItem key={p.id} p={p} />)}
        </Widget>

        <Widget title="New in" icon={<Sparkle size={26} />} more={{ href: "/search?sort=newest", label: "Everything new" }}>
          {fresh.items.slice(0, 5).map((p) => <ProductItem key={p.id} p={p} />)}
        </Widget>

        <Widget title="Shops" icon={<Store size={26} />} more={{ href: "/stores", label: "All stores" }}>
          {active.slice(0, 5).map((s) => (
            <Link key={s.id} href={`/s/${s.slug}`} className="widget-item">
              <Avatar name={s.name} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 font-semibold">
                  <span className="truncate">{s.name}</span>
                  {s.verified && <CheckCircle size={16} className="shrink-0 text-primary-element" aria-label="Verified store" />}
                </span>
                <span className="block truncate text-[14px] text-maxcontrast">{s.tagline}</span>
              </span>
            </Link>
          ))}
        </Widget>

        <Widget title="Departments" icon={<Tag size={26} />}>
          <ul className="grid grid-cols-2 gap-1 pb-2">
            {roots.map((c) => (
              <li key={c.id}>
                <Link href={`/c/${c.slug}`} className="widget-item min-h-[48px] gap-2 px-2">
                  <span className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-primary-element text-primary-element-text">
                    <Tag size={16} />
                  </span>
                  <span className="truncate text-[14px] font-medium">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Widget>

        {shelves.map(({ store: s, headline, items }) => (
          <Widget key={s.id} title={s.name} icon={<Megaphone size={26} />} more={{ href: `/s/${s.slug}`, label: "Visit the store" }}>
            <p className="px-2 pb-1 text-[14px] text-maxcontrast">
              <span className="chip mr-1">Sponsored</span>
              {headline ?? s.tagline}
            </p>
            {items.slice(0, 4).map((p) => <ProductItem key={p.id} p={p} note={p.review_count ? `★ ${p.rating.toFixed(1)} · ${compact(p.sold_count)} sold` : undefined} />)}
          </Widget>
        ))}

        <Widget title="Buy by the case" icon={<Archive size={26} />} more={{ href: "/wholesale", label: "Browse wholesale" }}>
          <div className="space-y-3 px-2 text-[15px]">
            <p>Many shops here drop the unit price as your quantity goes up. The tiers are on each product page, set by the shop.</p>
            <ul className="space-y-2 text-[14px]">
              {["Price breaks by quantity", "Minimum order shown up front", "One checkout across shops"].map((t) => (
                <li key={t} className="flex items-center gap-2"><CheckCircle size={18} className="shrink-0 text-primary-element" />{t}</li>
              ))}
            </ul>
          </div>
        </Widget>

        <Widget title="Sell here" icon={<Shop size={26} />} more={{ href: "/sell", label: "How renting a stall works" }}>
          <div className="space-y-3 px-2 text-[15px]">
            <p>Rent a stall and get your own storefront, your own customers, and payouts as often as daily. The market team will talk you through the rates.</p>
            <ul className="space-y-2 text-[14px]">
              {["Your own store page and address", "Market riders or your own courier", "Lower commission as you grow"].map((t) => (
                <li key={t} className="flex items-center gap-2"><CheckCircle size={18} className="shrink-0 text-primary-element" />{t}</li>
              ))}
            </ul>
          </div>
        </Widget>
      </div>
    </div>
  );
}

/**
 * Homepage shelves are space that vendors rent by the day (slot "home_shelf").
 * Live bookings come from the API. With no bookings yet (or in demo mode) we fall back to
 * the first two stores on a paid plan so the layout still shows what a shelf looks like.
 */
async function rentedShelves(active: StoreT[]): Promise<Array<{ store: StoreT; headline: string | null; items: Card[] }>> {
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
