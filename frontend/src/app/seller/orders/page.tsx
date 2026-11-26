"use client";
import { useMemo, useState } from "react";
import { ErrorLine, PageTitle, Table } from "@/components/dash";
import { StatusTag } from "@/components/status-tag";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { api, ApiError } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import type { SellerOrder } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { LiveDot } from "@/components/live-refresh";
import { useLiveReload } from "@/lib/live";

// Shoppers pay the market's own till or bank account; the rider (or the admin) confirms it.
// Vendors never confirm payments, and the market pays them out on its schedule.
const payLabel: Record<string, string> = { cod: "Pay on arrival", bank_transfer: "Bank transfer to the market", card: "Card" };
const ACTIVE_DELIVERY = new Set(["assigned", "accepted", "picked_up", "arrived"]);

/** What the vendor still has to do on this order, if anything. */
function needs(o: SellerOrder) {
  const onTheRoad = o.delivery && ACTIVE_DELIVERY.has(o.delivery.status);
  const canDispatch = o.status === "processing" && !onTheRoad;
  return { canDispatch, any: canDispatch };
}

export default function SellerOrders() {
  const { data, setData, error, token, reload } = useApi((t) => api.sellerOrders(t));
  // New orders, payments and rider progress arrive over the live socket.
  const live = useLiveReload(["order", "job"], reload, 30000);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState<SellerOrder | null>(null);
  const [filter, setFilter] = useState<"all" | "action">("action");

  const update = (o: Partial<SellerOrder> & { id: string }) =>
    setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === o.id ? { ...x, ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) } : x)) } : d));

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
        kicker="Shoppers pay the market at the door; the rider confirms it and the market pays you out"
        title="Orders & payments"
        action={
          <>
          <LiveDot live={live} />
          <div className="flex overflow-hidden rounded-element border border-border-maxcontrast text-[14px]">
            {(["action", "all"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`h-[32px] px-3 font-medium ${filter === f ? "bg-primary-element-light font-semibold text-primary-element-light-text" : "hover:bg-background-hover"}`}>{f === "action" ? "Needs action" : "All"}</button>
            ))}
          </div>
          </>
        }
      />
      <ErrorLine error={error ?? msg} />
      <Table head={["Order", "Placed", "Customer", "Items", "Total", "Payment", "Status", ""]}>
        {items.map((o) => {
          const n = needs(o);
          return (
            <tr key={o.id}>
              <td className="px-3 py-3 tabular-nums text-[13px]">{o.number}</td>
              <td className="px-3 py-3">{shortDate(o.created_at)}</td>
              <td className="px-3 py-3">{o.ship_to.full_name ?? "Customer"}<span className="block text-[12px] text-maxcontrast">{o.ship_to.city}</span></td>
              <td className="px-3 py-3">{o.items.reduce((a, l) => a + l.quantity, 0)}</td>
              <td className="price px-3 py-3">{money(o.total_cents, o.currency)}<span className="block text-[12px] text-maxcontrast">you get {money(o.payout_cents, o.currency)}</span></td>
              <td className="px-3 py-3 text-[13px]">
                {payLabel[o.payment_method] ?? o.payment_method}
                <span className={`block text-[12px] ${o.paid ? "text-text-success" : "text-maxcontrast"}`}>{o.paid ? "Paid to the market" : "Not yet"}</span>
              </td>
              <td className="px-3 py-3">
                <StatusTag status={o.status} />
                {o.delivery ? (
                  <span className="mt-1 block text-[12px] text-maxcontrast">{o.delivery.rider_name}: {o.delivery.status.replace(/_/g, " ")}</span>
                ) : o.status === "processing" ? (
                  <span className="mt-1 block text-[12px] text-maxcontrast">The nearest free rider is sent automatically</span>
                ) : null}
                {o.tracking_number && <span className="mt-1 block tabular-nums text-[12px] text-maxcontrast">{o.tracking_carrier} {o.tracking_number}</span>}
              </td>
              <td className="space-y-1.5 px-3 py-3 text-right">
                {n.canDispatch && <button onClick={() => setDispatching(o)} className="btn btn-sm w-full">Choose rider or courier</button>}
                {o.status === "shipped" && !o.delivery && (
                  <button disabled={busy === o.id} onClick={() => delivered(o)} className="btn btn-secondary btn-sm w-full">Mark delivered</button>
                )}
              </td>
            </tr>
          );
        })}
        {items.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-maxcontrast">{filter === "action" ? "Nothing needs you right now." : "No orders yet."}</td></tr>}
      </Table>

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

const AUTO = "auto";

function DispatchDialog({ order, token, onClose, onDone }: { order: SellerOrder; token: string | null; onClose: () => void; onDone: (o: Partial<SellerOrder> & { id: string }) => void }) {
  const riders = useApi((t) => api.availableRiders(t));
  const [mode, setMode] = useState<"rider" | "courier">("rider");
  // "auto" lets the market send the closest free rider; otherwise a rider the vendor picked.
  const [pick, setPick] = useState<string>(AUTO);
  // Free riders first, then by distance to the shop, so the top row is who would go.
  const ranked = useMemo(
    () => [...(riders.data ?? [])].sort((a, b) => Number(a.active_deliveries > 0) - Number(b.active_deliveries > 0) || (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity)),
    [riders.data],
  );
  const nearest = ranked.find((r) => r.active_deliveries === 0) ?? ranked[0];
  const [note, setNote] = useState("");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (mode === "rider") {
        onDone(await api.dispatch(token, order.id, pick === AUTO ? null : pick, note.trim() || undefined));
      } else {
        onDone(await api.updateSellerOrder(token, order.id, { status: "shipped", tracking_carrier: carrier.trim(), tracking_number: tracking.trim() }));
      }
    } catch (e) {
      // Nobody free nearby: the order stays on automatic dispatch, which is not a failure.
      if (e instanceof ApiError && e.code === "no_riders") setQueued(true);
      else setErr(e instanceof ApiError ? e.message : "That didn't go through. Try again.");
      setBusy(false);
    }
  }

  const to = [order.ship_to.full_name, order.ship_to.line1, order.ship_to.city].filter(Boolean).join(", ");
  const option = (selected: boolean) =>
    `rounded-element flex cursor-pointer items-center gap-3 border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary-element ${selected ? "border-primary-element bg-primary-element-light" : "border-border-dark hover:bg-background-hover"}`;

  return (
    <Modal open onClose={onClose} busy={busy} title={`Dispatch ${order.number}`}>
      <form onSubmit={send}>
        <div className="flex gap-1 border-b border-border px-2 pb-2" role="group" aria-label="How it goes out">
          {(["rider", "courier"] as const).map((m) => (
            <button type="button" key={m} aria-pressed={mode === m} onClick={() => setMode(m)} className={`btn btn-sm flex-1 ${mode === m ? "" : "btn-tertiary"}`}>
              {m === "rider" ? "Send a rider" : "Ship by courier"}
            </button>
          ))}
        </div>
        <div className="p-4">
          <p className="mb-3 text-[14px] text-maxcontrast">Deliver to {to || "the customer"}.</p>
          {!order.paid && order.payment_method === "cod" && (
            <p className="note note-info mb-3 text-[14px]"><span>Pay on arrival: the customer pays {money(order.total_cents, order.currency)} into the market&apos;s till when the rider gets there. The rider confirms it, and your share comes in your next payout.</span></p>
          )}
          {queued ? (
            <p role="status" className="note note-info text-[14px]">
              <span>No riders are on shift near your shop right now. The order stays on automatic dispatch and goes to the first rider who frees up; you don&apos;t need to do anything.</span>
            </p>
          ) : (
            <ErrorLine error={(mode === "rider" ? riders.error : null) ?? err} />
          )}
          {mode === "rider" ? (
            <>
              <fieldset>
                <legend className="sr-only">Rider</legend>
                <ul className="space-y-2">
                  <li>
                    <label className={option(pick === AUTO)}>
                      <input type="radio" name="rider" className="accent-primary-element" checked={pick === AUTO} onChange={() => setPick(AUTO)} />
                      <span className="flex-1">
                        <span className="block font-semibold">Closest free rider</span>
                        <span className="block text-[12px] text-maxcontrast">
                          {nearest ? `Right now that's ${nearest.name}${nearest.distance_km !== null ? `, ${nearest.distance_km.toFixed(1)} km away` : ""}.` : "The market picks whoever is nearest when you send."}
                        </span>
                      </span>
                      <span className="chip chip-primary">Automatic</span>
                    </label>
                  </li>
                  {ranked.map((r) => (
                    <li key={r.id}>
                      <label className={option(pick === r.id)}>
                        <input type="radio" name="rider" className="accent-primary-element" checked={pick === r.id} onChange={() => setPick(r.id)} />
                        <span className="flex-1">
                          <span className="block font-semibold">{r.name}</span>
                          <span className="block text-[12px] capitalize text-maxcontrast">
                            {r.vehicle.replace(/_/g, " ")}
                            {r.distance_km !== null && ` · ${r.distance_km.toFixed(1)} km away`}
                            {r.eta_to_store_minutes !== null && ` · here in about ${r.eta_to_store_minutes} min`}
                          </span>
                        </span>
                        {r.active_deliveries > 0 && <span className="chip chip-warning">On a job</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
              {riders.data?.length === 0 && <p className="mt-2 text-[13px] text-maxcontrast">Nobody is on shift near you at the moment. Sending still queues the order for the next free rider.</p>}
              <label className="mt-4 block">
                <span className="label">Note for the rider (optional)</span>
                <input maxLength={300} className="field mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Fragile, ring the side door, etc." />
              </label>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label><span className="label">Carrier</span><input required maxLength={40} className="field mt-1" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="DHL, UPS, local post" /></label>
              <label><span className="label">Tracking number</span><input required maxLength={64} pattern="[A-Za-z0-9 \-]{4,64}" className="field mt-1 tabular-nums" value={tracking} onChange={(e) => setTracking(e.target.value)} /></label>
            </div>
          )}
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="btn btn-tertiary">{queued ? "Close" : "Cancel"}</button>
          {!queued && <button disabled={busy} className="btn btn-primary">{busy ? "Sending…" : mode === "rider" ? "Send rider" : "Mark shipped"}</button>}
        </ModalFooter>
      </form>
    </Modal>
  );
}
