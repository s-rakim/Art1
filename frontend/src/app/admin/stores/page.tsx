"use client";
import Link from "next/link";
import { useState } from "react";
import { ErrorLine, PageTitle, Table } from "@/components/dash";
import { api, ApiError } from "@/lib/api";
import { shortDate } from "@/lib/format";
import { safeColor } from "@/lib/safe";
import type { Store } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function AdminStores() {
  const { data, setData, error, token } = useApi((t) => api.adminStores(t));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function update(s: Store, body: { status?: Store["status"]; verified?: boolean }, ask?: string) {
    if (ask && !window.confirm(ask)) return;
    setBusy(s.id);
    setMsg(null);
    try {
      const r = await api.adminUpdateStore(token, s.id, body);
      setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === s.id ? { ...x, ...r } : x)) } : d));
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  }

  const pending = (data?.items ?? []).filter((s) => s.status === "pending");
  const rest = (data?.items ?? []).filter((s) => s.status !== "pending");

  return (
    <>
      <PageTitle title="Stores" kicker={`${rest.filter((s) => s.status === "active").length} trading · ${pending.length} waiting`} />
      <ErrorLine error={error ?? msg} />
      {pending.length > 0 && (
        <section className="mb-8">
          <p className="label mb-2">Stall applications</p>
          <ul className="grid gap-3 md:grid-cols-2">
            {pending.map((s) => (
              <li key={s.id} className="border-2 border-ink bg-card">
                <div className="flex items-center gap-3 p-4" style={{ background: safeColor(s.banner_color), color: safeColor(s.accent_color, "#f4f0e6") }}>
                  <span className="display text-[28px]">{s.name}</span>
                </div>
                <div className="space-y-1 p-4 text-[14px]">
                  <p>{s.description}</p>
                  <p className="text-ink-3">{s.country} · {s.plan} plan · applied {shortDate(s.joined_at)}</p>
                </div>
                <div className="flex gap-2 border-t border-rule p-3">
                  <button disabled={busy === s.id} onClick={() => update(s, { status: "active" })} className="btn btn-ink btn-sm">Approve stall</button>
                  <button disabled={busy === s.id} onClick={() => update(s, { status: "suspended" }, `Reject ${s.name}?`)} className="btn btn-ghost btn-sm">Reject</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Table head={["Store", "Plan", "Country", "Items", "Rating", "Status", ""]}>
        {rest.map((s) => (
          <tr key={s.id}>
            <td className="px-3 py-2.5"><Link className="hover:underline" href={`/s/${s.slug}`}>{s.name}</Link>{s.verified && <span className="ml-2 text-market">✓</span>}</td>
            <td className="px-3 py-2.5 capitalize">{s.plan}</td>
            <td className="px-3 py-2.5">{s.country}</td>
            <td className="px-3 py-2.5 font-mono text-[13px]">{s.product_count}</td>
            <td className="px-3 py-2.5 font-mono text-[13px]">★ {s.rating.toFixed(1)}</td>
            <td className="px-3 py-2.5"><span className={`ticket ${s.status === "active" ? "ticket-market" : ""}`}>{s.status.toUpperCase()}</span></td>
            <td className="space-x-1 px-3 py-2.5 text-right whitespace-nowrap">
              <button disabled={busy === s.id} onClick={() => update(s, { verified: !s.verified })} className="btn btn-ghost btn-sm">{s.verified ? "Unverify" : "Verify"}</button>
              {s.status === "active" ? (
                <button disabled={busy === s.id} onClick={() => update(s, { status: "suspended" }, `Suspend ${s.name}? Their listings disappear immediately.`)} className="btn btn-ghost btn-sm text-signal">Suspend</button>
              ) : (
                <button disabled={busy === s.id} onClick={() => update(s, { status: "active" })} className="btn btn-ghost btn-sm">Reinstate</button>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
