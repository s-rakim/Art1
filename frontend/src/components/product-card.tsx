import Link from "next/link";
import { compact } from "@/lib/format";
import type { ProductCard as P } from "@/lib/types";
import { safeColor } from "@/lib/safe";
import { ProductImage } from "./product-art";
import { Price, Stars } from "./ui";
import { WishButton } from "./wish-button";
import { discount } from "@/lib/format";

export function ProductCard({ p, sponsored = false }: { p: P; sponsored?: boolean }) {
  const off = discount(p.price_cents, p.compare_at_cents);
  return (
    <article className="group relative flex flex-col">
      <div className="relative aspect-[4/5] overflow-hidden bg-paper-2">
        <Link href={`/p/${p.slug}`} tabIndex={-1} aria-hidden className="block h-full">
          <ProductImage src={p.image_url} art={p.art} alt={p.title} className="transition-transform duration-500 group-hover:scale-[1.03]" />
        </Link>
        <div className="pointer-events-none absolute top-2 left-0 flex flex-col items-start gap-1">
          {off > 0 && <span className="ticket">−{off}%</span>}
          {p.badges?.includes("New") && <span className="ticket ticket-ink">NEW</span>}
          {p.badges?.includes("Bestseller") && <span className="ticket ticket-tag">BESTSELLER</span>}
        </div>
        <div className="absolute top-2 right-2">
          <WishButton id={p.id} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 pt-2.5">
        <Link href={`/s/${p.store.slug}`} className="label w-fit truncate hover:text-ink">
          {p.store.name}
          {p.store.verified && <span className="ml-1 text-market" title="Verified store">✓</span>}
        </Link>
        <h3 className="line-clamp-2 text-[14px] leading-snug">
          <Link href={`/p/${p.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:underline">
            {p.title}
          </Link>
        </h3>
        <div className="mt-auto flex flex-col gap-1 pt-1">
          <Price cents={p.price_cents} compare={p.compare_at_cents} currency={p.currency} />
          <div className="flex items-center gap-2 text-[12px] text-ink-3">
            <Stars value={p.rating} size={11} />
            <span>{compact(p.sold_count)} sold</span>
          </div>
          {p.colors && p.colors.length > 1 && (
            <div className="flex gap-1 pt-0.5" aria-label={`${p.colors.length} colours`}>
              {p.colors.slice(0, 5).map((c) => (
                <span key={c} className="h-3 w-3 border border-ink/20" style={{ background: safeColor(c) }} />
              ))}
            </div>
          )}
          {sponsored && <span className="label !text-[10px]">Sponsored</span>}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ items, dense = false }: { items: P[]; dense?: boolean }) {
  return (
    <div className={dense ? "grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" : "grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 xl:grid-cols-4"}>
      {items.map((p) => (
        <ProductCard key={p.id} p={p} />
      ))}
    </div>
  );
}
