"use client";
import { PageTitle } from "@/components/dash";
import { DeliveriesBoard } from "@/components/deliveries-board";
import { api } from "@/lib/api";

export default function AdminDeliveries() {
  return (
    <>
      <PageTitle kicker="Every store, refreshes every 15 seconds" title="Live deliveries" />
      <DeliveriesBoard load={(t) => api.adminDeliveries(t)} showStore />
    </>
  );
}
