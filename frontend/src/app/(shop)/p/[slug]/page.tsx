import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyBox } from "@/components/buy-box";
import { CheckCircle, Message, Return, Shield, Truck } from "@/components/icons";
import { ProductImage } from "@/components/product-art";
import { ProductCard } from "@/components/product-card";
import { TrackView } from "@/components/recently-viewed";
import { Breadcrumbs, SectionHead, Stars } from "@/components/ui";
import { api } from "@/lib/api";
import { compact, pct, shortDate } from "@/lib/format";
import { safeColor, safeSlug } from "@/lib/safe";

type Params = Promise<{ slug: string }>;

async function load(raw: string) {
  const slug = safeSlug(raw);
  return slug ? api.product(slug) : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await load((await params).slug);
  if (!p) return { title: "Not found" };
  return { title: p.title, description: p.description.slice(0, 160) };
}

export default async function ProductPage({ params }: { params: Params }) {
  const product = await load((await params).slug);
  if (!product) notFound();

  const [reviews, store, more, similar, categories] = await Promise.all([
    api.reviews(product.slug),
    api.store(product.store.slug),
    api.products({ store: product.store.slug, page_size: 5, sort: "popular" }),
    api.products({ category: product.category_slug, page_size: 6, sort: "rating" }),
    api.categories(),
  ]);
  const cat = categories.find((c) => c.slug === product.category_slug);
  const breakdown = product.rating_breakdown;
  const totalRatings = breakdown ? Object.values(breakdown).reduce((a, b) => a + b, 0) : 0;
  const gallery = product.images.length ? product.images : [null, null, null];
  const delivery = product.delivery_days;

  return (
    <div className="px-4 py-5 md:px-6 pb-28 md:pb-6">
      <TrackView slug={product.slug} />
      <Breadcrumbs items={[["Home", "/"], ...(cat ? [[cat.name, `/c/${cat.slug}`] as [string, string]] : []), [product.title]]} />

      <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr]">
        {/* Gallery */}
        <div className="grid grid-cols-2 gap-2">
          {gallery.slice(0, 4).map((src, i) => (
            <div key={i} className={`overflow-hidden rounded-container bg-background-dark ${i === 0 ? "col-span-2 aspect-[5/4]" : "aspect-square"}`}>
              <ProductImage
                src={src}
                art={product.art && (i === 0 ? product.art : { ...product.art, bg: ["#e5ddd0", "#dcd6c7", "#d8ddd4"][i % 3], fg: product.colors?.[i % (product.colors.length || 1)] ?? product.art.fg })}
                alt={`${product.title}, view ${i + 1}`}
              />
            </div>
          ))}
        </div>

        {/* Buy column */}
        <div className="lg:sticky lg:top-[60px] lg:self-start">
          <Link href={`/s/${product.store.slug}`} className="inline-flex items-center gap-1.5 text-[14px] text-maxcontrast hover:text-main-text hover:underline">
            {product.store.name}
            {product.store.verified && <CheckCircle size={16} className="text-element-success" aria-label="Verified store" />}
          </Link>
          <h1 className="heading mt-1 text-[24px]">{product.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[14px]">
            <a href="#reviews" className="hover:underline"><Stars value={product.rating} count={product.review_count} /></a>
            <span className="text-maxcontrast">{compact(product.sold_count)} sold</span>
          </div>
          <div className="h-px bg-border my-5" />
          <BuyBox product={product} />

          <ul className="panel mt-6 divide-y divide-border px-3 text-[14px]">
            <li className="flex gap-3 py-3">
              <Truck size={20} className="shrink-0 text-maxcontrast" />
              <span>
                {delivery ? <>Arrives in <b>{delivery[0]}–{delivery[1]} days</b></> : "Ships soon"} from {product.ships_from ?? "the seller"}.
                Free over $50 from this store.
              </span>
            </li>
            <li className="flex gap-3 py-3"><Return size={20} className="shrink-0 text-maxcontrast" /><span>Free returns within 30 days of delivery.</span></li>
            <li className="flex gap-3 py-3"><Shield size={20} className="shrink-0 text-maxcontrast" /><span>Buyer protection: if it doesn&apos;t arrive or isn&apos;t as described, you get your money back.</span></li>
          </ul>

          {store && (
            <div className="card mt-4 overflow-hidden">
              <div className="flex items-center gap-3 p-4" style={{ background: safeColor(store.banner_color), color: safeColor(store.accent_color, "#ffffff") }}>
                <span className="text-[17px] font-semibold">{store.name}</span>
              </div>
              <dl className="flex divide-x divide-border bg-main-background text-center">
                {([
                  ["Rating", store.review_count === 0 ? "New" : store.rating.toFixed(1)],
                  ["Items", String(store.product_count)],
                  ["Replies", store.response_rate != null ? pct(store.response_rate) : null],
                  ["On time", store.on_time_rate != null ? pct(store.on_time_rate) : null],
                ] as Array<[string, string | null]>).filter(([, v]) => v !== null).slice(0, 3).map(([k, v]) => (
                  <div key={k} className="flex-1 p-3"><dt className="label">{k}</dt><dd className="price">{v}</dd></div>
                ))}
              </dl>
              <div className="flex gap-1 border-t border-border p-1">
                <Link href={`/s/${store.slug}`} className="btn btn-tertiary flex-1">Visit store</Link>
                <Link href={`/s/${store.slug}#contact`} className="btn btn-tertiary flex-1"><Message size={18} /> Ask a question</Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Details */}
      <section className="mt-12 grid gap-8 md:grid-cols-[1.25fr_1fr]">
        <div>
          <h2 className="heading mb-2 text-[20px]">About this item</h2>
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-maxcontrast">{product.description}</p>
        </div>
        {product.specs && (
          <div>
            <h2 className="heading mb-2 text-[20px]">Details</h2>
            <dl className="divide-y divide-border text-[15px]">
              {Object.entries(product.specs).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[140px_1fr] gap-4 py-2.5">
                  <dt className="text-maxcontrast">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </section>

      {/* Reviews */}
      <section id="reviews" className="mt-12 scroll-mt-16">
        <SectionHead title={`Reviews (${product.review_count.toLocaleString("en-US")})`} />
        <div className="grid gap-10 md:grid-cols-[280px_1fr]">
          <div>
            <p className="price text-[44px] leading-none">{product.rating.toFixed(1)}</p>
            <Stars value={product.rating} size={16} />
            {breakdown && (
              <ul className="mt-5 space-y-1.5 text-[13px]">
                {([5, 4, 3, 2, 1] as const).map((n) => {
                  const share = totalRatings ? breakdown[n] / totalRatings : 0;
                  return (
                    <li key={n} className="grid grid-cols-[24px_1fr_36px] items-center gap-2">
                      <span className="tabular-nums">{n}★</span>
                      <span className="h-2 overflow-hidden rounded-pill bg-background-dark"><span className="block h-full rounded-pill bg-favorite" style={{ width: `${share * 100}%` }} /></span>
                      <span className="text-right tabular-nums text-maxcontrast">{Math.round(share * 100)}%</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <ul className="divide-y divide-border">
            {reviews.items.map((r) => (
              <li key={r.id} className="py-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Stars value={r.rating} size={12} />
                  <p className="font-semibold">{r.title}</p>
                </div>
                <p className="mt-2 text-[14px] text-maxcontrast">{r.body}</p>
                <p className="mt-2 text-[13px] text-maxcontrast">
                  {r.author} · {shortDate(r.created_at)}
                  {r.verified_purchase && <span className="ml-2 text-text-success">Verified purchase</span>}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {more.items.filter((p) => p.id !== product.id).length > 0 && (
        <section className="mt-12">
          <SectionHead kicker="Same stall" title={`More from ${product.store.name}`} href={`/s/${product.store.slug}`} />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {more.items.filter((p) => p.id !== product.id).slice(0, 4).map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        </section>
      )}

      <section className="mt-12">
        <SectionHead kicker="Other stalls" title="Similar items" href={`/c/${product.category_slug}`} />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {similar.items.filter((p) => p.id !== product.id && p.store.slug !== product.store.slug).slice(0, 5).map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      </section>
    </div>
  );
}
