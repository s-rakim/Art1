"use client";
import { useState } from "react";
import { ErrorLine, PageTitle } from "@/components/dash";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";

export default function StoreSpace() {
  const me = useApi((t) => api.sellerMe(t));
  const plans = useApi(() => api.plans());
  const placements = useApi(() => api.placements());
  const [weeks, setWeeks] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function book(id: string, name: string) {
    const w = weeks[id] ?? 1;
    setBusy(id);
    setMsg(null);
    try {
      await api.bookPlacement(me.token, { placement_id: id, weeks: w });
      setMsg({ ok: true, text: `Booked ${name} for ${w} week${w > 1 ? "s" : ""}. It starts next Monday and is billed with your rent.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Booking didn't go through." });
    } finally {
      setBusy(null);
    }
  }

  const current = plans.data?.find((p) => p.id === me.data?.plan);

  return (
    <>
      <PageTitle kicker="Your stall and any extra space you rent" title="Store space" />
      {current && (
        <div className="mb-8 grid gap-4 border-2 border-ink bg-card p-5 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="label">Current plan</p>
            <p className="display text-[36px]">{current.name}</p>
            <p className="text-[14px] text-ink-2">{money(current.monthly_price_cents)} a month, {(current.commission_rate * 100).toFixed(0)}% commission, {current.product_limit ? `${current.product_limit.toLocaleString("en-US")} listings` : "unlimited listings"}</p>
          </div>
          <a href="/sell#plans" className="btn btn-line">Compare plans</a>
        </div>
      )}
      {msg && <p role="status" className={`mb-4 border-l-2 pl-3 text-[13px] ${msg.ok ? "border-market text-market" : "border-signal text-signal"}`}>{msg.text}</p>}
      <ErrorLine error={placements.error} />
      <div className="grid gap-4 md:grid-cols-2">
        {(placements.data ?? []).map((pl) => {
          const left = pl.slots_total - pl.slots_taken;
          const w = weeks[pl.id] ?? 1;
          return (
            <div key={pl.id} className="flex flex-col border border-ink bg-card p-5">
              <p className="label">{pl.location}</p>
              <p className="display mt-1 text-[28px]">{pl.name}</p>
              <p className="mt-1 flex-1 text-[14px] text-ink-2">{pl.description}</p>
              <p className={`mt-3 font-mono text-[12px] ${left <= 4 ? "text-signal" : "text-ink-3"}`}>{left} of {pl.slots_total} spots free</p>
              <div className="mt-3 flex items-center gap-2">
                <select className="field !h-10 !w-auto" value={w} onChange={(e) => setWeeks((x) => ({ ...x, [pl.id]: Number(e.target.value) }))} aria-label="Weeks">
                  {[1, 2, 4, 8].map((n) => <option key={n} value={n}>{n} week{n > 1 ? "s" : ""}</option>)}
                </select>
                <button disabled={left < 1 || busy === pl.id} onClick={() => book(pl.id, pl.name)} className="btn btn-ink ml-auto">
                  {left < 1 ? "Sold out" : `Book for ${money(pl.weekly_price_cents * w)}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
