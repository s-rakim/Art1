"use client";
import { useState } from "react";
import { ErrorLine, PageTitle } from "@/components/dash";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { currencySign } from "@/lib/format";

const sign = currencySign();
const dollars = (s: string) => Math.round(parseFloat(s) * 100);
const num = (s: string) => (s.trim() === "" ? null : parseInt(s, 10));

export default function AdminSpace() {
  const plans = useApi((t) => api.adminPlans(t));
  const slots = useApi((t) => api.adminSlots(t));
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const field = (id: string, k: string, fallback: string) => draft[id]?.[k] ?? fallback;
  const set = (id: string, k: string, v: string) => setDraft((d) => ({ ...d, [id]: { ...d[id], [k]: v } }));
  const clear = (id: string) => setDraft(({ [id]: _, ...rest }) => rest);

  async function savePlan(id: string) {
    const p = plans.data?.find((x) => x.id === id);
    if (!p) return;
    const price = dollars(field(id, "price", ((p.monthly_price_cents ?? 0) / 100).toFixed(2)));
    const rate = parseFloat(field(id, "rate", ((p.commission_rate ?? 0) * 100).toFixed(1))) / 100;
    const fee = dollars(field(id, "fee", ((p.per_item_fee_cents ?? 0) / 100).toFixed(2)));
    const limit = num(field(id, "limit", p.product_limit ? String(p.product_limit) : ""));
    const days = num(field(id, "days", String(p.featured_slots ?? 0))) ?? 0;
    if (!(price >= 0) || !(rate >= 0 && rate <= 0.5) || !(fee >= 0) || (limit !== null && !(limit > 0)) || !(days >= 0 && days <= 31)) {
      return setMsg({ ok: false, text: "Rent and fees can't be negative, commission must be 0 to 50%, and free promo days 0 to 31." });
    }
    setBusy(id);
    setMsg(null);
    try {
      const next = await api.adminUpdatePlan(plans.token, id, {
        monthly_price_cents: price,
        commission_rate: Math.round(rate * 10000) / 10000,
        per_item_fee_cents: fee,
        product_limit: limit,
        featured_slots: days,
      });
      plans.setData((d) => d?.map((x) => (x.id === id ? { ...x, ...next, highlighted: x.highlighted } : x)) ?? d);
      clear(id);
      setMsg({ ok: true, text: `${p.name} updated. New rent applies from each store's next billing month.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Couldn't save the plan." });
    } finally {
      setBusy(null);
    }
  }

  async function saveSlot(id: string, extra: { is_active?: boolean } = {}) {
    const s = slots.data?.find((x) => x.id === id);
    if (!s) return;
    const price = dollars(field(id, "price", (s.daily_price_cents / 100).toFixed(2)));
    const capacity = num(field(id, "cap", String(s.capacity))) ?? 0;
    if (!(price > 0) || !(capacity >= 1 && capacity <= 100)) return setMsg({ ok: false, text: "Day rate must be above zero and spots between 1 and 100." });
    setBusy(id);
    setMsg(null);
    try {
      const next = await api.adminUpdateSlot(slots.token, id, { daily_price_cents: price, capacity, ...extra });
      slots.setData((d) => d?.map((x) => (x.id === id ? { ...x, ...next, is_active: extra.is_active ?? x.is_active } : x)) ?? d);
      clear(id);
      setMsg({ ok: true, text: `${s.name} updated. Existing bookings keep the price they were booked at.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Couldn't save that space." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageTitle title="Store space" kicker="Stall rent, commission and the spots vendors can rent by the day" />
      {msg && <p role="status" className={`mb-4 border-l-2 pl-3 text-[13px] ${msg.ok ? "border-element-success text-text-success" : "border-element-error text-text-error"}`}>{msg.text}</p>}
      <ErrorLine error={plans.error ?? slots.error} />

      <p className="label mb-2">Stall plans</p>
      <div className="mb-10 grid gap-3 lg:grid-cols-3">
        {(plans.data ?? []).map((p) => (
          <div key={p.id} className="card p-4">
            <p className="heading text-[20px]">{p.name}</p>
            <p className="tabular-nums text-[12px] text-maxcontrast">{p.code}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[12px]"><span className="label">Rent / month ({sign})</span><input className="field mt-1 tabular-nums" inputMode="decimal" value={field(p.id, "price", ((p.monthly_price_cents ?? 0) / 100).toFixed(2))} onChange={(e) => set(p.id, "price", e.target.value.replace(/[^\d.]/g, ""))} /></label>
              <label className="text-[12px]"><span className="label">Commission %</span><input className="field mt-1 tabular-nums" inputMode="decimal" value={field(p.id, "rate", ((p.commission_rate ?? 0) * 100).toFixed(1))} onChange={(e) => set(p.id, "rate", e.target.value.replace(/[^\d.]/g, ""))} /></label>
              <label className="text-[12px]"><span className="label">Fee per unit ({sign})</span><input className="field mt-1 tabular-nums" inputMode="decimal" value={field(p.id, "fee", ((p.per_item_fee_cents ?? 0) / 100).toFixed(2))} onChange={(e) => set(p.id, "fee", e.target.value.replace(/[^\d.]/g, ""))} /></label>
              <label className="text-[12px]"><span className="label">Product limit</span><input className="field mt-1 tabular-nums" inputMode="numeric" placeholder="No limit" value={field(p.id, "limit", p.product_limit ? String(p.product_limit) : "")} onChange={(e) => set(p.id, "limit", e.target.value.replace(/\D/g, ""))} /></label>
              <label className="col-span-2 text-[12px]"><span className="label">Free promo days a month</span><input className="field mt-1 tabular-nums" inputMode="numeric" value={field(p.id, "days", String(p.featured_slots ?? 0))} onChange={(e) => set(p.id, "days", e.target.value.replace(/\D/g, "").slice(0, 2))} /></label>
            </div>
            <button disabled={busy === p.id || !draft[p.id]} onClick={() => savePlan(p.id)} className="btn btn-sm mt-3">Save</button>
          </div>
        ))}
      </div>

      <p className="label mb-2">Space for rent, by the day</p>
      <div className="grid gap-3 md:grid-cols-2">
        {(slots.data ?? []).map((s) => {
          const off = s.is_active === false;
          return (
            <div key={s.id} className={`card p-4 ${off ? "bg-background-hover" : "bg-main-background"}`}>
              <div className="flex items-start justify-between gap-3">
                <div><p className="heading text-[20px]">{s.name}</p><p className="text-[12px] text-maxcontrast">{s.location}</p></div>
                {off && <span className="chip chip-error">Paused</span>}
              </div>
              {s.description && <p className="mt-1 text-[13px] text-maxcontrast">{s.description}</p>}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-[12px]"><span className="label">Price / day ({sign})</span><input className="field mt-1 tabular-nums" inputMode="decimal" value={field(s.id, "price", (s.daily_price_cents / 100).toFixed(2))} onChange={(e) => set(s.id, "price", e.target.value.replace(/[^\d.]/g, ""))} /></label>
                <label className="text-[12px]"><span className="label">Shops at once</span><input className="field mt-1 tabular-nums" inputMode="numeric" value={field(s.id, "cap", String(s.capacity))} onChange={(e) => set(s.id, "cap", e.target.value.replace(/\D/g, "").slice(0, 3))} /></label>
              </div>
              <div className="mt-3 flex gap-2">
                <button disabled={busy === s.id || !draft[s.id]} onClick={() => saveSlot(s.id)} className="btn btn-sm">Save</button>
                <button disabled={busy === s.id} onClick={() => saveSlot(s.id, { is_active: off })} className="btn btn-tertiary btn-sm">{off ? "Open for booking" : "Pause new bookings"}</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
