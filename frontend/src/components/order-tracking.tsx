"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Tracking } from "@/lib/types";
import { DeliveryMap, type MapLine, type MapPin } from "./delivery-map";

const words: Record<Tracking["status"], string> = {
  awaiting_rider: "Waiting for a rider",
  assigned: "Rider assigned",
  accepted: "Rider heading to the store",
  picked_up: "Out for delivery",
  delivered: "Delivered",
  failed: "Delivery attempt failed",
};

export function OrderTracking({ orderId }: { orderId: string }) {
  const { token, ready } = useAuth();
  const [t, setT] = useState<Tracking | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const load = () =>
      api.tracking(token, orderId)
        .then((x) => alive && (x ? setT(x) : setGone(true)))
        .catch(() => alive && setGone(true));
    load();
    const timer = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [orderId, token, ready]);

  const { pins, lines } = useMemo(() => {
    if (!t) return { pins: [] as MapPin[], lines: [] as MapLine[] };
    const pins: MapPin[] = [
      { id: "pickup", kind: "pickup", label: t.pickup.label, lat: t.pickup.lat, lng: t.pickup.lng },
      { id: "dropoff", kind: "dropoff", label: t.dropoff.label, lat: t.dropoff.lat, lng: t.dropoff.lng },
    ];
    const lines: MapLine[] = [];
    if (t.rider_position) {
      pins.push({ id: "rider", kind: "rider", label: t.rider?.full_name ?? "Rider", lat: t.rider_position.lat, lng: t.rider_position.lng });
      const toPickup = t.status === "assigned" || t.status === "accepted";
      lines.push({ id: "leg", from: t.rider_position, to: toPickup ? t.pickup : t.dropoff });
      if (toPickup) lines.push({ id: "next", from: t.pickup, to: t.dropoff, done: false });
    } else {
      lines.push({ id: "plan", from: t.pickup, to: t.dropoff });
    }
    return { pins, lines };
  }, [t]);

  if (gone || !t) return null;

  return (
    <section className="mt-10 grid gap-4 md:grid-cols-[1fr_280px]" aria-label="Live delivery tracking">
      <DeliveryMap pins={pins} lines={lines} follow={t.status === "picked_up" ? "rider" : undefined} className="h-[340px] md:h-[400px]" />
      <div className="space-y-4 border border-ink bg-card p-5">
        <div>
          <p className="label">Live status</p>
          <p className="display mt-1 text-[30px]">{words[t.status]}</p>
          {t.eta_minutes !== null && t.status !== "delivered" && <p className="price mt-1 text-[15px]">About {t.eta_minutes} min away</p>}
        </div>
        {t.rider && (
          <div className="border-t border-rule pt-4 text-[14px]">
            <p className="label mb-1">Your rider</p>
            <p className="font-semibold">{t.rider.full_name}</p>
            <p className="text-ink-3 capitalize">{t.rider.vehicle} · {t.rider.phone_masked}</p>
          </div>
        )}
        {t.rider_position && (
          <p className="font-mono text-[11px] text-ink-3" suppressHydrationWarning>
            Position updated {new Date(t.rider_position.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </p>
        )}
      </div>
    </section>
  );
}
