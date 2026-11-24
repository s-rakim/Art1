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

const tabs: Array<[string, string]> = [["popular", "Bestsellers"], ["newest", "New"], ["price_asc", "Price ↑"], ["rating", "Top rated"]];

export default async function StorePage({ params, searchParams }: { params: Params; searchParams: Promise<SP> }) {
  const slug = safeSlug((await params).slug);
  const store = slug ? await api.store(slug) : null;
  if (!store || store.status !== "active") notFound();
  const sp = await searchParams;
  const query = parseQuery(sp, { store: store.slug, page_size: 48 });
  const sort = query.sort ?? "popular";
  const products = await api.products({ ...query, sort });
  const bg = safeColor(store.banner_color);
  const fg = safeColor(store.accent_color, "#ffffff");

  return (
    <>
      <div className="px-4 pt-4 md:px-6"><Breadcrumbs items={[["Home", "/"], ["Stores", "/stores"], [store.name]]} /></div>
      <section style={{ background: bg, color: fg }} className="mx-4 rounded-large md:mx-6">
        <div className="px-5 pt-6 pb-6 md:px-7">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-[14px] opacity-85">
                {store.verified ? "Verified store" : "Independent store"} · {store.country} · since {shortDate(store.joined_at)}
              </p>
              <h1 className="heading mt-1 text-[26px]">{store.name}</h1>
              <p className="mt-1 max-w-xl text-[16px] opacity-90">{store.tagline}</p>
            </div>
            <div className="flex gap-2">
              <a href="#contact" className="btn border-transparent bg-white/90 text-[#222222] hover:!bg-white"><Message size={18} /> Contact</a>
            </div>
          </div>
        </div>
      </section>

      <div className="px-4 md:px-6">
        <dl className="grid grid-cols-2 border-b border-border sm:grid-cols-5">
          {([
            ["Rating", store.review_count === 0 ? "New" : `★ ${store.rating.toFixed(1)}`],
            ["Followers", store.follower_count != null ? compact(store.follower_count) : null],
            ["Items", String(store.product_count)],
            ["Reply rate", store.response_rate != null ? pct(store.response_rate) : null],
            ["Ships on time", store.on_time_rate != null ? pct(store.on_time_rate) : null],
            ["Open since", String(new Date(store.joined_at).getUTCFullYear())],
          ] as Array<[string, string | null]>).filter(([, v]) => v !== null).slice(0, 5).map(([k, v]) => (
            <div key={k} className="py-3 pr-4">
              <dt className="label">{k}</dt>
              <dd className="price text-[18px]">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="px-4 py-5 md:px-6">
        <nav aria-label="Sort products" className="mb-4 flex flex-wrap gap-1">
          {tabs.map(([v, l]) => (
            <Link
              key={v}
              href={`/s/${store.slug}${v === "popular" ? "" : `?sort=${v}`}`}
              aria-current={sort === v ? "page" : undefined}
              className={`btn btn-sm ${sort === v ? "" : "btn-tertiary"}`}
            >
              {l}
            </Link>
          ))}
        </nav>
        <ProductGrid items={products.items} />

        <section id="contact" className="mt-12 grid scroll-mt-16 gap-6 border-t border-border pt-6 md:grid-cols-2">
          <div>
            <h2 className="heading text-[20px]">About the shop</h2>
            <p className="mt-1 whitespace-pre-line text-maxcontrast">{store.description}</p>
          </div>
          <div className="panel p-5">
            <h3 className="font-semibold">Questions about an order or a custom run?</h3>
            <p className="mt-1 text-[14px] text-maxcontrast">
              {store.response_rate != null ? `${store.name} replies to ${pct(store.response_rate)} of messages, usually within a day. ` : ""}
              Messages go through the marketplace so we can help if anything goes wrong.
            </p>
            <Link href={`/login?next=${encodeURIComponent(`/s/${store.slug}#contact`)}`} className="btn btn-primary mt-4">Sign in to message the seller</Link>
          </div>
        </section>
      </div>
    </>
  );
}
