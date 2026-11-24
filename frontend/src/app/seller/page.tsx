"use client";
import Link from "next/link";
import { Bars, ErrorLine, PageTitle, Stat } from "@/components/dash";
import { StatusTag } from "@/components/status-tag";
import { api } from "@/lib/api";
import { money, pct, shortDate } from "@/lib/format";
import { useApi } from "@/lib/use-api";

export default function SellerOverview() {
  const me = useApi((t) => api.sellerMe(t));
  const stats = useApi((t) => api.sellerStats(t));
  const orders = useApi((t) => api.sellerOrders(t));
  const inv = useApi((t) => api.sellerInventory(t));
  const s = stats.data;
  const low = inv.data?.items.filter((r) => r.low_stock) ?? [];
  const todo = orders.data?.items.filter((o) => ["pending", "paid", "packed"].includes(o.status)) ?? [];

  return (
    <>
      <PageTitle kicker={me.data ? `${me.data.name} · ${me.data.plan} plan` : "Your stall"} title="Overview" action={me.data && <Link href={`/s/${me.data.slug}`} className="btn btn-line btn-sm">View storefront</Link>} />
      <ErrorLine error={stats.error} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales, 30 days" value={s ? money(s.revenue_30d_cents) : "…"} />
        <Stat label="Orders, 30 days" value={s ? s.orders_30d.toLocaleString("en-US") : "…"} />
        <Stat label="Conversion" value={s ? pct(s.conversion_rate, 1) : "…"} note={s ? `${s.visitors_30d.toLocaleString("en-US")} visitors` : undefined} />
        <Stat label="Next payout" value={s ? money(s.pending_payout_cents) : "…"} tone="market" />
      </div>

      {s && (
        <div className="mt-6 border border-ink bg-card p-5">
          <p className="label mb-4">Daily sales</p>
          <Bars data={s.daily.map((d) => ({ label: shortDate(d.date).replace(/, \d{4}$/, ""), values: [d.revenue_cents] }))} format={(n) => money(n)} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between"><p className="label">Needs you ({todo.length})</p><Link href="/seller/orders" className="link-u text-[13px]">All orders</Link></div>
          <ul className="divide-y divide-rule border border-ink bg-card">
            {todo.slice(0, 6).map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-4 py-3 text-[14px]">
                <span className="font-mono">{o.number}</span>
                <StatusTag status={o.status} />
                <span className="ml-auto price">{money(o.total_cents)}</span>
              </li>
            ))}
            {todo.length === 0 && <li className="px-4 py-6 text-[14px] text-ink-3">Nothing waiting. Nice.</li>}
          </ul>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between"><p className="label">Running low ({low.length})</p><Link href="/seller/inventory" className="link-u text-[13px]">Inventory</Link></div>
          <ul className="divide-y divide-rule border border-ink bg-card">
            {low.slice(0, 6).map((r) => (
              <li key={r.variant_id} className="flex items-center gap-3 px-4 py-3 text-[14px]">
                <span className="min-w-0 flex-1 truncate">{r.product_title} <span className="text-ink-3">· {r.label}</span></span>
                <span className={`price ${r.stock === 0 ? "text-signal" : ""}`}>{r.stock} left</span>
              </li>
            ))}
            {low.length === 0 && <li className="px-4 py-6 text-[14px] text-ink-3">Stock levels look healthy.</li>}
          </ul>
        </div>
      </div>
    </>
  );
}
