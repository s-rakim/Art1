"use client";
import { useState } from "react";
import { ErrorLine, PageTitle, Table } from "@/components/dash";
import { api, ApiError } from "@/lib/api";
import { shortDate } from "@/lib/format";
import type { Rider } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function AdminRiders() {
  const { data, setData, error, token } = useApi((t) => api.adminRiders(t));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function setStatus(r: Rider, status: Rider["status"], ask?: string) {
    if (ask && !window.confirm(ask)) return;
    setBusy(r.id);
    setMsg(null);
    try {
      const res = await api.adminUpdateRider(token, r.id, status);
      setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === r.id ? { ...x, status: res.status } : x)) } : d));
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  }

  const applicants = (data?.items ?? []).filter((r) => r.status === "applied");
  const crew = (data?.items ?? []).filter((r) => r.status !== "applied");

  return (
    <>
      <PageTitle title="Riders" kicker={`${crew.filter((r) => r.on_shift && r.status === "active").length} on shift now · ${applicants.length} applying`} />
      <ErrorLine error={error ?? msg} />
      {applicants.length > 0 && (
        <section className="mb-8">
          <p className="label mb-2">Hiring queue</p>
          <ul className="grid gap-3 md:grid-cols-2">
            {applicants.map((r) => (
              <li key={r.id} className="border-2 border-ink bg-card p-4">
                <p className="display text-[28px]">{r.full_name}</p>
                <p className="text-[14px] capitalize text-ink-2">{r.vehicle} · {r.city} · {r.phone_masked}</p>
                <p className="text-[12px] text-ink-3">Applied {shortDate(r.applied_at)}</p>
                <div className="mt-3 flex gap-2">
                  <button disabled={busy === r.id} onClick={() => setStatus(r, "active", `Hire ${r.full_name}? They'll be able to accept deliveries straight away.`)} className="btn btn-ink btn-sm">Hire</button>
                  <button disabled={busy === r.id} onClick={() => setStatus(r, "rejected", `Turn down ${r.full_name}?`)} className="btn btn-ghost btn-sm">Turn down</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Table head={["Rider", "Vehicle", "City", "Deliveries", "Rating", "Status", ""]}>
        {crew.map((r) => (
          <tr key={r.id}>
            <td className="px-3 py-2.5">{r.full_name}<span className="block text-[12px] text-ink-3">{r.phone_masked}</span></td>
            <td className="px-3 py-2.5 capitalize">{r.vehicle}</td>
            <td className="px-3 py-2.5">{r.city}</td>
            <td className="px-3 py-2.5 font-mono text-[13px]">{r.deliveries_completed.toLocaleString("en-US")}</td>
            <td className="px-3 py-2.5 font-mono text-[13px]">{r.rating ? `★ ${r.rating.toFixed(2)}` : "—"}</td>
            <td className="px-3 py-2.5">
              <span className={`ticket ${r.status === "active" ? (r.on_shift ? "ticket-market" : "ticket-ink") : ""}`}>{r.status === "active" ? (r.on_shift ? "ON SHIFT" : "OFF SHIFT") : r.status.toUpperCase()}</span>
            </td>
            <td className="px-3 py-2.5 text-right">
              {r.status === "active" ? (
                <button disabled={busy === r.id} onClick={() => setStatus(r, "suspended", `Suspend ${r.full_name}?`)} className="btn btn-ghost btn-sm text-signal">Suspend</button>
              ) : (
                <button disabled={busy === r.id} onClick={() => setStatus(r, "active")} className="btn btn-ghost btn-sm">Reinstate</button>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
