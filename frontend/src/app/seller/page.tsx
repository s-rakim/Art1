"use client";
import Link from "next/link";
import { useState } from "react";
import { ErrorLine } from "@/components/dash";
import { Box, Cash, Chart, Check, Clock, Dashboard, Receipt, Truck } from "@/components/icons";
import {
  ActivityTable, Badge, ExportButton, GlassStage, Lanes, LineChart, Metric, MixRing, Panel, PeriodSwitch,
  saveCsv, useHashView, type BadgeState, type DashView,
} from "@/components/ui/glass-dashboard";
import { api } from "@/lib/api";
import { dayLabel, money, moneyShort, whenShort } from "@/lib/format";
import { useLiveReload } from "@/lib/live";
import type { SellerOrder } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const VIEWS: DashView<"sales" | "dispatch" | "products">[] = [
  { id: "sales", label: "Sales", icon: <Dashboard size={18} />, description: "Money in, orders and what's owed to you." },
  { id: "dispatch", label: "Dispatch", short: "Dispatch", icon: <Truck size={18} />, description: "Every order from paid to delivered, live." },
  { id: "products", label: "Best sellers", short: "Products", icon: <Chart size={18} />, description: "What sells, and what's about to run out." },
];
const PERIODS = [["7", "7 days"], ["30", "30 days"]] as const;
const ROAD = new Set(["assigned", "accepted", "picked_up", "arrived"]);
const count = (n: number) => Math.round(n).toLocaleString("en-US");
const words = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function stage(o: SellerOrder): { lane: "ready" | "waiting" | "road" | "done" | "closed"; label: string; state: BadgeState } {
  if (o.status === "canceled" || o.status === "refunded") return { lane: "closed", label: words(o.status), state: "alert" };
  if (o.status === "delivered" || o.delivery?.status === "delivered") return { lane: "done", label: "Delivered", state: "good" };
  if (o.delivery && ROAD.has(o.delivery.status)) return { lane: "road", label: words(o.delivery.status), state: "plain" };
  if (o.delivery?.status === "awaiting_rider") return { lane: "waiting", label: "Waiting for a rider", state: "wait" };
  if (o.tracking_number) return { lane: "road", label: "With the courier", state: "plain" };
  return { lane: "ready", label: "Ready to send", state: "wait" };
}

