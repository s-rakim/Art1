"use client";
import { useMemo, useState } from "react";
import { ErrorLine, PageTitle, Table } from "@/components/dash";
import { StatusTag } from "@/components/status-tag";
import { api, ApiError } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import type { PlacementSlot } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

export default function StoreSpace() {
  const me = useApi((t) => api.sellerMe(t));
  const plans = useApi(() => api.plans());
  const slots = useApi(() => api.placementSlots());
  const mine = useApi((t) => api.myPlacements(t));
  const products = useApi((t) => api.sellerProducts(t));
  const [booking, setBooking] = useState<PlacementSlot | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const current = me.data?.plan ?? null;

  async function switchPlan(code: string, name: string) {
    setSwitching(code);
    setMsg(null);
    try {
      await api.changePlan(me.token, code);
      me.reload();
      setMsg({ ok: true, text: `You're on ${name} now. The new rent shows on your next statement.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Couldn't change plan." });
    } finally {
      setSwitching(null);
    }
  }

  return (
    <>
      <PageTitle kicker="Your stall, and extra space you can rent by the day" title="Store space" />
      {msg && <p role="status" className={`mb-4 border-l-2 pl-3 text-[13px] ${msg.ok ? "border-market text-market" : "border-signal text-signal"}`}>{msg.text}</p>}

      <section className="mb-10">
        <p className="label mb-2">Your stall plan</p>
        <div className="grid gap-3 md:grid-cols-3">
          {(plans.data ?? []).map((p) => {
            const on = current?.code === p.code;
            return (
              <div key={p.id} className={`flex flex-col border p-5 ${on ? "border-2 border-ink bg-card" : "border-rule"}`}>
                <div className="flex items-center justify-between">
                  <p className="display text-[30px]">{p.name}</p>
                  {on && <span className="ticket ticket-ink">CURRENT</span>}
                </div>
                <p className="price mt-1 text-[20px]">{money(p.monthly_price_cents)}<span className="text-[13px] text-ink-3"> / month</span></p>
                <ul className="mt-3 flex-1 space-y-1 text-[13px] text-ink-2">
                  <li>{(p.commission_rate * 100).toFixed(p.commission_rate * 100 % 1 ? 1 : 0)}% commission per sale</li>
                  <li>{p.product_limit ? `Up to ${p.product_limit.toLocaleString("en-US")} live products` : "Unlimited products"}</li>
                  {!!p.featured_slots && <li>{p.featured_slots} free promo days a month</li>}
                </ul>
                {!on && (
                  <button disabled={!!switching || !me.data} onClick={() => switchPlan(p.code, p.name)} className="btn btn-line btn-sm mt-4">
                    {switching === p.code ? "Switching…" : `Switch to ${p.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {me.data?.subscription && (
          <p className="mt-2 text-[12px] text-ink-3">Current period ends {shortDate(me.data.subscription.current_period_end)}.</p>
        )}
      </section>

      <section className="mb-10">
        <p className="label mb-2">Promoted space</p>
        <ErrorLine error={slots.error} />
        <div className="grid gap-4 md:grid-cols-2">
          {(slots.data ?? []).map((pl) => {
            const left = pl.booked != null ? pl.capacity - pl.booked : null;
            return (
              <div key={pl.id} className="flex flex-col border border-ink bg-card p-5">
                <p className="label">{pl.location}</p>
                <p className="display mt-1 text-[28px]">{pl.name}</p>
                <p className="mt-1 flex-1 text-[14px] text-ink-2">{pl.description}</p>
                <p className="mt-3 font-mono text-[12px] text-ink-3">
                  {money(pl.daily_price_cents)} a day · {left !== null ? `${left} of ${pl.capacity} spots free today` : `${pl.capacity} spots a day`}
                </p>
                <button onClick={() => setBooking(pl)} className="btn btn-ink mt-3 self-start">Book dates</button>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <p className="label mb-2">Your bookings</p>
        <ErrorLine error={mine.error} />
        <Table head={["Space", "Dates", "Headline", "Cost", "Status"]}>
          {(mine.data ?? []).map((b) => (
            <tr key={b.id}>
              <td className="px-3 py-3">{b.slot_name}</td>
              <td className="px-3 py-3 font-mono text-[12px]">{shortDate(b.starts_on)} to {shortDate(b.ends_on)}</td>
              <td className="px-3 py-3 text-ink-2">{b.headline ?? ""}</td>
              <td className="price px-3 py-3">{money(b.amount_cents, b.currency)}{b.credits_used ? <span className="block text-[11px] text-market">{b.credits_used} free days used</span> : null}</td>
              <td className="px-3 py-3"><StatusTag status={b.status} /></td>
            </tr>
          ))}
          {mine.data?.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-ink-3">No bookings yet.</td></tr>}
        </Table>
      </section>

      {booking && (
        <BookDialog
          slot={booking}
          freeDays={current?.featured_slots ?? 0}
          products={(products.data?.items ?? []).filter((p) => p.status === "active").map((p) => ({ id: p.id, title: p.title }))}
          token={me.token}
          onClose={() => setBooking(null)}
          onDone={(text) => {
            setBooking(null);
            setMsg({ ok: true, text });
            mine.reload();
          }}
        />
      )}
    </>
  );
}

function BookDialog({
  slot, freeDays, products, token, onClose, onDone,
}: {
  slot: PlacementSlot;
  freeDays: number;
  products: Array<{ id: string; title: string }>;
  token: string | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const today = useMemo(() => iso(new Date()), []);
  const [start, setStart] = useState(today);
  const [days, setDays] = useState(7);
  const [product, setProduct] = useState("");
  const [headline, setHeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = addDays(start, days - 1);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const b = await api.bookPlacement(token, {
        slot_code: slot.code,
        starts_on: start,
        ends_on: end,
        product_id: product || null,
        headline: headline.trim() || null,
      });
      onDone(`Booked ${slot.name} from ${shortDate(b.starts_on)} to ${shortDate(b.ends_on)} for ${money(b.amount_cents, b.currency)}. It comes out of your store balance.`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Booking didn't go through.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Book ${slot.name}`}>
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full max-w-lg border-2 border-ink bg-paper">
        <div className="border-b border-ink p-4">
          <p className="label">{slot.location}</p>
          <p className="display text-[28px]">Book {slot.name}</p>
        </div>
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <label><span className="label">Start</span><input type="date" required min={today} max={addDays(today, 180)} className="field mt-1" value={start} onChange={(e) => setStart(e.target.value || today)} /></label>
            <label>
              <span className="label">How long</span>
              <select className="field mt-1" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[1, 3, 7, 14, 30, 60].map((n) => <option key={n} value={n}>{n} day{n > 1 ? "s" : ""}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="label">Product to feature (optional)</span>
            <select className="field mt-1" value={product} onChange={(e) => setProduct(e.target.value)}>
              <option value="">Your storefront</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Headline (optional)</span><input maxLength={120} className="field mt-1" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Summer linen, new this week" /></label>
          <div className="border-t border-rule pt-3 text-[14px]">
            <p className="flex justify-between"><span>{days} day{days > 1 ? "s" : ""}, ends {shortDate(end)}</span><span className="price">{money(slot.daily_price_cents * days)}</span></p>
            {freeDays > 0 && <p className="mt-1 text-[12px] text-market">Your plan includes {freeDays} free promo days a month. Any you haven&apos;t used come off this price.</p>}
            <p className="mt-1 text-[12px] text-ink-3">Charged to your store balance, which is settled from your next sales.</p>
          </div>
          <ErrorLine error={err} />
        </div>
        <div className="flex justify-end gap-2 border-t border-ink p-4">
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button disabled={busy} className="btn btn-signal">{busy ? "Booking…" : "Book it"}</button>
        </div>
      </form>
    </div>
  );
}
