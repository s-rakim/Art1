"use client";
import Link from "next/link";
import { Bars, ErrorLine, PageTitle, Stat } from "@/components/dash";
import { StatusTag } from "@/components/status-tag";
import { api } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useLiveReload } from "@/lib/live";

export default function SellerOverview() {
  const me = useApi((t) => api.sellerMe(t));
  const stats = useApi((t) => api.sellerStats(t));
  const orders = useApi((t) => api.sellerOrders(t));
  const inv = useApi((t) => api.sellerInventory(t));
  useLiveReload(["order", "job"], () => (orders.reload(), stats.reload()), 60000);
  useLiveReload(["stock"], inv.reload, 0);
  const s = stats.data;
  const store = me.data?.store;
  const low = inv.data?.items.filter((r) => r.low_stock) ?? [];
  // Waiting on the vendor: money to confirm, or paid and not yet handed to a rider.
  const todo = orders.data?.items.filter((o) => (o.status === "pending" || o.status === "processing") && !o.delivery) ?? [];

  return (
    <>
      <PageTitle
        kicker={store ? `${store.name}${me.data?.plan ? ` · ${me.data.plan.name} plan` : ""}` : "Your stall"}
        title="Overview"
        action={store && <Link href={`/s/${store.slug}`} className="btn btn-secondary btn-sm">View storefront</Link>}
      />
      {store?.status === "pending" && (
        <p className="mb-6 border-l-4 border-element-warning bg-main-background p-4 text-[14px]">Your stall is waiting for approval. You can set up products now; they go live once we approve the store.</p>
      )}
      <ErrorLine error={stats.error} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales, 30 days" value={s ? money(s.sales_cents_30d) : "…"} note={s ? `${s.units_30d.toLocaleString("en-US")} items sold` : undefined} />
        <Stat label="Orders, 30 days" value={s ? s.orders_30d.toLocaleString("en-US") : "…"} note={s ? `Average ${money(s.average_order_cents)}` : undefined} />
        <Stat label="To ship" value={s ? String(s.to_ship) : "…"} tone={s && s.to_ship > 0 ? "signal" : undefined} note={s ? `${s.active_products} products live` : undefined} />
        <Stat label="Available to pay out" value={s ? money(s.balance.available_cents) : "…"} tone="market" note={s ? `${money(s.balance.pending_cents)} still on hold` : undefined} />
      </div>

      {s && s.daily.length > 0 && (
        <div className="rounded-element mt-6 border border-border-dark bg-main-background p-5">
          <p className="label mb-4">Daily sales</p>
          <Bars data={s.daily.map((d) => ({ label: shortDate(d.date).replace(/, \d{4}$/, ""), values: [d.sales_cents] }))} format={(n) => money(n)} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between"><p className="label">Needs you ({todo.length})</p><Link href="/seller/orders" className="link-u text-[13px]">All orders</Link></div>
          <ul className="rounded-element divide-y divide-border border border-border-dark bg-main-background">
            {todo.slice(0, 6).map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-4 py-3 text-[14px]">
                <span className="tabular-nums">{o.number}</span>
                {o.paid ? <StatusTag status="paid" /> : <StatusTag status="unpaid" />}
                <span className="text-[12px] text-maxcontrast">{o.paid ? "ready to dispatch" : "confirm payment"}</span>
                <span className="ml-auto price">{money(o.total_cents, o.currency)}</span>
              </li>
            ))}
            {todo.length === 0 && <li className="px-4 py-6 text-[14px] text-maxcontrast">Nothing waiting. Nice.</li>}
          </ul>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between"><p className="label">Running low ({low.length})</p><Link href="/seller/inventory" className="link-u text-[13px]">Inventory</Link></div>
          <ul className="rounded-element divide-y divide-border border border-border-dark bg-main-background">
            {low.slice(0, 6).map((r) => (
              <li key={r.variant_id} className="flex items-center gap-3 px-4 py-3 text-[14px]">
                <span className="min-w-0 flex-1 truncate">{r.product_title} <span className="text-maxcontrast">· {r.label}</span></span>
                <span className={`price ${r.stock === 0 ? "text-text-error" : ""}`}>{r.stock} left</span>
              </li>
            ))}
            {low.length === 0 && <li className="px-4 py-6 text-[14px] text-maxcontrast">Stock levels look healthy.</li>}
          </ul>
        </div>
      </div>

      {s && s.top_products.length > 0 && (
        <div className="mt-6">
          <p className="label mb-2">Best sellers, 30 days</p>
          <ol className="rounded-element divide-y divide-border border border-border-dark bg-main-background">
            {s.top_products.slice(0, 5).map((p, i) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3 text-[14px]">
                <span className="w-5 tabular-nums text-maxcontrast">{i + 1}</span>
                <Link href={`/p/${p.slug}`} className="min-w-0 flex-1 truncate hover:underline">{p.title}</Link>
                <span className="tabular-nums text-[12px] text-maxcontrast">{p.units} sold</span>
                <span className="price w-24 text-right">{money(p.sales_cents)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}
