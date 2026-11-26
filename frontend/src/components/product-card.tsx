import Link from "next/link";
import { compact } from "@/lib/format";
import type { ProductCard as P } from "@/lib/types";
import { safeColor } from "@/lib/safe";
import { ProductImage } from "./product-image";
import { Price, Stars } from "./ui";
import { CheckCircle } from "./icons";
import { WishButton } from "./wish-button";
import { discount } from "@/lib/format";

export function ProductCard({ p, sponsored = false }: { p: P; sponsored?: boolean }) {
  const off = discount(p.price_cents, p.compare_at_cents);
  return (
    <article className="group relative flex flex-col rounded-container p-1.5 transition-colors hover:bg-background-hover">
      <div className="relative aspect-[4/5] overflow-hidden rounded-element bg-background-dark">
        <Link href={`/p/${p.slug}`} tabIndex={-1} aria-hidden className="block h-full">
          <ProductImage src={p.image_url} art={p.art} alt={p.title} className="transition-transform duration-300 group-hover:scale-[1.02]" />
        </Link>
        <div className="pointer-events-none absolute top-2 left-2 flex flex-col items-start gap-1">
          {off > 0 && <span className="chip chip-primary">−{off}%</span>}
          {p.badges?.includes("New") && <span className="chip chip-secondary">New</span>}
          {p.badges?.includes("Bestseller") && <span className="chip chip-secondary">Bestseller</span>}
        </div>
        <div className="absolute top-2 right-2">
          <WishButton id={p.id} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 px-0.5 pt-2 pb-0.5">
        <Link href={`/s/${p.store.slug}`} className="relative z-10 flex w-fit max-w-full items-center gap-1 truncate text-[13px] text-maxcontrast hover:text-main-text hover:underline">
          {p.store.name}
          {p.store.verified && <CheckCircle size={14} className="shrink-0 text-primary-element" aria-label="Verified store" />}
        </Link>
        <h3 className="line-clamp-2 text-[15px] leading-snug font-medium">
          <Link href={`/p/${p.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {p.title}
          </Link>
        </h3>
        <div className="mt-auto flex flex-col gap-1 pt-1">
          <Price cents={p.price_cents} compare={p.compare_at_cents} currency={p.currency} />
          <div className="flex items-center gap-2 text-[13px] text-maxcontrast">
            <Stars value={p.rating} size={11} />
            <span>{compact(p.sold_count)} sold</span>
          </div>
          {p.colors && p.colors.length > 1 && (
            <div className="flex gap-1 pt-0.5" aria-label={`${p.colors.length} colours`}>
              {p.colors.slice(0, 5).map((c) => (
                <span key={c} className="h-3.5 w-3.5 rounded-full border border-border-dark" style={{ background: safeColor(c) }} />
              ))}
            </div>
          )}
          {sponsored && <span className="text-[12px] text-maxcontrast">Sponsored</span>}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ items, dense = false }: { items: P[]; dense?: boolean }) {
  return (
    <div className={dense ? "grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" : "grid grid-cols-2 gap-x-2 gap-y-4 md:grid-cols-3 xl:grid-cols-4"}>
      {items.map((p) => (
        <ProductCard key={p.id} p={p} />
      ))}
    </div>
  );
}
