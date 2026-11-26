"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLiveTracking, type LiveEvent } from "@/lib/live";
import type { DeliveryTrack, LatLng, Tracking } from "@/lib/types";
import { DeliveryMap, type MapLine, type MapPin } from "./delivery-map";

const words: Record<string, string> = {
  awaiting_rider: "Waiting for a rider",
  assigned: "Finding your rider",
  accepted: "Rider heading to the store",
  picked_up: "Out for delivery",
  delivered: "Delivered",
  failed: "Delivery attempt failed",
  declined: "Finding another rider",
  canceled: "Delivery called off",
};

function view(t: DeliveryTrack, moving: LatLng | null) {
  const pins: MapPin[] = [];
  const lines: MapLine[] = [];
  if (t.pickup) pins.push({ id: "pickup", kind: "pickup", label: t.pickup.label ?? t.store_name, lat: t.pickup.lat, lng: t.pickup.lng });
  const drop = moving ?? t.dropoff;
  if (drop) pins.push({ id: "dropoff", kind: "dropoff", label: moving ? "Drag me to where the rider should stop" : (t.dropoff?.label ?? "You"), lat: drop.lat, lng: drop.lng, draggable: !!moving });
  const toPickup = t.status === "assigned" || t.status === "accepted";
  if (t.rider_position) {
    pins.push({ id: "rider", kind: "rider", label: t.rider?.name ?? "Rider", lat: t.rider_position.lat, lng: t.rider_position.lng, heading: t.rider_position.heading });
    const next = toPickup ? t.pickup : drop;
    if (next) lines.push({ id: "leg", from: t.rider_position, to: next });
    if (toPickup && t.pickup && drop) lines.push({ id: "next", from: t.pickup, to: drop, done: false });
  } else if (t.pickup && drop) {
    lines.push({ id: "plan", from: t.pickup, to: drop });
  }
  return { pins, lines };
}

