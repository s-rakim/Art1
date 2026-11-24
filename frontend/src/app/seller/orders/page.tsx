"use client";
import { useState } from "react";
import { ErrorLine, PageTitle, Table } from "@/components/dash";
import { X } from "@/components/icons";
import { StatusTag } from "@/components/status-tag";
import { api, ApiError } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import type { Order, Rider } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function SellerOrders() {
  const { data, setData, error, token } = useApi((t) => api.sellerOrders(t));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState<Order | null>(null);
  const [filter, setFilter] = useState<"all" | "action">("action");

  const update = (o: Order) => setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === o.id ? { ...x, status: o.status } : x)) } : d));

  async function confirm(o: Order) {
    if (!window.confirm(`Confirm you've received payment for ${o.number}?`)) return;
    setBusy(o.id);
    setMsg(null);
    try {
      const r = await api.confirmPayment(token, o.id);
      update({ ...o, status: r.status ?? "paid" });
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Couldn't confirm that payment. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const items = (data?.items ?? []).filter((o) => filter === "all" || ["pending", "paid", "packed"].includes(o.status));

  return (
    <>
      <PageTitle
        kicker="Payments are confirmed manually until online payments are switched on"
        title="Orders & payments"
        action={
          <div className="flex border border-ink text-[13px]">
            {(["action", "all"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 ${filter === f ? "bg-ink text-paper" : ""}`}>{f === "action" ? "Needs action" : "All"}</button>
            ))}
          </div>
        }
      />
      <ErrorLine error={error ?? msg} />
      <Table head={["Order", "Placed", "Customer", "Items", "Total", "Status", ""]}>
        {items.map((o) => (
          <tr key={o.id}>
            <td className="px-3 py-3 font-mono text-[13px]">{o.number}</td>
            <td className="px-3 py-3">{shortDate(o.created_at)}</td>
            <td className="px-3 py-3">{o.shipping_address.full_name}<span className="block text-[12px] text-ink-3">{o.shipping_address.city}</span></td>
            <td className="px-3 py-3">{o.lines.reduce((a, l) => a + l.quantity, 0)}</td>
            <td className="price px-3 py-3">{money(o.total_cents, o.currency)}</td>
            <td className="px-3 py-3"><StatusTag status={o.status} /></td>
            <td className="px-3 py-3 text-right">
              {o.status === "pending" && <button disabled={busy === o.id} onClick={() => confirm(o)} className="btn btn-ink btn-sm">Confirm payment</button>}
              {(o.status === "paid" || o.status === "packed") && <button onClick={() => setDispatching(o)} className="btn btn-signal btn-sm">Dispatch rider</button>}
            </td>
          </tr>
        ))}
        {items.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-ink-3">No orders here.</td></tr>}
      </Table>
      {dispatching && <DispatchDialog order={dispatching} token={token} onClose={() => setDispatching(null)} onDone={() => { update({ ...dispatching, status: "shipped" }); setDispatching(null); }} />}
    </>
  );
}

function DispatchDialog({ order, token, onClose, onDone }: { order: Order; token: string | null; onClose: () => void; onDone: () => void }) {
  const riders = useApi((t) => api.availableRiders(t));
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    if (!pick) return;
    setBusy(true);
    setErr(null);
    try {
      await api.dispatch(token, order.id, pick);
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Dispatch didn't go through. Try another rider or retry.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Dispatch ${order.number}`}>
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full max-w-lg border-2 border-ink bg-paper">
        <div className="flex items-center justify-between border-b border-ink p-4">
          <p className="display text-[28px]">Dispatch {order.number}</p>
          <button onClick={onClose} className="btn btn-ghost btn-sm px-2" aria-label="Close"><X /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          <p className="mb-3 text-[14px] text-ink-2">Deliver to {order.shipping_address.full_name}, {order.shipping_address.line1}, {order.shipping_address.city}. Riders on shift nearby:</p>
          <ErrorLine error={riders.error ?? err} />
          <ul className="space-y-2">
            {(riders.data ?? []).map((r: Rider) => (
              <li key={r.id}>
                <label className={`flex cursor-pointer items-center gap-3 border p-3 ${pick === r.id ? "border-ink bg-card" : "border-rule"}`}>
                  <input type="radio" name="rider" className="accent-ink" checked={pick === r.id} onChange={() => setPick(r.id)} />
                  <span className="flex-1">
                    <span className="block font-semibold">{r.full_name}</span>
                    <span className="block text-[12px] capitalize text-ink-3">{r.vehicle} · ★ {r.rating.toFixed(2)} · {r.deliveries_completed.toLocaleString("en-US")} deliveries</span>
                  </span>
                </label>
              </li>
            ))}
            {riders.data?.length === 0 && <li className="text-[14px] text-ink-3">No riders on shift right now.</li>}
          </ul>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink p-4">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button onClick={send} disabled={!pick || busy} className="btn btn-signal">{busy ? "Sending…" : "Send to rider"}</button>
        </div>
      </div>
    </div>
  );
}
