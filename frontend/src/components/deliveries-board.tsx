"use client";
import { useEffect, useMemo, useState } from "react";
import type { Delivery, Paged } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { money } from "@/lib/format";
import { DeliveryMap, type MapLine, type MapPin } from "./delivery-map";
import { ErrorLine } from "./dash";

const label: Record<Delivery["status"], string> = {
  awaiting_rider: "Needs a rider", assigned: "Assigned", accepted: "To store", picked_up: "Out for delivery", delivered: "Delivered", failed: "Failed",
};

export function DeliveriesBoard({ load, showStore = false }: { load: (token: string | null) => Promise<Paged<Delivery>>; showStore?: boolean }) {
  const { data, error, reload } = useApi(load);
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(reload, 15000);
    return () => clearInterval(t);
  }, [reload]);

  const active = useMemo(() => (data?.items ?? []).filter((d) => d.status !== "delivered"), [data]);
  const { pins, lines } = useMemo(() => {
    const pins: MapPin[] = [];
    const lines: MapLine[] = [];
    for (const d of active) {
      if (focus && focus !== d.id) continue;
      pins.push({ id: `${d.id}-p`, kind: "pickup", label: `${d.store_name}: ${d.pickup.label}`, lat: d.pickup.lat, lng: d.pickup.lng });
      pins.push({ id: `${d.id}-d`, kind: "dropoff", label: `${d.order_number}: ${d.dropoff.label}`, lat: d.dropoff.lat, lng: d.dropoff.lng });
      if (d.rider_position) {
        pins.push({ id: `${d.id}-r`, kind: "rider", label: d.rider?.full_name ?? "Rider", lat: d.rider_position.lat, lng: d.rider_position.lng });
        lines.push({ id: d.id, from: d.rider_position, to: d.status === "picked_up" ? d.dropoff : d.pickup });
      } else {
        lines.push({ id: d.id, from: d.pickup, to: d.dropoff });
      }
    }
    return { pins, lines };
  }, [active, focus]);

  return (
    <>
      <ErrorLine error={error} />
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <DeliveryMap pins={pins} lines={lines} className="h-[420px] xl:h-[560px]" />
        <ul className="max-h-[560px] divide-y divide-rule overflow-y-auto border border-ink bg-card">
          {focus && (
            <li><button onClick={() => setFocus(null)} className="w-full px-4 py-2 text-left text-[13px] underline">Show all deliveries</button></li>
          )}
          {active.map((d) => (
            <li key={d.id}>
              <button onClick={() => setFocus(d.id)} className={`w-full px-4 py-3 text-left text-[14px] hover:bg-paper-2 ${focus === d.id ? "bg-paper-2" : ""}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[13px]">{d.order_number}</span>
                  <span className={`ticket ${d.status === "awaiting_rider" ? "" : d.status === "picked_up" ? "ticket-market" : "ticket-ink"}`}>{label[d.status].toUpperCase()}</span>
                </span>
                {showStore && <span className="mt-1 block text-[12px] text-ink-3">{d.store_name}</span>}
                <span className="mt-1 block text-[13px]">{d.pickup.label} → {d.dropoff.label}</span>
                <span className="mt-1 block text-[12px] text-ink-3">
                  {d.rider ? `${d.rider.full_name} (${d.rider.vehicle})` : "No rider yet"}
                  {d.eta_minutes !== null && ` · ETA ${d.eta_minutes} min`} · fee {money(d.fee_cents)}
                </span>
              </button>
            </li>
          ))}
          {active.length === 0 && <li className="px-4 py-8 text-center text-[14px] text-ink-3">No deliveries on the road.</li>}
        </ul>
      </div>
    </>
  );
}
