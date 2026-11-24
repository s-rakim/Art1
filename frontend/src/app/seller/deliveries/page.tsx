"use client";
import Link from "next/link";
import { PageTitle } from "@/components/dash";
import { DeliveriesBoard } from "@/components/deliveries-board";
import { api } from "@/lib/api";

export default function SellerDeliveries() {
  return (
    <>
      <PageTitle kicker="Your parcels on the road" title="Dispatch & map" action={<Link href="/seller/orders" className="btn btn-signal btn-sm">Dispatch an order</Link>} />
      <DeliveriesBoard load={(t) => api.sellerDeliveries(t).then((p) => ({ deliveries: p.items }))} onCancel={(t, id) => api.cancelDelivery(t, id)} />
    </>
  );
}
