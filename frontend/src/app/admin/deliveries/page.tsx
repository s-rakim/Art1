"use client";
import { PageTitle } from "@/components/dash";
import { DeliveriesBoard } from "@/components/deliveries-board";
import { api } from "@/lib/api";

export default function AdminDeliveries() {
  return (
    <>
      <PageTitle kicker="Every store and every rider on shift" title="Live deliveries" />
      <DeliveriesBoard load={(t) => api.adminLive(t)} admin showStore />
    </>
  );
}
