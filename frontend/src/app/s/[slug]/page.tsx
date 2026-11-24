import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Message } from "@/components/icons";
import { ProductGrid } from "@/components/product-card";
import { Breadcrumbs } from "@/components/ui";
import { api } from "@/lib/api";
import { compact, pct, shortDate } from "@/lib/format";
import { parseQuery, type SP } from "@/lib/query";
import { safeColor, safeSlug } from "@/lib/safe";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const slug = safeSlug((await params).slug);
  const s = slug ? await api.store(slug) : null;
  return { title: s ? s.name : "Store", description: s?.tagline };
}

const tabs: Array<[string, string]> = [["bestselling", "Bestsellers"], ["newest", "New"], ["price_asc", "Price ↑"], ["rating", "Top rated"]];

export default async function StorePage({ params, searchParams }: { params: Params; searchParams: Promise<SP> }) {
  const slug = safeSlug((await params).slug);
  const store = slug ? await api.store(slug) : null;
  if (!store || store.status !== "active") notFound();
  const sp = await searchParams;
  const query = parseQuery(sp, { store: store.slug, page_size: 48 });
  const sort = query.sort ?? "bestselling";
  const products = await api.products({ ...query, sort });
  const bg = safeColor(store.banner_color);
  const fg = safeColor(store.accent_color, "#f4f0e6");

  return (
    <>
      <section style={{ background: bg, color: fg }} className="border-b border-ink">
        <div className="mx-auto max-w-[1400px] px-4 pt-6 pb-10">
          <div className="opacity-80 [&_a]:!text-current [&_span]:!text-current"><Breadcrumbs items={[["Home", "/"], ["Stores", "/stores"], [store.name]]} /></div>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider opacity-80">
                {store.verified ? "Verified store" : "Independent store"} · {store.country} · since {shortDate(store.joined_at)}
              </p>
              <h1 className="display mt-2 text-[64px] md:text-[112px]">{store.name}</h1>
              <p className="mt-2 max-w-xl text-[17px] opacity-90">{store.tagline}</p>
            </div>
            <div className="flex gap-2">
              <a href="#contact" className="btn border border-current"><Message size={16} /> Contact</a>
            </div>
          </div>
        </div>
      </section>

      <div className="border-b border-rule bg-card">
        <dl className="mx-auto grid max-w-[1400px] grid-cols-2 divide-x divide-rule px-4 sm:grid-cols-5">
          {[
            ["Rating", `★ ${store.rating.toFixed(1)}`],
            ["Followers", compact(store.follower_count)],
            ["Items", String(store.product_count)],
            ["Reply rate", pct(store.response_rate)],
            ["Ships on time", pct(store.on_time_rate)],
          ].map(([k, v]) => (
            <div key={k} className="px-4 py-4 first:pl-0">
              <dt className="label">{k}</dt>
              <dd className="price mt-0.5 text-[18px]">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-8">
        <nav aria-label="Sort products" className="mb-6 flex gap-1 border-b border-ink">
          {tabs.map(([v, l]) => (
            <Link
              key={v}
              href={`/s/${store.slug}${v === "bestselling" ? "" : `?sort=${v}`}`}
              aria-current={sort === v ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-[14px] font-semibold ${sort === v ? "border-signal" : "border-transparent text-ink-3 hover:text-ink"}`}
            >
              {l}
            </Link>
          ))}
        </nav>
        <ProductGrid items={products.items} />

        <section id="contact" className="mt-16 grid scroll-mt-40 gap-8 border-t border-ink pt-8 md:grid-cols-2">
          <div>
            <h2 className="display text-[36px]">About the shop</h2>
            <p className="mt-3 whitespace-pre-line text-ink-2">{store.description}</p>
          </div>
          <div className="panel p-6">
            <h3 className="font-semibold">Questions about an order or a custom run?</h3>
            <p className="mt-1 text-[14px] text-ink-2">
              {store.name} replies to {pct(store.response_rate)} of messages, usually within a day. Messages go through {""}
              the marketplace so we can help if anything goes wrong.
            </p>
            <Link href={`/login?next=${encodeURIComponent(`/s/${store.slug}#contact`)}`} className="btn btn-ink mt-4">Sign in to message the seller</Link>
          </div>
        </section>
      </div>
    </>
  );
}
