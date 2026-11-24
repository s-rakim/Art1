"use client";
import { useState } from "react";
import { ErrorLine, PageTitle, Table } from "@/components/dash";
import { X } from "@/components/icons";
import { StatusTag } from "@/components/status-tag";
import { api, ApiError } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import type { SellerOrder } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const payLabel: Record<string, string> = { cod: "Cash on delivery", bank_transfer: "Bank transfer", card: "Card" };
const ACTIVE_DELIVERY = new Set(["assigned", "accepted", "picked_up"]);

/** What the vendor still has to do on this order, if anything. */
function needs(o: SellerOrder) {
  const canConfirm = !o.paid && o.payment_method !== "card" && o.status !== "canceled";
  const onTheRoad = o.delivery && ACTIVE_DELIVERY.has(o.delivery.status);
  const canDispatch = o.status === "processing" && !onTheRoad;
  return { canConfirm, canDispatch, any: canDispatch || (canConfirm && o.payment_method === "bank_transfer") };
}

export default function SellerOrders() {
  const { data, setData, error, token } = useApi((t) => api.sellerOrders(t));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<SellerOrder | null>(null);
  const [dispatching, setDispatching] = useState<SellerOrder | null>(null);
  const [filter, setFilter] = useState<"all" | "action">("action");

  const update = (o: Partial<SellerOrder> & { id: string }) =>
    setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === o.id ? { ...x, ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) } : x)) } : d));

  async function confirm(o: SellerOrder) {
    setBusy(o.id);
    setMsg(null);
    try {
      update(await api.confirmPayment(token, o.id));
      setConfirming(null);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Couldn't confirm that payment. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function delivered(o: SellerOrder) {
    setBusy(o.id);
    setMsg(null);
    try {
      update(await api.updateSellerOrder(token, o.id, { status: "delivered" }));
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Couldn't update that order.");
    } finally {
      setBusy(null);
    }
  }

  const items = (data?.items ?? []).filter((o) => filter === "all" || needs(o).any);

  return (
    <>
      <PageTitle
        kicker="Card payments aren't live yet, so you confirm cash and transfers yourself"
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
      <Table head={["Order", "Placed", "Customer", "Items", "Total", "Payment", "Status", ""]}>
        {items.map((o) => {
          const n = needs(o);
          return (
            <tr key={o.id}>
              <td className="px-3 py-3 font-mono text-[13px]">{o.number}</td>
              <td className="px-3 py-3">{shortDate(o.created_at)}</td>
              <td className="px-3 py-3">{o.ship_to.full_name ?? "Customer"}<span className="block text-[12px] text-ink-3">{o.ship_to.city}</span></td>
              <td className="px-3 py-3">{o.items.reduce((a, l) => a + l.quantity, 0)}</td>
              <td className="price px-3 py-3">{money(o.total_cents, o.currency)}<span className="block text-[11px] text-ink-3">you get {money(o.payout_cents, o.currency)}</span></td>
              <td className="px-3 py-3 text-[13px]">
                {payLabel[o.payment_method] ?? o.payment_method}
                <span className={`block text-[12px] ${o.paid ? "text-market" : "text-ink-3"}`}>{o.paid ? "Received" : "Not yet"}</span>
              </td>
              <td className="px-3 py-3">
                <StatusTag status={o.status} />
                {o.delivery && <span className="mt-1 block text-[12px] text-ink-3">{o.delivery.rider_name}: {o.delivery.status.replace(/_/g, " ")}</span>}
                {o.tracking_number && <span className="mt-1 block font-mono text-[11px] text-ink-3">{o.tracking_carrier} {o.tracking_number}</span>}
              </td>
              <td className="space-y-1.5 px-3 py-3 text-right">
                {n.canDispatch && <button onClick={() => setDispatching(o)} className="btn btn-signal btn-sm w-full">Dispatch</button>}
                {n.canConfirm && <button disabled={busy === o.id} onClick={() => setConfirming(o)} className="btn btn-line btn-sm w-full">Confirm payment</button>}
                {o.status === "shipped" && !o.delivery && (
                  <button disabled={busy === o.id} onClick={() => delivered(o)} className="btn btn-line btn-sm w-full">Mark delivered</button>
                )}
              </td>
            </tr>
          );
        })}
        {items.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-ink-3">{filter === "action" ? "Nothing needs you right now." : "No orders yet."}</td></tr>}
      </Table>

      {confirming && (
        <Dialog title={`Payment for ${confirming.number}`} onClose={() => setConfirming(null)}>
          <div className="p-4 text-[14px]">
            <p>
              {confirming.payment_method === "cod"
                ? `Only confirm once the rider has handed you the cash: ${money(confirming.total_cents, confirming.currency)}.`
                : `Only confirm once ${money(confirming.total_cents, confirming.currency)} has actually landed in your account. A screenshot from the customer isn't proof.`}
            </p>
            <p className="mt-2 text-ink-3">This can&apos;t be undone from here.</p>
          </div>
          <div className="flex justify-end gap-2 border-t border-ink p-4">
            <button onClick={() => setConfirming(null)} className="btn btn-ghost">Not yet</button>
            <button disabled={busy === confirming.id} onClick={() => confirm(confirming)} className="btn btn-ink">{busy === confirming.id ? "Saving…" : "Yes, I've been paid"}</button>
          </div>
        </Dialog>
      )}

      {dispatching && (
        <DispatchDialog
          order={dispatching}
          token={token}
          onClose={() => setDispatching(null)}
          onDone={(o) => {
            update(o);
            setDispatching(null);
          }}
        />
      )}
    </>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full max-w-lg border-2 border-ink bg-paper">
        <div className="flex items-center justify-between border-b border-ink p-4">
          <p className="display text-[28px]">{title}</p>
          <button onClick={onClose} className="btn btn-ghost btn-sm px-2" aria-label="Close"><X /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DispatchDialog({ order, token, onClose, onDone }: { order: SellerOrder; token: string | null; onClose: () => void; onDone: (o: Partial<SellerOrder> & { id: string }) => void }) {
  const riders = useApi((t) => api.availableRiders(t));
  const [mode, setMode] = useState<"rider" | "courier">("rider");
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (mode === "rider") {
        if (!pick) return setBusy(false);
        onDone(await api.dispatch(token, order.id, pick, note.trim() || undefined));
      } else {
        onDone(await api.updateSellerOrder(token, order.id, { status: "shipped", tracking_carrier: carrier.trim(), tracking_number: tracking.trim() }));
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "That didn't go through. Try again.");
      setBusy(false);
    }
  }

  const to = [order.ship_to.full_name, order.ship_to.line1, order.ship_to.city].filter(Boolean).join(", ");

  return (
    <Dialog title={`Dispatch ${order.number}`} onClose={onClose}>
      <form onSubmit={send}>
        <div className="flex border-b border-ink text-[13px]">
          {(["rider", "courier"] as const).map((m) => (
            <button type="button" key={m} onClick={() => setMode(m)} className={`flex-1 py-2 ${mode === m ? "bg-ink text-paper" : ""}`}>
              {m === "rider" ? "Send a rider" : "Ship by courier"}
            </button>
          ))}
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          <p className="mb-3 text-[14px] text-ink-2">Deliver to {to || "the customer"}.</p>
          {!order.paid && order.payment_method === "cod" && (
            <p className="mb-3 border-l-2 border-tag pl-3 text-[13px]">Cash on delivery: the rider collects {money(order.total_cents, order.currency)} and brings it back to you.</p>
          )}
          <ErrorLine error={(mode === "rider" ? riders.error : null) ?? err} />
          {mode === "rider" ? (
            <>
              <ul className="space-y-2">
                {(riders.data ?? []).map((r) => (
                  <li key={r.id}>
                    <label className={`flex cursor-pointer items-center gap-3 border p-3 ${pick === r.id ? "border-ink bg-card" : "border-rule"}`}>
                      <input type="radio" name="rider" className="accent-ink" checked={pick === r.id} onChange={() => setPick(r.id)} />
                      <span className="flex-1">
                        <span className="block font-semibold">{r.name}</span>
                        <span className="block text-[12px] capitalize text-ink-3">
                          {r.vehicle.replace(/_/g, " ")}
                          {r.distance_km !== null && ` · ${r.distance_km.toFixed(1)} km away`}
                          {r.eta_to_store_minutes !== null && ` · here in about ${r.eta_to_store_minutes} min`}
                        </span>
                      </span>
                      {r.active_deliveries > 0 && <span className="ticket ticket-tag">{r.active_deliveries} ON JOB</span>}
                    </label>
                  </li>
                ))}
                {riders.data?.length === 0 && <li className="text-[14px] text-ink-3">No riders on shift near you right now. Try again in a few minutes, or ship by courier.</li>}
              </ul>
              <label className="mt-4 block">
                <span className="label">Note for the rider (optional)</span>
                <input maxLength={300} className="field mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Fragile, ring the side door, etc." />
              </label>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label><span className="label">Carrier</span><input required maxLength={40} className="field mt-1" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="DHL, UPS, local post" /></label>
              <label><span className="label">Tracking number</span><input required maxLength={64} pattern="[A-Za-z0-9 \-]{4,64}" className="field mt-1 font-mono" value={tracking} onChange={(e) => setTracking(e.target.value)} /></label>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-ink p-4">
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button disabled={busy || (mode === "rider" && !pick)} className="btn btn-signal">{busy ? "Sending…" : mode === "rider" ? "Send to rider" : "Mark shipped"}</button>
        </div>
      </form>
    </Dialog>
  );
}
