"use client";
import Link from "next/link";
import { useState } from "react";
import { ErrorLine } from "@/components/dash";
import { Bike, Cash, Chart, Clock, Dashboard, List, Receipt, Store, Truck, Users, Wallet } from "@/components/icons";
import {
  ActivityTable, Badge, ExportButton, GlassStage, Lanes, LineChart, Meter, Metric, MixRing, Panel, PeriodSwitch, StackChart,
  saveCsv, useHashView, type BadgeState, type DashView,
} from "@/components/ui/glass-dashboard";
import { api } from "@/lib/api";
import { dayLabel, money, moneyShort, whenShort } from "@/lib/format";
import { useLiveReload } from "@/lib/live";
import { useApi } from "@/lib/use-api";

const PERIODS = [["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["365d", "A year"]] as const;
type Period = (typeof PERIODS)[number][0];

const VIEWS: DashView<"income" | "trends" | "board">[] = [
  { id: "income", label: "Income", icon: <Dashboard size={18} />, description: "What the market earns, and what's waiting on you." },
  { id: "trends", label: "Trends", icon: <Chart size={18} />, description: "Income by source across the period." },
  { id: "board", label: "To do", icon: <List size={18} />, description: "Applications to review and parcels on the move, live." },
];

const SOURCES = [
  { key: "rent_cents", label: "Stall rent", tone: 1 },
  { key: "commission_cents", label: "Commission", tone: 2 },
  { key: "fee_cents", label: "Item fees", tone: 3 },
  { key: "placement_cents", label: "Rented space", tone: 4 },
  { key: "delivery_fee_cents", label: "Delivery fees", tone: 5 },
] as const;

const ON_ROAD = new Set(["assigned", "accepted", "picked_up", "arrived"]);

function orderState(status: string): BadgeState {
  if (status === "delivered" || status === "completed") return "good";
  if (status === "canceled" || status === "refunded" || status === "failed") return "alert";
  if (status === "pending" || status === "awaiting_payment") return "wait";
  return "plain";
}
const words = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export default function AdminHome() {
  const [view, setView] = useHashView(VIEWS.map((v) => v.id), "income");
  const [period, setPeriod] = useState<Period>("30d");
  const income = useApi((t) => api.adminIncome(t, period), [period]);
  const stats = useApi((t) => api.adminStats(t));
  const riders = useApi((t) => api.adminRiderApplications(t));
  const stores = useApi((t) => api.adminStores(t));
  const orders = useApi((t) => api.adminOrders(t));
  const road = useApi((t) => api.adminLive(t));
  useLiveReload(["application"], () => (riders.reload(), stores.reload()), 60000);
  const live = useLiveReload(["order", "job"], () => (stats.reload(), orders.reload(), road.reload(), income.reload()), 30000);

  const i = income.data;
  const s = stats.data;
  const label = PERIODS.find(([p]) => p === period)![1].toLowerCase();
  // A year of daily columns is unreadable, so it's grouped by week.
  const daily = i?.daily ?? [];
  const rows = (daily.length > 90
    ? Array.from({ length: Math.ceil(daily.length / 7) }, (_, w) => daily.slice(w * 7, w * 7 + 7))
    : daily.map((d) => [d])
  ).map((group) => ({ label: dayLabel(group[0].date), values: SOURCES.map((src) => group.reduce((a, d) => a + d[src.key], 0)) }));
  const deliveries = road.data?.deliveries ?? [];
  const waiting = deliveries.filter((d) => d.status === "awaiting_rider");
  const moving = deliveries.filter((d) => ON_ROAD.has(d.status));
  const onShift = road.data?.riders ?? [];
  const pendingStores = (stores.data?.items ?? []).filter((x) => x.status === "pending");

  function exportIncome() {
    if (!i) return;
    saveCsv(`bazaar-income-${period}.csv`, [
      ["Date", ...SOURCES.map((x) => x.label), "Total"],
      ...daily.map((d) => [d.date.slice(0, 10), ...SOURCES.map((x) => (d[x.key] / 100).toFixed(2)), (SOURCES.reduce((a, x) => a + d[x.key], 0) / 100).toFixed(2)]),
    ]);
  }

  return (
    <GlassStage
      kicker="Admin console"
      title="Income"
      live={live}
      pollSeconds={30}
      views={VIEWS}
      view={view}
      onView={setView}
      actions={
        <>
          {view !== "board" && <PeriodSwitch value={period} options={PERIODS} onChange={setPeriod} />}
          {view !== "board" && <ExportButton onClick={exportIncome} disabled={!i} />}
        </>
      }
    >
      <ErrorLine error={income.error ?? stats.error ?? road.error} />

      {view === "income" && (
        <>
          <div className="gd-thirds">
            <Panel title="Net income" subtitle={`Last ${label}`} i={0}>
              <p className="gd-hero">{i ? money(i.total_cents) : "…"}</p>
              <p className="mt-2 text-[13px] text-maxcontrast">{i ? `After ${money(i.rider_cost_cents)} paid to riders` : " "}</p>
              <div className="gd-streams">
                {[["Rent", i?.rent_cents], ["Commission", i?.commission_cents], ["Delivery", i?.delivery_fee_cents]].map(([k, v]) => (
                  <div key={k as string}><span>{k}</span><strong>{v == null ? "…" : moneyShort(v as number)}</strong></div>
                ))}
              </div>
            </Panel>
            <div className="gd-metrics">
              <Metric i={1} tone="accent" label="Sales through the market" icon={<Cash size={16} />} value={s?.gmv_cents_30d ?? null} format={moneyShort} note="last 30 days" />
              <Metric i={2} label="Orders" icon={<Receipt size={16} />} value={s?.orders_30d ?? null} format={(n) => Math.round(n).toLocaleString("en-US")} note="last 30 days" />
              <Metric i={3} label="Stalls open" icon={<Store size={16} />} value={s?.active_stores ?? null} format={(n) => String(Math.round(n))} note={s ? `${moneyShort(s.rent_mrr_cents)} rent a month` : undefined} href="/admin/stores" />
              <Metric i={4} label="Shoppers" icon={<Users size={16} />} value={s?.customers ?? null} format={(n) => Math.round(n).toLocaleString("en-US")} />
            </div>
            <div className="grid content-start gap-3">
              <Panel title="Riders on shift" subtitle="Busy versus free right now" i={5}>
                <Meter label="Riders on a job" value={onShift.filter((r) => r.busy).length} max={onShift.length}
                  note={<><span><b className="text-main-text">{onShift.filter((r) => r.busy).length}</b> on a job</span><span>{onShift.length} on shift</span></>} />
              </Panel>
              <Panel title="Waiting on you" i={6}>
                <ul className="grid gap-1 text-[14px]">
                  <WaitRow href="/admin/stores" label="Stall applications" n={s?.pending_stores ?? pendingStores.length} />
                  <WaitRow href="/admin/riders" label="Rider applications" n={riders.data?.total ?? 0} />
                  <WaitRow href="/admin/riders" label="Payouts requested" n={s?.payouts_requested_cents ?? 0} money />
                </ul>
              </Panel>
            </div>
          </div>
          <Panel title={`${daily.length > 90 ? "Weekly" : "Daily"} income by source`} subtitle={`Last ${label}`} i={7}>
            {rows.length ? <StackChart title="Income by source" rows={rows} series={SOURCES.map((x) => ({ label: x.label, tone: x.tone }))} format={money} /> : <p className="gd-empty">No income in this period yet.</p>}
          </Panel>
          <Panel title="Recent orders" subtitle="Updates live as shoppers pay and parcels move" i={8}>
            <ActivityTable
              rows={orders.data?.items ?? []}
              rowKey={(o) => o.id}
              search={(o) => `${o.number} ${o.customer_email ?? ""} ${o.status}`}
              filterBy={(o) => words(o.status)}
              searchLabel="Search orders"
              empty="No orders yet."
              columns={[
                { label: "Order", cell: (o) => <span className="font-semibold tabular-nums">{o.number}</span> },
                { label: "Customer", cell: (o) => o.customer_email ?? "Guest" },
                { label: "Stores", cell: (o) => o.stores, className: "num" },
                { label: "Total", cell: (o) => money(o.total_cents, o.currency), className: "num" },
                { label: "Status", cell: (o) => <Badge state={orderState(o.status)}>{words(o.status)}</Badge> },
                { label: "Placed", cell: (o) => whenShort(o.created_at), className: "num" },
              ]}
            />
          </Panel>
        </>
      )}

      {view === "trends" && (
        <>
          <div className="gd-metrics">
            <Metric i={0} tone="accent" label="Net income" icon={<Wallet size={16} />} value={i?.total_cents ?? null} format={moneyShort} note={`last ${label}`} />
            {SOURCES.slice(0, 2).concat(SOURCES[4]).map((x, k) => (
              <Metric key={x.key} i={k + 1} label={x.label} icon={<Cash size={16} />} value={i ? i[x.key] : null} format={moneyShort} note={i && i.total_cents > 0 ? `${Math.round((i[x.key] / Math.max(1, SOURCES.reduce((a, y) => a + i[y.key], 0))) * 100)}% of income` : undefined} />
            ))}
          </div>
          <div className="gd-split">
            <Panel title="Stall income against delivery fees" subtitle="Rent, commission, item fees and rented space, next to what deliveries bring in" i={4}>
              {rows.length > 1 ? (
                <LineChart
                  title="Stall income and delivery fees by day"
                  labels={rows.map((r) => r.label)}
                  series={[
                    { label: "Stall income", tone: 1, values: rows.map((r) => r.values.slice(0, 4).reduce((a, b) => a + b, 0)) },
                    { label: "Delivery fees", tone: 5, values: rows.map((r) => r.values[4]) },
                  ]}
                  format={money}
                  axisFormat={moneyShort}
                />
              ) : <p className="gd-empty">Not enough days to draw a line yet.</p>}
            </Panel>
            <Panel title="Where it comes from" i={5}>
              <MixRing totalLabel="Income" format={moneyShort} items={SOURCES.map((x) => ({ label: x.label, tone: x.tone, value: i ? i[x.key] : 0 }))} />
            </Panel>
          </div>
        </>
      )}

      {view === "board" && (
        <>
          <div className="gd-metrics">
            <Metric i={0} tone="accent" label="On the road" icon={<Truck size={16} />} value={moving.length} format={(n) => String(Math.round(n))} note="deliveries" href="/admin/deliveries" />
            <Metric i={1} tone={waiting.length ? "attention" : undefined} label="Waiting for a rider" icon={<Clock size={16} />} value={waiting.length} format={(n) => String(Math.round(n))} note="on automatic dispatch" />
            <Metric i={2} label="Riders on shift" icon={<Bike size={16} />} value={onShift.length} format={(n) => String(Math.round(n))} note={`${onShift.filter((r) => !r.busy).length} free`} />
            <Metric i={3} tone={pendingStores.length ? "attention" : undefined} label="Applications" icon={<Users size={16} />} value={pendingStores.length + (riders.data?.total ?? 0)} format={(n) => String(Math.round(n))} note="stalls and riders" />
          </div>
          <Panel title="The board" subtitle="Click a card to deal with it" i={4}>
            <Lanes
              lanes={[
                { id: "stalls", title: "Stall applications", icon: <Store size={14} />, tone: 1, empty: "None waiting.",
                  items: pendingStores.map((x) => ({ id: x.id, title: x.name, detail: x.owner_email ?? undefined, meta: <><span>/s/{x.slug}</span><span>{whenShort(x.created_at)}</span></>, href: "/admin/stores" })) },
                { id: "riders", title: "Rider applications", icon: <Bike size={14} />, tone: 3, empty: "None waiting.",
                  items: (riders.data?.items ?? []).map((r) => ({ id: r.id, title: r.full_name, detail: `${r.vehicle.replace(/_/g, " ")} · ${r.city}`, meta: <span>{whenShort(r.applied_at)}</span>, href: "/admin/riders" })) },
                { id: "waiting", title: "Waiting for a rider", icon: <Clock size={14} />, tone: 2, empty: "Every parcel has a rider.",
                  items: waiting.map((d) => ({ id: d.id, title: d.order_number, detail: d.store_name, meta: <span>{whenShort(d.created_at)}</span>, href: "/admin/deliveries" })) },
                { id: "road", title: "On the road", icon: <Truck size={14} />, tone: 4, empty: "Nothing moving.",
                  items: moving.map((d) => ({ id: d.id, title: d.order_number, detail: `${d.store_name}${d.rider ? ` · ${d.rider.name}` : ""}`, meta: <><span>{words(d.status)}</span>{d.eta_minutes != null && <span>ETA {d.eta_minutes} min</span>}</>, href: "/admin/deliveries" })) },
              ]}
            />
          </Panel>
        </>
      )}
    </GlassStage>
  );
}

function WaitRow({ href, label, n, money: isMoney = false }: { href: string; label: string; n: number; money?: boolean }) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-3 rounded-element px-2 py-1.5 hover:bg-background-hover">
        <span>{label}</span>
        <span className={`tabular-nums font-semibold ${n ? "text-primary-element" : "text-maxcontrast"}`}>{isMoney ? money(n) : n}</span>
      </Link>
    </li>
  );
}
