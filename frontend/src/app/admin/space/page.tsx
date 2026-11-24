"use client";
import { useState } from "react";
import { ErrorLine, PageTitle } from "@/components/dash";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";

const dollars = (s: string) => Math.round(parseFloat(s) * 100);

export default function AdminSpace() {
  const plans = useApi(() => api.plans());
  const placements = useApi((t) => api.adminPlacements(t));
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const field = (id: string, k: string, fallback: string) => draft[id]?.[k] ?? fallback;
  const set = (id: string, k: string, v: string) => setDraft((d) => ({ ...d, [id]: { ...d[id], [k]: v } }));

  async function savePlan(id: string) {
    const price = dollars(field(id, "price", ""));
    const rate = parseFloat(field(id, "rate", "")) / 100;
    if (!(price >= 0) || !(rate >= 0 && rate <= 0.5)) return setMsg({ ok: false, text: "Rent must be a positive amount and commission between 0 and 50%." });
    setBusy(id);
    try {
      const p = await api.adminUpdatePlan(plans.token, id, { monthly_price_cents: price, commission_rate: rate });
      plans.setData((d) => d?.map((x) => (x.id === id ? { ...x, ...p } : x)) ?? d);
      setMsg({ ok: true, text: "Plan updated. New prices apply to the next billing month." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Couldn't save the plan." });
    } finally {
      setBusy(null);
    }
  }

  async function savePlacement(id: string) {
    const price = dollars(field(id, "price", ""));
    const slots = parseInt(field(id, "slots", ""), 10);
    if (!(price > 0) || !(slots > 0 && slots < 1000)) return setMsg({ ok: false, text: "Weekly price and spot count must be positive." });
    setBusy(id);
    try {
      const p = await api.adminUpdatePlacement(placements.token, id, { weekly_price_cents: price, slots_total: slots });
      placements.setData((d) => d?.map((x) => (x.id === id ? { ...x, ...p } : x)) ?? d);
      setMsg({ ok: true, text: "Placement updated." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Couldn't save the placement." });
    } finally {
      setBusy(null);
    }
  }

  const weekly = (placements.data ?? []).reduce((a, p) => a + p.weekly_price_cents * p.slots_taken, 0);
  const capacity = (placements.data ?? []).reduce((a, p) => a + p.weekly_price_cents * p.slots_total, 0);

  return (
    <>
      <PageTitle title="Store space" kicker={`Placements sold this week: ${money(weekly)} of ${money(capacity)} possible`} />
      {msg && <p role="status" className={`mb-4 border-l-2 pl-3 text-[13px] ${msg.ok ? "border-market text-market" : "border-signal text-signal"}`}>{msg.text}</p>}
      <ErrorLine error={plans.error ?? placements.error} />

      <p className="label mb-2">Stall plans (monthly rent)</p>
      <div className="mb-10 grid gap-3 lg:grid-cols-3">
        {(plans.data ?? []).map((p) => (
          <div key={p.id} className="border border-ink bg-card p-4">
            <p className="display text-[28px]">{p.name}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[12px]"><span className="label">Rent / month ($)</span><input className="field mt-1 !h-9 font-mono" inputMode="decimal" value={field(p.id, "price", (p.monthly_price_cents / 100).toFixed(2))} onChange={(e) => set(p.id, "price", e.target.value.replace(/[^\d.]/g, ""))} /></label>
              <label className="text-[12px]"><span className="label">Commission %</span><input className="field mt-1 !h-9 font-mono" inputMode="decimal" value={field(p.id, "rate", (p.commission_rate * 100).toFixed(1))} onChange={(e) => set(p.id, "rate", e.target.value.replace(/[^\d.]/g, ""))} /></label>
            </div>
            <button disabled={busy === p.id || !draft[p.id]} onClick={() => savePlan(p.id)} className="btn btn-ink btn-sm mt-3">Save</button>
          </div>
        ))}
      </div>

      <p className="label mb-2">Placements for sale (weekly)</p>
      <div className="grid gap-3 md:grid-cols-2">
        {(placements.data ?? []).map((p) => (
          <div key={p.id} className="border border-ink bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="display text-[26px]">{p.name}</p><p className="text-[12px] text-ink-3">{p.location}</p></div>
              <span className="price text-[14px]">{p.slots_taken}/{p.slots_total} sold</span>
            </div>
            <div className="mt-2 h-1.5 bg-paper-2"><div className="h-full bg-market" style={{ width: `${(p.slots_taken / p.slots_total) * 100}%` }} /></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[12px]"><span className="label">Price / week ($)</span><input className="field mt-1 !h-9 font-mono" inputMode="decimal" value={field(p.id, "price", (p.weekly_price_cents / 100).toFixed(2))} onChange={(e) => set(p.id, "price", e.target.value.replace(/[^\d.]/g, ""))} /></label>
              <label className="text-[12px]"><span className="label">Spots</span><input className="field mt-1 !h-9 font-mono" inputMode="numeric" value={field(p.id, "slots", String(p.slots_total))} onChange={(e) => set(p.id, "slots", e.target.value.replace(/\D/g, ""))} /></label>
            </div>
            <button disabled={busy === p.id || !draft[p.id]} onClick={() => savePlacement(p.id)} className="btn btn-ink btn-sm mt-3">Save</button>
          </div>
        ))}
      </div>
    </>
  );
}
