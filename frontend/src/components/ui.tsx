import Link from "next/link";
import { discount, money } from "@/lib/format";
import { cx } from "@/lib/format";
import { Star } from "./icons";

export function Stars({ value, size = 13, count }: { value: number; size?: number; count?: number }) {
  const full = Math.round(value * 2) / 2;
  return (
    <span className="inline-flex items-center gap-1" title={`${value.toFixed(1)} out of 5`}>
      <span className="inline-flex text-ink" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} size={size} filled={i <= full} className={i <= full ? "" : "text-ink-3"} />
        ))}
      </span>
      <span className="sr-only">{value.toFixed(1)} out of 5 stars</span>
      {count !== undefined && <span className="text-[12px] text-ink-3">({count.toLocaleString("en-US")})</span>}
    </span>
  );
}

export function Price({
  cents, compare, currency, size = "md",
}: { cents: number; compare?: number | null; currency?: string; size?: "sm" | "md" | "lg" }) {
  const off = discount(cents, compare);
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className={cx("price", off ? "text-signal" : "text-ink", size === "lg" ? "text-[28px]" : size === "sm" ? "text-[14px]" : "text-[16px]")}>
        {money(cents, currency)}
      </span>
      {off > 0 && (
        <>
          <s className="font-mono text-[12px] text-ink-3">{money(compare!, currency)}</s>
          {size === "lg" && <span className="ticket">−{off}%</span>}
        </>
      )}
    </span>
  );
}

export function SectionHead({ kicker, title, href, linkLabel = "See all" }: { kicker?: string; title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 border-b border-ink pb-2">
      <div>
        {kicker && <p className="label mb-1">{kicker}</p>}
        <h2 className="display text-[32px] md:text-[40px]">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="link-u shrink-0 pb-1 text-[13px] font-semibold">{linkLabel}</Link>
      )}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center border border-dashed border-rule px-6 py-16 text-center">
      <p className="display text-[28px]">{title}</p>
      {body && <p className="mt-2 max-w-md text-ink-2">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function DemoNotice({ what = "sample data" }: { what?: string }) {
  return (
    <div className="mb-6 flex items-start gap-3 border border-tag bg-tag/15 px-4 py-3 text-[13px]">
      <span className="ticket ticket-tag shrink-0">DEMO</span>
      <p>
        You&apos;re looking at {what}. Sign-in isn&apos;t configured yet, so nothing here is saved. Add the Supabase
        keys to the frontend environment to switch this on.
      </p>
    </div>
  );
}

export function Breadcrumbs({ items }: { items: Array<[string, string?]> }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-[12px] text-ink-3">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map(([label, href], i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {href ? <Link href={href} className="hover:text-ink hover:underline">{label}</Link> : <span className="text-ink-2" aria-current="page">{label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
