"use client";
import Link from "next/link";
import { Bars, ErrorLine, PageTitle, Stat } from "@/components/dash";
import { api } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import { useApi } from "@/lib/use-api";

export default function AdminHome() {
  const income = useApi((t) => api.adminIncome(t));
  const stats = useApi((t) => api.adminStats(t));
  const i = income.data;
  const s = stats.data;
  const total = i ? i.rent_cents + i.commission_cents + i.placement_cents + i.delivery_fee_cents : 0;

  return (
    <>
      <PageTitle kicker="Last 30 days" title="Income" />
      <ErrorLine error={income.error ?? stats.error} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Total income" value={i ? money(total) : "…"} tone="market" />
        <Stat label="Stall rent" value={i ? money(i.rent_cents) : "…"} />
        <Stat label="Commission" value={i ? money(i.commission_cents) : "…"} />
        <Stat label="Space & ads" value={i ? money(i.placement_cents) : "…"} />
        <Stat label="Delivery fees" value={i ? money(i.delivery_fee_cents) : "…"} />
      </div>
      {i && (
        <div className="mt-6 border border-ink bg-card p-5">
          <p className="label mb-4">Daily income by source</p>
          <Bars
            data={i.daily.map((d) => ({ label: shortDate(d.date).replace(/, \d{4}$/, ""), values: [d.rent_cents, d.commission_cents, d.placement_cents] }))}
            format={(n) => money(n)}
            stacked={["Rent", "Commission", "Space & ads"]}
          />
        </div>
      )}
      {s && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Marketplace sales (GMV)" value={money(s.gmv_30d_cents)} />
          <Stat label="Active stores" value={String(s.active_stores)} />
          <Link href="/admin/stores" className="block"><Stat label="Stall applications" value={String(s.pending_applications)} note="Waiting for review →" tone={s.pending_applications ? "signal" : undefined} /></Link>
          <Stat label="Open disputes" value={String(s.open_disputes)} tone={s.open_disputes ? "signal" : undefined} />
        </div>
      )}
    </>
  );
}
