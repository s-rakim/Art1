"use client";
import Link from "next/link";
import { useState } from "react";
import { Bars, ErrorLine, PageTitle, Stat } from "@/components/dash";
import { api } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import { useApi } from "@/lib/use-api";

const periods = [["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["365d", "A year"]] as const;
type Period = (typeof periods)[number][0];

export default function AdminHome() {
  const [period, setPeriod] = useState<Period>("30d");
  const income = useApi((t) => api.adminIncome(t, period), [period]);
  const stats = useApi((t) => api.adminStats(t));
  const riders = useApi((t) => api.adminRiderApplications(t));
  const i = income.data;
  const s = stats.data;
  const label = periods.find(([p]) => p === period)![1];
  // Bars get unreadable past ~90 columns, so a year is shown by week.
  const daily = i?.daily ?? [];
  const rows = daily.length > 90
    ? Array.from({ length: Math.ceil(daily.length / 7) }, (_, w) => daily.slice(w * 7, w * 7 + 7)).map((wk) => ({
        date: wk[0].date,
        v: [0, 1, 2, 3, 4].map((k) => wk.reduce((a, d) => a + [d.rent_cents, d.commission_cents, d.fee_cents, d.placement_cents, d.delivery_fee_cents][k], 0)),
      }))
    : daily.map((d) => ({ date: d.date, v: [d.rent_cents, d.commission_cents, d.fee_cents, d.placement_cents, d.delivery_fee_cents] }));

  return (
    <>
      <PageTitle
        kicker={`Market income, last ${label.toLowerCase()}`}
        title="Income"
        action={
          <div className="flex overflow-hidden rounded-element border border-border-maxcontrast text-[14px]" role="group" aria-label="Period">
            {periods.map(([p, l]) => (
              <button key={p} onClick={() => setPeriod(p)} aria-pressed={period === p} className={`h-[32px] px-3 font-medium ${period === p ? "bg-primary-element-light font-semibold text-primary-element-light-text" : "hover:bg-background-hover"}`}>{l}</button>
            ))}
          </div>
        }
      />
      <ErrorLine error={income.error ?? stats.error} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Net income" value={i ? money(i.total_cents) : "…"} tone="market" note={i ? `after ${money(i.rider_cost_cents)} paid to riders` : undefined} />
        <Stat label="Stall rent" value={i ? money(i.rent_cents) : "…"} />
        <Stat label="Commission" value={i ? money(i.commission_cents) : "…"} />
        <Stat label="Per-item fees" value={i ? money(i.fee_cents) : "…"} />
        <Stat label="Rented space" value={i ? money(i.placement_cents) : "…"} />
        <Stat label="Delivery fees" value={i ? money(i.delivery_fee_cents) : "…"} />
      </div>
      {rows.length > 0 && (
        <div className="rounded-element mt-6 border border-border-dark bg-main-background p-5">
          <p className="label mb-4">{daily.length > 90 ? "Weekly" : "Daily"} income by source</p>
          <Bars
            data={rows.map((r) => ({ label: shortDate(r.date).replace(/, \d{4}$/, ""), values: r.v }))}
            format={(n) => money(n)}
            stacked={["Rent", "Commission", "Item fees", "Rented space", "Delivery fees"]}
          />
        </div>
      )}
      {s && (
        <>
          <p className="label mt-8 mb-2">The market, last 30 days</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Sales through the market" value={money(s.gmv_cents_30d)} note={`${s.orders_30d.toLocaleString("en-US")} orders`} />
            <Stat label="Rent coming in each month" value={money(s.rent_mrr_cents)} note={`${s.active_stores} stalls open`} />
            <Link href="/admin/stores" className="block">
              <Stat label="Stall applications" value={String(s.pending_stores)} note="Review them" tone={s.pending_stores ? "signal" : undefined} />
            </Link>
            <Link href="/admin/riders" className="block">
              <Stat label="Rider applications" value={riders.data ? String(riders.data.total) : "…"} note="Review them" tone={riders.data?.total ? "signal" : undefined} />
            </Link>
            <Stat label="Shoppers" value={s.customers.toLocaleString("en-US")} />
            <Stat label="Live products" value={s.active_products.toLocaleString("en-US")} />
            <Stat label="Payouts requested" value={money(s.payouts_requested_cents)} tone={s.payouts_requested_cents ? "signal" : undefined} />
          </div>
        </>
      )}
    </>
  );
}
