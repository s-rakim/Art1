import Link from "next/link";
import type { ReactNode } from "react";
import { money } from "@/lib/format";
import type { ProductCard } from "@/lib/types";
import { CheckCircle } from "./icons";
import { ProductImage } from "./product-art";

/** NcDashboardWidget: a see-through white panel on the wallpaper, a bold title and a short list. */
export function Widget({ title, icon, more, children }: { title: string; icon: ReactNode; more?: { href: string; label: string }; children: ReactNode }) {
  return (
    <section aria-label={title} className="widget glass flex flex-col">
      <h2 className="widget-head">
        {icon}
        <span className="truncate">{title}</span>
      </h2>
      <div className="flex-1 px-2">{children}</div>
      {more && (
        <div className="p-4 pt-2">
          <Link href={more.href} className="btn btn-wide">{more.label}</Link>
        </div>
      )}
    </section>
  );
}

/** One product as a dashboard item: thumbnail, name, store, price. */
export function ProductItem({ p, note }: { p: ProductCard; note?: string }) {
  const off = p.compare_at_cents && p.compare_at_cents > p.price_cents ? Math.round((1 - p.price_cents / p.compare_at_cents) * 100) : 0;
  return (
    <Link href={`/p/${p.slug}`} className="widget-item">
      <span className="h-[44px] w-[44px] shrink-0 overflow-hidden rounded-element">
        <ProductImage src={p.image_url} art={p.art} alt="" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{p.title}</span>
        <span className="flex items-center gap-1 truncate text-[14px] text-maxcontrast">
          {note ?? p.store.name}
          {!note && p.store.verified && <CheckCircle size={14} className="shrink-0 text-primary-element" aria-label="Verified store" />}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="price block text-[15px]">{money(p.price_cents, p.currency)}</span>
        {off > 0 && <span className="chip chip-secondary">−{off}%</span>}
      </span>
    </Link>
  );
}

/** A round avatar with an initial, the way Nextcloud shows users without a picture. */
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-primary-element font-semibold text-primary-element-text"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
