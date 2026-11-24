"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLiveTracking, type LiveEvent } from "@/lib/live";
import type { DeliveryTrack, Tracking } from "@/lib/types";
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

function view(t: DeliveryTrack) {
  const pins: MapPin[] = [];
  const lines: MapLine[] = [];
  if (t.pickup) pins.push({ id: "pickup", kind: "pickup", label: t.pickup.label ?? t.store_name, lat: t.pickup.lat, lng: t.pickup.lng });
  if (t.dropoff) pins.push({ id: "dropoff", kind: "dropoff", label: t.dropoff.label ?? "You", lat: t.dropoff.lat, lng: t.dropoff.lng });
  const toPickup = t.status === "assigned" || t.status === "accepted";
  if (t.rider_position) {
    pins.push({ id: "rider", kind: "rider", label: t.rider?.name ?? "Rider", lat: t.rider_position.lat, lng: t.rider_position.lng });
    const next = toPickup ? t.pickup : t.dropoff;
    if (next) lines.push({ id: "leg", from: t.rider_position, to: next });
    if (toPickup && t.pickup && t.dropoff) lines.push({ id: "next", from: t.pickup, to: t.dropoff, done: false });
  } else if (t.pickup && t.dropoff) {
    lines.push({ id: "plan", from: t.pickup, to: t.dropoff });
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
      const move = (d: DeliveryTrack) => (d.delivery_id === e.delivery_id ? { ...d, rider_position: { lat: e.lat, lng: e.lng, at: e.at } } : d);
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
  const { pins, lines } = useMemo(() => (current ? view(current) : { pins: [], lines: [] }), [current]);

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
              className={`btn btn-sm ${d === current ? "btn-ink" : "btn-line"}`}
              onClick={() => setPick(d.delivery_id)}
            >
              {d.store_name || `Parcel ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        {pins.length ? (
          <DeliveryMap pins={pins} lines={lines} follow={current.status === "picked_up" ? "rider" : undefined} className="h-[340px] md:h-[400px]" />
        ) : (
          <div className="flex h-[200px] items-center justify-center border border-dashed border-rule text-[14px] text-ink-3">The map appears once a rider takes the job.</div>
        )}
        <div className="space-y-4 border border-ink bg-card p-5">
          <div>
            <p className="label flex items-center gap-2">
              Live status
              <span className={`inline-block h-2 w-2 ${live ? "bg-market" : "bg-rule"}`} aria-hidden />
              <span className="sr-only">{live ? "connected" : "refreshing every few seconds"}</span>
            </p>
            <p className="display mt-1 text-[30px]">{words[current.status] ?? current.status.replace(/_/g, " ")}</p>
            {current.store_name && deliveries.length > 1 && <p className="text-[13px] text-ink-3">From {current.store_name}</p>}
            {current.eta_minutes !== null && current.status !== "delivered" && <p className="price mt-1 text-[15px]">About {current.eta_minutes} min away</p>}
          </div>
          {current.handover_code && (
            <div className="border-2 border-ink bg-paper p-3">
              <p className="label">Handover code</p>
              <p className="mt-1 font-mono text-[28px] font-semibold tracking-[0.25em]">{current.handover_code}</p>
              <p className="mt-1 text-[12px] text-ink-3">Read it to the rider when your parcel is in your hands. Don&apos;t share it before then.</p>
            </div>
          )}
          {current.rider && (
            <div className="border-t border-rule pt-4 text-[14px]">
              <p className="label mb-1">Your rider</p>
              <p className="font-semibold">{current.rider.name}</p>
              <p className="text-ink-3 capitalize">{current.rider.vehicle.replace(/_/g, " ")}{current.rider.phone_masked ? ` · ${current.rider.phone_masked}` : ""}</p>
            </div>
          )}
          {current.rider_position?.at && (
            <p className="font-mono text-[11px] text-ink-3" suppressHydrationWarning>
              Position updated {new Date(current.rider_position.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
