"use client";
import { useState } from "react";
import { ErrorLine, PageTitle, Table } from "@/components/dash";
import { StatusTag } from "@/components/status-tag";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api, ApiError } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import type { AdminOrder } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const filters = [["all", "All"], ["pending_payment", "Awaiting payment"], ["paid", "Paid"], ["fulfilled", "Delivered"], ["canceled", "Cancelled"]] as const;

export default function AdminOrders() {
  const { data, setData, error, token } = useApi((t) => api.adminOrders(t));
  const [filter, setFilter] = useState<(typeof filters)[number][0]>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ order: AdminOrder; action: "paid" | "cancel" } | null>(null);

  async function run(o: AdminOrder, action: "paid" | "cancel") {
    setBusy(o.id);
    setMsg(null);
    try {
      const r = action === "paid" ? await api.adminMarkPaid(token, o.id) : await api.adminCancelOrder(token, o.id);
      const status = r?.status ?? (action === "paid" ? "paid" : "canceled");
      setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === o.id ? { ...x, status } : x)) } : d));
      setConfirm(null);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "That didn't go through.");
    } finally {
      setBusy(null);
    }
  }

  const items = (data?.items ?? []).filter((o) => filter === "all" || o.status === filter || (filter === "paid" && o.status === "partially_fulfilled"));

  return (
    <>
      <PageTitle
        title="Orders"
        kicker={`${data?.total ?? 0} across all stores`}
        action={
          <div className="rounded-element flex flex-wrap border border-border-dark text-[13px]">
            {filters.map(([f, l]) => (
              <button key={f} onClick={() => setFilter(f)} className={`h-[32px] px-3 font-medium ${filter === f ? "bg-primary-element-light font-semibold text-primary-element-light-text" : "hover:bg-background-hover"}`}>{l}</button>
            ))}
          </div>
        }
      />
      <ErrorLine error={error ?? msg} />
      <Table head={["Order", "Placed", "Customer", "Stores", "Items", "Total", "Status", ""]}>
        {items.map((o) => (
          <tr key={o.id}>
            <td className="px-3 py-2.5 tabular-nums text-[13px]">{o.number}</td>
            <td className="px-3 py-2.5">{shortDate(o.created_at)}</td>
            <td className="px-3 py-2.5 text-[13px]">{o.customer_email ?? "Unknown"}</td>
            <td className="px-3 py-2.5 tabular-nums text-[13px]">{o.stores}</td>
            <td className="px-3 py-2.5 tabular-nums text-[13px]">{o.item_count}</td>
            <td className="price px-3 py-2.5">{money(o.total_cents, o.currency)}</td>
            <td className="px-3 py-2.5"><StatusTag status={o.status} /></td>
            <td className="space-x-1 whitespace-nowrap px-3 py-2.5 text-right">
              {o.status === "pending_payment" && <button disabled={busy === o.id} onClick={() => setConfirm({ order: o, action: "paid" })} className="btn btn-tertiary btn-sm">Mark paid</button>}
              {(o.status === "pending_payment" || o.status === "paid") && <button disabled={busy === o.id} onClick={() => setConfirm({ order: o, action: "cancel" })} className="btn btn-tertiary btn-sm text-text-error">Cancel</button>}
            </td>
          </tr>
        ))}
        {data && items.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-maxcontrast">No orders here.</td></tr>}
      </Table>

      <ConfirmDialog
        open={!!confirm}
        title={confirm ? `${confirm.action === "paid" ? "Mark" : "Cancel"} ${confirm.order.number}${confirm.action === "paid" ? " as paid" : ""}?` : ""}
        confirm={confirm?.action === "paid" ? "Mark paid" : "Cancel order"}
        cancel="Back"
        tone={confirm?.action === "paid" ? "primary" : "error"}
        busy={!!confirm && busy === confirm.order.id}
        onConfirm={() => confirm && run(confirm.order, confirm.action)}
        onClose={() => setConfirm(null)}
      >
        {confirm?.action === "paid"
          ? `Only do this once ${money(confirm.order.total_cents, confirm.order.currency)} has actually reached the market. Every store on the order is told it can ship.`
          : "Stock goes back on the shelf and every store on the order is told. Card payments are refunded automatically; cash and transfers you refund by hand."}
      </ConfirmDialog>
    </>
  );
}