export function OrderTracking({ orderId }: { orderId: string }) {
  const { token, ready } = useAuth();
  const [t, setT] = useState<Tracking | null>(null);
  const [gone, setGone] = useState(false);
  const [pick, setPick] = useState<string | null>(null);

  const deliveries = useMemo(() => (t ? (t.deliveries.length ? t.deliveries : [t]) : []), [t]);
  const ids = useMemo(() => deliveries.map((d) => d.delivery_id).filter((x): x is string => !!x), [deliveries]);

  // Live updates over the websocket. Status changes trigger a full reload because they can
  // reveal new fields (the rider's name after acceptance, the handover code).
  const [bump, setBump] = useState(0);
  const onEvent = useCallback((e: LiveEvent) => {
    if (e.type === "status") return setBump((n) => n + 1);
    if (e.type !== "location") return;
    setT((cur) => {
      if (!cur) return cur;
      const move = (d: DeliveryTrack) => (d.delivery_id === e.delivery_id ? { ...d, rider_position: { lat: e.lat, lng: e.lng, at: e.at, heading: e.heading, speed_kmh: e.speed_kmh } } : d);
      return { ...move(cur), order_status: cur.order_status, deliveries: cur.deliveries.map(move) } as Tracking;
    });
  }, []);
  const live = useLiveTracking(token, { deliveryIds: ids }, onEvent);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const load = () =>
      api.tracking(token, orderId)
        .then((x) => alive && (x ? setT(x) : setGone(true)))
        .catch(() => alive && setGone(true));
    load();
    // Polling is the fallback. With the socket up we only refresh now and then.
    const timer = setInterval(load, live ? 60000 : 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [orderId, token, ready, live, bump]);

  const current = deliveries.find((d) => d.delivery_id === pick) ?? deliveries.find((d) => d.status !== "delivered") ?? deliveries[0];
  // Moving the pin: a draft spot on the map until the customer saves it.
  const [moving, setMoving] = useState<LatLng | null>(null);
  const [savingPin, setSavingPin] = useState(false);
  const [riderNote, setRiderNote] = useState("");
  const [pinMsg, setPinMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { pins, lines } = useMemo(() => (current ? view(current, moving) : { pins: [], lines: [] }), [current, moving]);
  const canMove = !!current?.dropoff && !["delivered", "failed", "canceled"].includes(current.status);

  async function savePin() {
    if (!moving) return;
    setSavingPin(true);
    setPinMsg(null);
    try {
      const note = riderNote.trim();
      setT(await api.moveDropoff(token, orderId, { lat: moving.lat, lng: moving.lng, ...(note ? { note } : {}) }));
      setMoving(null);
      setRiderNote("");
      setPinMsg({ ok: true, text: note ? "Pin and note saved. Your rider sees them straight away." : "Pin moved. Your rider sees the new spot straight away." });
    } catch (e) {
      setPinMsg({ ok: false, text: e instanceof ApiError ? e.message : "Couldn't move the pin. Try again." });
    } finally {
      setSavingPin(false);
    }
  }

  if (gone || !t || !current) return null;

  return (
    <section className="mt-10" aria-label="Live delivery tracking">
      {deliveries.length > 1 && (
        <div role="tablist" aria-label="Parcels" className="mb-3 flex flex-wrap gap-2">
          {deliveries.map((d, i) => (
            <button
              key={d.delivery_id ?? i}
              role="tab"
              aria-selected={d === current}
              className={`btn btn-sm ${d === current ? "" : "btn-tertiary"}`}
              onClick={() => setPick(d.delivery_id)}
            >
              {d.store_name || `Parcel ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        {pins.length ? (
          <DeliveryMap
            pins={pins}
            lines={lines}
            follow={current.status === "picked_up" && !moving ? "rider" : undefined}
            onPick={moving ? (p) => setMoving(p) : undefined}
            className="h-[340px] md:h-[400px]"
          />
        ) : (
          <div className="panel flex h-[200px] items-center justify-center p-6 text-center text-[15px] text-maxcontrast">The map appears once a rider takes the job.</div>
        )}
        <div className="card space-y-4 p-5">
          <div>
            <p className="label flex items-center gap-2">
              Live status
              <span className={`inline-block h-2 w-2 rounded-full ${live ? "bg-element-success" : "bg-border-dark"}`} aria-hidden />
              <span className="sr-only">{live ? "connected" : "refreshing every few seconds"}</span>
            </p>
            <p className="heading mt-1 text-[22px]">{words[current.status] ?? current.status.replace(/_/g, " ")}</p>
            {current.store_name && deliveries.length > 1 && <p className="text-[13px] text-maxcontrast">From {current.store_name}</p>}
            {current.eta_minutes !== null && current.status !== "delivered" && <p className="price mt-1 text-[15px]">About {current.eta_minutes} min away</p>}
          </div>
          {current.handover_code && (
            <div className="rounded-container bg-primary-element-light p-4 text-primary-element-light-text">
              <p className="text-[13px] font-medium">Handover code</p>
              <p className="mono mt-0.5 text-[30px] font-semibold tracking-[0.2em]">{current.handover_code}</p>
              <p className="mt-1 text-[13px] opacity-85">Read it to the rider when your parcel is in your hands. Don&apos;t share it before then.</p>
            </div>
          )}
          {current.rider && (
            <div className="border-t border-border pt-4 text-[14px]">
              <p className="label mb-1">Your rider</p>
              <p className="font-semibold">{current.rider.name}</p>
              <p className="text-maxcontrast capitalize">{current.rider.vehicle.replace(/_/g, " ")}{current.rider.phone_masked ? ` · ${current.rider.phone_masked}` : ""}</p>
            </div>
          )}
          {current.rider_position?.at && (
            <p className="text-[13px] text-maxcontrast" suppressHydrationWarning>
              Position updated {new Date(current.rider_position.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              {current.rider_position.speed_kmh != null && current.rider_position.speed_kmh >= 2 && `, moving at ${Math.round(current.rider_position.speed_kmh)} km/h`}
            </p>
          )}
          {canMove && (
            <div className="border-t border-border pt-4 text-[14px]">
              {moving ? (
                <>
                  <p className="mb-2 text-maxcontrast">Drag the pin, or tap the map, to where the rider should stop. A gate or a side door works best.</p>
                  <label className="mb-3 block max-w-md">
                    <span className="label">Note for the rider (optional)</span>
                    <input maxLength={500} autoComplete="off" className="field mt-1" value={riderNote} onChange={(e) => setRiderNote(e.target.value)} placeholder="Blue gate, call when you're outside" />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" disabled={savingPin} onClick={savePin} className="btn btn-primary btn-sm">{savingPin ? "Saving…" : "Save new spot"}</button>
                    <button type="button" disabled={savingPin} onClick={() => setMoving(null)} className="btn btn-tertiary btn-sm">Cancel</button>
                  </div>
                </>
              ) : (
                <button type="button" onClick={() => { setPinMsg(null); setMoving(current.dropoff ? { lat: current.dropoff.lat, lng: current.dropoff.lng } : null); }} className="btn btn-secondary btn-sm">
                  Move the pin or leave a note
                </button>
              )}
              {pinMsg && <p role="status" className={`mt-2 text-[13px] ${pinMsg.ok ? "text-text-success" : "text-text-error"}`}>{pinMsg.text}</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
