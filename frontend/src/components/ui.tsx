import Link from "next/link";
import type { ReactNode } from "react";
import { cx, discount, money } from "@/lib/format";
import { Chevron, Info, Star } from "./icons";

export function Stars({ value, size = 14, count }: { value: number; size?: number; count?: number }) {
  const full = Math.round(value * 2) / 2;
  return (
    <span className="inline-flex items-center gap-1" title={`${value.toFixed(1)} out of 5`}>
      <span className="inline-flex text-favorite" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} size={size} filled={i <= full} className={i <= full ? "" : "text-border-maxcontrast"} />
        ))}
      </span>
      <span className="sr-only">{value.toFixed(1)} out of 5 stars</span>
      {count !== undefined && <span className="text-[13px] text-maxcontrast">({count.toLocaleString("en-US")})</span>}
    </span>
  );
}

export function Price({
  cents, compare, currency, size = "md",
}: { cents: number; compare?: number | null; currency?: string; size?: "sm" | "md" | "lg" }) {
  const off = discount(cents, compare);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <span className={cx("price", "text-main-text", size === "lg" ? "text-[26px]" : size === "sm" ? "text-[14px]" : "text-[16px]")}>
        {money(cents, currency)}
      </span>
      {off > 0 && (
        <>
          <s className="text-[13px] text-maxcontrast">{money(compare!, currency)}</s>
          {size === "lg" && <span className="chip chip-primary">−{off}%</span>}
        </>
      )}
    </span>
  );
}

export function SectionHead({ kicker, title, href, linkLabel = "See all" }: { kicker?: string; title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {kicker && <p className="label">{kicker}</p>}
        <h2 className="heading text-[20px]">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="btn btn-tertiary btn-sm shrink-0">{linkLabel}<Chevron size={18} /></Link>
      )}
    </div>
  );
}

/** NcEmptyContent: a faded icon, a title and a line of help. */
export function Empty({ title, body, action, icon }: { title: string; body?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {icon && <div className="mb-4 text-main-text opacity-40 [&>svg]:h-16 [&>svg]:w-16">{icon}</div>}
      <p className="heading text-[20px]">{title}</p>
      {body && <p className="mt-1 max-w-md text-maxcontrast">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function DemoNotice({ what = "sample data" }: { what?: string }) {
  return (
    <div className="note note-info mb-5 text-[14px]">
      <Info size={20} />
      <p>
        You&apos;re looking at {what}. Sign-in isn&apos;t configured yet, so nothing here is saved. Add the Supabase
        keys to the frontend environment to switch this on.
      </p>
    </div>
  );
}

export function Breadcrumbs({ items }: { items: Array<[string, string?]> }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-[14px] text-maxcontrast">
      <ol className="flex flex-wrap items-center gap-0.5">
        {items.map(([label, href], i) => (
          <li key={i} className="flex items-center gap-0.5">
            {i > 0 && <Chevron size={16} className="opacity-60" />}
            {href ? (
              <Link href={href} className="rounded-element px-1.5 py-1 hover:bg-background-hover hover:text-main-text">{label}</Link>
            ) : (
              <span className="px-1.5 py-1 font-semibold text-main-text" aria-current="page">{label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
