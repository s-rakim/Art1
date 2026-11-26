"use client";
import { Bike, Clock, Truck } from "@/components/icons";
import { DeliveriesBoard } from "@/components/deliveries-board";
import { GlassStage, Metric } from "@/components/ui/glass-dashboard";
import { api } from "@/lib/api";

const ROAD = new Set(["assigned", "accepted", "picked_up", "arrived"]);
const n = (v: number) => String(Math.round(v));

export default function AdminDeliveries() {
  return (
    <GlassStage kicker="Admin console" title="Live deliveries" description="Every store's parcels and every rider on shift, as they move.">
      <DeliveriesBoard
        load={(t) => api.adminLive(t)}
        admin
        showStore
        summary={({ deliveries, riders = [] }) => {
          const waiting = deliveries.filter((d) => d.status === "awaiting_rider").length;
          return (
            <div className="gd-metrics">
              <Metric i={0} tone="accent" label="On the road" icon={<Truck size={16} />} value={deliveries.filter((d) => ROAD.has(d.status)).length} format={n} note="deliveries" />
              <Metric i={1} tone={waiting ? "attention" : undefined} label="Waiting for a rider" icon={<Clock size={16} />} value={waiting} format={n} note="sent to the first rider free" />
              <Metric i={2} label="Riders on shift" icon={<Bike size={16} />} value={riders.length} format={n} note={`${riders.filter((r) => !r.busy).length} free right now`} />
            </div>
          );
        }}
      />
    </GlassStage>
  );
}
