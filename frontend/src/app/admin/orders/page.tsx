"use client";
import { useState } from "react";
import { ErrorLine, PageTitle, Table } from "@/components/dash";
import { StatusTag } from "@/components/status-tag";
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
          <div className="flex flex-wrap border border-ink text-[13px]">
            {filters.map(([f, l]) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 ${filter === f ? "bg-ink text-paper" : ""}`}>{l}</button>
            ))}
          </div>
        }
      />
      <ErrorLine error={error ?? msg} />
      <Table head={["Order", "Placed", "Customer", "Stores", "Items", "Total", "Status", ""]}>
        {items.map((o) => (
          <tr key={o.id}>
            <td className="px-3 py-2.5 font-mono text-[13px]">{o.number}</td>
            <td className="px-3 py-2.5">{shortDate(o.created_at)}</td>
            <td className="px-3 py-2.5 text-[13px]">{o.customer_email ?? "Unknown"}</td>
            <td className="px-3 py-2.5 font-mono text-[13px]">{o.stores}</td>
            <td className="px-3 py-2.5 font-mono text-[13px]">{o.item_count}</td>
            <td className="price px-3 py-2.5">{money(o.total_cents, o.currency)}</td>
            <td className="px-3 py-2.5"><StatusTag status={o.status} /></td>
            <td className="space-x-1 whitespace-nowrap px-3 py-2.5 text-right">
              {o.status === "pending_payment" && <button disabled={busy === o.id} onClick={() => setConfirm({ order: o, action: "paid" })} className="btn btn-ghost btn-sm">Mark paid</button>}
              {(o.status === "pending_payment" || o.status === "paid") && <button disabled={busy === o.id} onClick={() => setConfirm({ order: o, action: "cancel" })} className="btn btn-ghost btn-sm text-signal">Cancel</button>}
            </td>
          </tr>
        ))}
        {data && items.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-ink-3">No orders here.</td></tr>}
      </Table>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Confirm">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setConfirm(null)} />
          <div className="relative w-full max-w-md border-2 border-ink bg-paper">
            <div className="border-b border-ink p-4">
              <p className="display text-[28px]">{confirm.action === "paid" ? "Mark" : "Cancel"} {confirm.order.number}{confirm.action === "paid" ? " as paid" : ""}?</p>
            </div>
            <p className="p-4 text-[14px]">
              {confirm.action === "paid"
                ? `Only do this once ${money(confirm.order.total_cents, confirm.order.currency)} has actually reached the market. Every store on the order is told it can ship.`
                : "Stock goes back on the shelf and every store on the order is told. Card payments are refunded automatically; cash and transfers you refund by hand."}
            </p>
            <div className="flex justify-end gap-2 border-t border-ink p-4">
              <button onClick={() => setConfirm(null)} className="btn btn-ghost">Back</button>
              <button disabled={busy === confirm.order.id} onClick={() => run(confirm.order, confirm.action)} className={`btn ${confirm.action === "paid" ? "btn-ink" : "btn-signal"}`}>
                {confirm.action === "paid" ? "Mark paid" : "Cancel order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
