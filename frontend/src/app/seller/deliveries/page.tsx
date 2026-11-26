"use client";
import Link from "next/link";
import { Clock, Truck } from "@/components/icons";
import { DeliveriesBoard } from "@/components/deliveries-board";
import { GlassStage, Metric } from "@/components/ui/glass-dashboard";
import { api } from "@/lib/api";

const ROAD = new Set(["assigned", "accepted", "picked_up", "arrived"]);
const n = (v: number) => String(Math.round(v));

export default function SellerDeliveries() {
  return (
    <GlassStage
      kicker="Your parcels on the road"
      title="Dispatch and map"
      actions={<Link href="/seller/orders" className="gd-btn gd-btn-primary">Dispatch an order</Link>}
    >
      <DeliveriesBoard
        load={(t) => api.sellerDeliveries(t).then((p) => ({ deliveries: p.items }))}
        onCancel={(t, id) => api.cancelDelivery(t, id)}
        summary={({ deliveries }) => {
          const waiting = deliveries.filter((d) => d.status === "awaiting_rider").length;
          return (
            <div className="gd-metrics">
              <Metric i={0} tone="accent" label="On the road" icon={<Truck size={16} />} value={deliveries.filter((d) => ROAD.has(d.status)).length} format={n} note="with a rider now" />
              <Metric i={1} tone={waiting ? "attention" : undefined} label="Waiting for a rider" icon={<Clock size={16} />} value={waiting} format={n} note="goes to the first rider free" />
            </div>
          );
        }}
      />
    </GlassStage>
  );
}
