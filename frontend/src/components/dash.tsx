"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type NavItem = { href: string; label: string; icon: ReactNode };

export function DashShell({ title, tone, nav, children, aside }: { title: string; tone: "ink" | "market" | "signal"; nav: NavItem[]; children: ReactNode; aside?: ReactNode }) {
  const path = usePathname();
  const bg = tone === "ink" ? "bg-ink text-paper" : tone === "market" ? "bg-market text-paper" : "bg-signal text-white";
  return (
    <div className="mx-auto grid max-w-[1400px] gap-0 px-0 md:grid-cols-[220px_1fr] md:px-4 md:py-6">
      <aside className={`${bg} md:sticky md:top-36 md:self-start`}>
        <p className="display hidden px-5 pt-5 pb-3 text-[28px] md:block">{title}</p>
        <nav aria-label={`${title} sections`} className="no-scrollbar flex overflow-x-auto md:block md:pb-4">
          {nav.map((n) => {
            const on = n.href === path || (n.href !== nav[0].href && path.startsWith(n.href));
            return (
              <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={`flex shrink-0 items-center gap-3 px-5 py-3 text-[14px] font-medium md:py-2.5 ${on ? "bg-paper text-ink" : "hover:bg-white/10"}`}>
                {n.icon}
                {n.label}
              </Link>
            );
          })}
        </nav>
        {aside && <div className="hidden px-5 pb-5 md:block">{aside}</div>}
      </aside>
      <section className="min-w-0 px-4 py-6 md:py-0 md:pl-8">{children}</section>
    </div>
  );
}

export function PageTitle({ kicker, title, action }: { kicker?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-3">
      <div>
        {kicker && <p className="label mb-1">{kicker}</p>}
        <h1 className="display text-[40px] md:text-[52px]">{title}</h1>
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "signal" | "market" }) {
  return (
    <div className="border border-ink bg-card p-4">
      <p className="label">{label}</p>
      <p className={`price mt-1 text-[26px] ${tone === "signal" ? "text-signal" : tone === "market" ? "text-market" : ""}`}>{value}</p>
      {note && <p className="mt-0.5 text-[12px] text-ink-3">{note}</p>}
    </div>
  );
}

/** Plain bar chart, no library. Values in whatever unit; format controls the tooltip/label. */
export function Bars({ data, format, stacked }: { data: Array<{ label: string; values: number[] }>; format: (n: number) => string; stacked?: string[] }) {
  const colors = ["#16130f", "#d23a1f", "#1e4d3b", "#e8b931", "#8a7f6c"];
  const max = Math.max(1, ...data.map((d) => d.values.reduce((a, b) => a + b, 0)));
  return (
    <div>
      <div className="flex h-48 items-end gap-[3px] border-b border-ink" role="img" aria-label="Bar chart">
        {data.map((d) => {
          const total = d.values.reduce((a, b) => a + b, 0);
          return (
            <div key={d.label} className="group relative flex h-full flex-1 flex-col-reverse" title={`${d.label}: ${format(total)}`}>
              {d.values.map((v, i) => (
                <div key={i} style={{ height: `${(v / max) * 100}%`, background: colors[i % colors.length] }} className="w-full opacity-90 group-hover:opacity-100" />
              ))}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-3">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
      {stacked && (
        <ul className="mt-3 flex flex-wrap gap-4 text-[12px]">
          {stacked.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5" style={{ background: colors[i % colors.length] }} />{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto border border-ink">
      <table className="w-full min-w-[640px] text-left text-[14px]">
        <thead className="bg-paper-2">
          <tr>{head.map((h) => <th key={h} className="label border-b border-ink px-3 py-2 font-normal">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-rule bg-card">{children}</tbody>
      </table>
    </div>
  );
}

export function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <p role="alert" className="mb-4 border-l-2 border-signal pl-3 text-[13px] text-signal">{error}</p>;
}