export default function SellerOverview() {
  const [view, setView] = useHashView(VIEWS.map((v) => v.id), "sales");
  const [days, setDays] = useState<"7" | "30">("30");
  const me = useApi((t) => api.sellerMe(t));
  const stats = useApi((t) => api.sellerStats(t));
  const orders = useApi((t) => api.sellerOrders(t));
  const inv = useApi((t) => api.sellerInventory(t));
  const live = useLiveReload(["order", "job"], () => (orders.reload(), stats.reload()), 30000);
  useLiveReload(["stock"], inv.reload, 0);

  const s = stats.data;
  const store = me.data?.store;
  const all = orders.data?.items ?? [];
  const low = (inv.data?.items ?? []).filter((r) => r.low_stock);
  const daily = (s?.daily ?? []).slice(-Number(days));
  const lanes = { ready: [] as SellerOrder[], waiting: [] as SellerOrder[], road: [] as SellerOrder[], done: [] as SellerOrder[] };
  for (const o of all) {
    const st = stage(o).lane;
    if (st !== "closed") lanes[st].push(o);
  }

  function exportSales() {
    if (!s) return;
    saveCsv(`${store?.slug ?? "stall"}-daily-sales.csv`, [["Date", "Sales", "Orders"], ...s.daily.map((d) => [d.date.slice(0, 10), (d.sales_cents / 100).toFixed(2), d.orders])]);
  }
  function exportOrders() {
    saveCsv(`${store?.slug ?? "stall"}-orders.csv`, [
      ["Order", "Placed", "Items", "Total", "Your payout", "Paid", "Where it is"],
      ...all.map((o) => [o.number, o.created_at, o.items.reduce((a, it) => a + it.quantity, 0), (o.total_cents / 100).toFixed(2), (o.payout_cents / 100).toFixed(2), o.paid ? "Yes" : "No", stage(o).label]),
    ]);
  }

  const card = (o: SellerOrder) => ({
    id: o.id,
    title: o.number,
    detail: `${o.items.reduce((a, it) => a + it.quantity, 0)} items · ${money(o.total_cents, o.currency)}${o.delivery?.rider_name ? ` · ${o.delivery.rider_name}` : ""}`,
    meta: <><span>{o.paid ? "Paid" : "Pay on arrival"}</span><span>{whenShort(o.created_at)}</span></>,
    href: "/seller/orders",
  });

  return (
    <GlassStage
      kicker={store ? `${store.name}${me.data?.plan ? ` · ${me.data.plan.name} plan` : ""}` : "Your stall"}
      title="Overview"
      live={live}
      pollSeconds={30}
      views={VIEWS}
      view={view}
      onView={setView}
      actions={
        <>
          {view === "sales" && <PeriodSwitch value={days} options={PERIODS} onChange={setDays} />}
          {view === "dispatch" ? <ExportButton onClick={exportOrders} disabled={!all.length} label="Export orders" /> : <ExportButton onClick={exportSales} disabled={!s} />}
          {store && <Link href={`/s/${store.slug}`} className="gd-btn">View storefront</Link>}
        </>
      }
    >
      {store?.status === "pending" && (
        <p className="note note-warning text-[14px]"><Clock size={18} /><span>Your stall is waiting for approval. Set up your products now; they go live once the market team approves the store.</span></p>
      )}
      <ErrorLine error={stats.error ?? orders.error} />

      {view === "sales" && (
        <>
          <div className="gd-thirds">
            <Panel title="Owed to you" subtitle="Paid out by the market on its payout schedule" i={0}>
              <p className="gd-hero">{s ? money(s.balance.available_cents) : "…"}</p>
              <p className="mt-2 text-[13px] text-maxcontrast">{s ? `${money(s.balance.pending_cents)} still on hold until deliveries are confirmed` : " "}</p>
              <div className="gd-streams">
                <div><span>Sales, 30 days</span><strong>{s ? moneyShort(s.sales_cents_30d) : "…"}</strong></div>
                <div><span>Average order</span><strong>{s ? moneyShort(s.average_order_cents) : "…"}</strong></div>
              </div>
            </Panel>
            <div className="gd-metrics">
              <Metric i={1} tone="accent" label="Sales" icon={<Cash size={16} />} value={s?.sales_cents_30d ?? null} format={moneyShort} note="last 30 days" />
              <Metric i={2} label="Orders" icon={<Receipt size={16} />} value={s?.orders_30d ?? null} format={count} note={s ? `${count(s.units_30d)} items sold` : undefined} />
              <Metric i={3} tone={s?.to_ship ? "attention" : undefined} label="To send" icon={<Truck size={16} />} value={s?.to_ship ?? null} format={count} note="waiting to go out" href="/seller/orders" />
              <Metric i={4} label="Products live" icon={<Box size={16} />} value={s?.active_products ?? null} format={count} note={me.data?.product_limit ? `of ${me.data.product_limit} on your plan` : undefined} href="/seller/products" />
            </div>
            <Panel title="Running low" subtitle={`${low.length} variant${low.length === 1 ? "" : "s"} near the end`} action={<Link href="/seller/inventory" className="link text-[13px]">Inventory</Link>} i={5}>
              <ul className="grid gap-1 text-[14px]">
                {low.slice(0, 5).map((r) => (
                  <li key={r.variant_id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{r.product_title} <span className="text-maxcontrast">· {r.label}</span></span>
                    <span className={`tabular-nums font-semibold ${r.stock === 0 ? "text-text-error" : ""}`}>{r.stock} left</span>
                  </li>
                ))}
                {low.length === 0 && <li className="text-maxcontrast">Stock levels look healthy.</li>}
              </ul>
            </Panel>
          </div>
          <Panel title="Daily sales" subtitle={`Last ${days} days`} i={6}>
            {daily.length > 1 ? (
              <LineChart title="Sales by day" labels={daily.map((d) => dayLabel(d.date))} series={[{ label: "Sales", tone: 1, values: daily.map((d) => d.sales_cents) }]} format={money} axisFormat={moneyShort} />
            ) : <p className="gd-empty">Sales show up here from your first order.</p>}
          </Panel>
          <Panel title="Orders" subtitle="Newest first, updating live" i={7}>
            <OrdersTable orders={all} />
          </Panel>
        </>
      )}

      {view === "dispatch" && (
        <>
          <div className="gd-metrics">
            <Metric i={0} tone={lanes.ready.length ? "attention" : undefined} label="Ready to send" icon={<Box size={16} />} value={lanes.ready.length} format={count} note="choose a rider or courier" href="/seller/orders" />
            <Metric i={1} label="Waiting for a rider" icon={<Clock size={16} />} value={lanes.waiting.length} format={count} note="the first free rider takes it" />
            <Metric i={2} tone="accent" label="On the road" icon={<Truck size={16} />} value={lanes.road.length} format={count} note="with a rider or courier" href="/seller/deliveries" />
            <Metric i={3} label="Delivered" icon={<Check size={16} />} value={lanes.done.length} format={count} note="in your recent orders" />
          </div>
          <Panel title="From paid to delivered" subtitle="Open a card to dispatch it or see where it is" i={4}>
            <Lanes
              lanes={[
                { id: "ready", title: "Ready to send", icon: <Box size={14} />, tone: 2, items: lanes.ready.map(card), empty: "Nothing waiting on you." },
                { id: "waiting", title: "Waiting for a rider", icon: <Clock size={14} />, tone: 5, items: lanes.waiting.map(card), empty: "Every parcel has a rider." },
                { id: "road", title: "On the road", icon: <Truck size={14} />, tone: 1, items: lanes.road.map(card), empty: "Nothing moving." },
                { id: "done", title: "Delivered", icon: <Check size={14} />, tone: 4, items: lanes.done.slice(0, 12).map(card), empty: "No deliveries yet." },
              ]}
            />
          </Panel>
        </>
      )}

      {view === "products" && (
        <>
          <div className="gd-split">
            <Panel title="Top sellers, 30 days" subtitle="By sales" i={0}>
              {s && s.top_products.length ? (
                <ActivityTable
                  rows={s.top_products}
                  rowKey={(p) => p.id}
                  search={(p) => p.title}
                  searchLabel="Search products"
                  columns={[
                    { label: "Product", cell: (p) => <Link href={`/p/${p.slug}`} className="hover:underline">{p.title}</Link> },
                    { label: "Sold", cell: (p) => count(p.units), className: "num" },
                    { label: "Sales", cell: (p) => money(p.sales_cents), className: "num" },
                  ]}
                />
              ) : <p className="gd-empty">Your best sellers show up here once orders come in.</p>}
            </Panel>
            <Panel title="Share of sales" i={1}>
              <MixRing
                totalLabel="Top five"
                format={moneyShort}
                items={(s?.top_products ?? []).slice(0, 5).map((p, k) => ({ label: p.title, value: p.sales_cents, tone: ((k % 5) + 1) as 1 | 2 | 3 | 4 | 5 }))}
              />
            </Panel>
          </div>
          <Panel title="Stock" subtitle="Lowest first" action={<Link href="/seller/inventory" className="link text-[13px]">Edit stock</Link>} i={2}>
            <ActivityTable
              rows={[...(inv.data?.items ?? [])].sort((a, b) => a.stock - b.stock)}
              rowKey={(r) => r.variant_id}
              search={(r) => `${r.product_title} ${r.label} ${r.sku}`}
              filterBy={(r) => (r.stock === 0 ? "Sold out" : r.low_stock ? "Running low" : "In stock")}
              filterLabel="Stock"
              searchLabel="Search stock"
              empty="No products yet."
              columns={[
                { label: "Product", cell: (r) => r.product_title },
                { label: "Variant", cell: (r) => r.label },
                { label: "SKU", cell: (r) => r.sku },
                { label: "Left", cell: (r) => <Badge state={r.stock === 0 ? "alert" : r.low_stock ? "wait" : "good"}>{r.stock}</Badge>, className: "num" },
                { label: "Price", cell: (r) => money(r.price_cents), className: "num" },
              ]}
            />
          </Panel>
        </>
      )}
    </GlassStage>
  );
}

function OrdersTable({ orders }: { orders: SellerOrder[] }) {
  return (
    <ActivityTable
      rows={orders}
      rowKey={(o) => o.id}
      search={(o) => `${o.number} ${o.items.map((it) => it.title).join(" ")} ${o.ship_to.full_name ?? ""}`}
      filterBy={(o) => stage(o).label}
      filterLabel="Stage"
      searchLabel="Search orders"
      empty="No orders yet."
      columns={[
        { label: "Order", cell: (o) => <Link href="/seller/orders" className="font-semibold tabular-nums hover:underline">{o.number}</Link> },
        { label: "Items", cell: (o) => o.items.reduce((a, it) => a + it.quantity, 0), className: "num" },
        { label: "Total", cell: (o) => money(o.total_cents, o.currency), className: "num" },
        { label: "Your payout", cell: (o) => money(o.payout_cents, o.currency), className: "num" },
        { label: "Payment", cell: (o) => <Badge state={o.paid ? "good" : "wait"}>{o.paid ? "Paid" : "On arrival"}</Badge> },
        { label: "Where it is", cell: (o) => { const st = stage(o); return <Badge state={st.state}>{st.label}</Badge>; } },
        { label: "Placed", cell: (o) => whenShort(o.created_at), className: "num" },
      ]}
    />
  );
}
