"use client";
import { useState } from "react";
import { ErrorLine } from "@/components/dash";
import { Alert, Cash, CheckCircle, Store, Wallet } from "@/components/icons";
import {
  ActivityTable, Badge, ExportButton, GlassStage, LineChart, Metric, MixRing, Panel, PeriodSwitch, saveCsv, type BadgeState, type Tone,
} from "@/components/ui/glass-dashboard";
import { api } from "@/lib/api";
import { dayLabel, money, moneyShort, whenShort } from "@/lib/format";
import { useLiveReload } from "@/lib/live";
import type { Delivery } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const PERIODS = [["7", "7 days"], ["30", "30 days"], ["90", "90 days"]] as const;
const count = (n: number) => Math.round(n).toLocaleString("en-US");
const dayKey = (d: Date) => d.toLocaleDateString("en-CA");
const OUTCOME: Record<string, { label: string; state: BadgeState }> = {
  delivered: { label: "Delivered", state: "good" },
  failed: { label: "Couldn't deliver", state: "alert" },
  declined: { label: "Declined", state: "plain" },
  canceled: { label: "Canceled", state: "plain" },
};
const finishedAt = (d: Delivery) => d.delivered_at ?? d.created_at;

export default function RiderActivity() {
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const me = useApi((t) => api.riderMe(t));
  const history = useApi((t) => api.riderDeliveries(t, "history"));
  const earnings = useApi((t) => api.riderEarnings(t));
  const live = useLiveReload(["job"], () => (history.reload(), earnings.reload(), me.reload()), 60000);

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - Number(days) + 1);
  const inPeriod = (iso: string) => new Date(iso) >= since;

  const jobs = (history.data?.items ?? []).filter((d) => inPeriod(finishedAt(d)));
  const delivered = jobs.filter((d) => d.status === "delivered");
  const failed = jobs.filter((d) => d.status === "failed").length;
  const pay = (earnings.data?.items ?? []).filter((e) => inPeriod(e.created_at));
  const earned = pay.reduce((a, e) => a + e.amount_cents, 0);
  const paidOut = new Map((earnings.data?.items ?? []).map((e) => [e.delivery_id, e.paid_out]));

  // One point per day, oldest on the left, including days with nothing.
  const keys = Array.from({ length: Number(days) }, (_, i) => {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    return dayKey(d);
  });
  const perDay = new Map(keys.map((k) => [k, 0]));
  for (const e of pay) {
    const k = dayKey(new Date(e.created_at));
    if (perDay.has(k)) perDay.set(k, (perDay.get(k) ?? 0) + e.amount_cents);
  }

  const byShop = new Map<string, number>();
  for (const d of delivered) byShop.set(d.store_name, (byShop.get(d.store_name) ?? 0) + 1);
  const shops = [...byShop.entries()].sort((a, b) => b[1] - a[1]);
  const topShops: Array<{ label: string; value: number; tone: Tone }> = shops.slice(0, 4).map(([label, value], k) => ({ label, value, tone: (k + 1) as Tone }));
  if (shops.length > 4) topShops.push({ label: "Other shops", value: shops.slice(4).reduce((a, [, v]) => a + v, 0), tone: 5 });

  function exportJobs() {
    saveCsv(`deliveries-last-${days}-days.csv`, [
      ["Finished", "Order", "Shop", "Outcome", "Earned", "Collected from customer", "Paid out to you"],
      ...jobs.map((d) => [
        finishedAt(d), d.order_number, d.store_name, OUTCOME[d.status]?.label ?? d.status,
        ((d.earning_cents ?? 0) / 100).toFixed(2), ((d.amount_due_cents ?? 0) / 100).toFixed(2),
        paidOut.has(d.id) ? (paidOut.get(d.id) ? "Yes" : "Not yet") : "",
      ]),
    ]);
  }

  const r = me.data;
  return (
    <GlassStage
      kicker={r ? `${r.full_name} · ${r.vehicle.replace(/_/g, " ")}` : "Rider"}
      title="Your activity"
      description="Deliveries, earnings and payouts, updating as you ride."
      live={live}
      pollSeconds={60}
      actions={
        <>
          <PeriodSwitch value={days} options={PERIODS} onChange={setDays} />
          <ExportButton onClick={exportJobs} disabled={!jobs.length} />
        </>
      }
    >
      <ErrorLine error={me.error ?? history.error ?? earnings.error} />

      <div className="gd-metrics">
        <Metric i={0} tone="accent" label="Delivered" icon={<CheckCircle size={16} />} value={history.data ? delivered.length : null} format={count} note={`last ${days} days · ${r ? count(r.deliveries_completed) : "…"} in all`} />
        <Metric
          i={1}
          label="Earned"
          icon={<Cash size={16} />}
          value={earnings.data ? earned : null}
          format={moneyShort}
          note={delivered.length ? `${money(Math.round(earned / delivered.length))} a delivery` : `last ${days} days`}
        />
        <Metric i={2} tone={r?.unpaid_earnings_cents ? "attention" : undefined} label="Owed to you" icon={<Wallet size={16} />} value={r?.unpaid_earnings_cents ?? null} format={moneyShort} note="paid out by the market" />
        <Metric i={3} label="Couldn't deliver" icon={<Alert size={16} />} value={history.data ? failed : null} format={count} note="handed back to the shop" />
      </div>

      <div className="gd-split">
        <Panel title="Earned per day" subtitle={`Last ${days} days`} i={4}>
          {pay.length ? (
            <LineChart title="Earnings by day" labels={keys.map(dayLabel)} series={[{ label: "Earned", tone: 1, values: keys.map((k) => perDay.get(k) ?? 0) }]} format={money} axisFormat={moneyShort} />
          ) : (
            <p className="gd-empty">Your earnings show up here from your first delivery.</p>
          )}
        </Panel>
        <Panel title="Shops you deliver for" subtitle="Deliveries in the period" i={5}>
          {topShops.length ? <MixRing items={topShops} format={count} totalLabel="Deliveries" /> : <p className="gd-empty"><Store size={16} className="mr-1 inline" />No deliveries in this period.</p>}
        </Panel>
      </div>

      <Panel title="Every job" subtitle="Newest first" i={6}>
        <ActivityTable
          rows={jobs}
          rowKey={(d) => d.id}
          search={(d) => `${d.order_number} ${d.store_name}`}
          filterBy={(d) => OUTCOME[d.status]?.label ?? d.status}
          filterLabel="Outcome"
          searchLabel="Search orders or shops"
          empty="No finished jobs in this period."
          columns={[
            { label: "Finished", cell: (d) => whenShort(finishedAt(d)) },
            { label: "Order", cell: (d) => <span className="tabular-nums">{d.order_number}</span> },
            { label: "Shop", cell: (d) => d.store_name },
            { label: "Outcome", cell: (d) => <Badge state={OUTCOME[d.status]?.state ?? "plain"}>{OUTCOME[d.status]?.label ?? d.status}</Badge> },
            { label: "Earned", cell: (d) => (d.status === "delivered" && d.earning_cents != null ? money(d.earning_cents) : "–"), className: "num" },
            { label: "Paid out", cell: (d) => (paidOut.has(d.id) ? (paidOut.get(d.id) ? "Yes" : "Not yet") : "–") },
          ]}
        />
      </Panel>
    </GlassStage>
  );
}
