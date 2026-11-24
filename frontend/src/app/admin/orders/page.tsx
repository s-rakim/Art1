"use client";
import { ErrorLine, PageTitle, Table } from "@/components/dash";
import { StatusTag } from "@/components/status-tag";
import { api } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import { useApi } from "@/lib/use-api";

export default function AdminOrders() {
  const { data, error } = useApi((t) => api.adminOrders(t));
  return (
    <>
      <PageTitle title="Orders" kicker={`${data?.total ?? 0} across all stores`} />
      <ErrorLine error={error} />
      <Table head={["Order", "Placed", "Customer", "Stores", "Total", "Status"]}>
        {(data?.items ?? []).map((o) => (
          <tr key={o.id}>
            <td className="px-3 py-2.5 font-mono text-[13px]">{o.number}</td>
            <td className="px-3 py-2.5">{shortDate(o.created_at)}</td>
            <td className="px-3 py-2.5">{o.customer_email ?? o.shipping_address.full_name}</td>
            <td className="px-3 py-2.5 text-[13px]">{[...new Set(o.lines.map((l) => l.store_name))].join(", ")}</td>
            <td className="price px-3 py-2.5">{money(o.total_cents, o.currency)}</td>
            <td className="px-3 py-2.5"><StatusTag status={o.status} /></td>
          </tr>
        ))}
      </Table>
    </>
  );
}
