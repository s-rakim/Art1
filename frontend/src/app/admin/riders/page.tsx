"use client";
import { useState } from "react";
import { ErrorLine, PageTitle, Table } from "@/components/dash";
import { StatusTag } from "@/components/status-tag";
import { api, ApiError } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import type { Rider } from "@/lib/types";
import { useApi } from "@/lib/use-api";

type Next = "active" | "suspended" | "rejected";

export default function AdminRiders() {
  const crew = useApi((t) => api.adminRiders(t));
  const apps = useApi((t) => api.adminRiderApplications(t));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [asking, setAsking] = useState<{ rider: Rider; status: Next } | null>(null);
  const [note, setNote] = useState("");

  async function setStatus(r: Rider, status: Next, review_note?: string) {
    setBusy(r.id);
    setMsg(null);
    try {
      await api.adminUpdateRider(crew.token, r.id, status, review_note);
      crew.reload();
      apps.reload();
      setAsking(null);
      setNote("");
      if (status === "active" && r.status === "applicant") setMsg({ ok: true, text: `${r.full_name} is hired and can go on shift now.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Update failed." });
    } finally {
      setBusy(null);
    }
  }

  async function settle(r: Rider) {
    setBusy(r.id);
    setMsg(null);
    try {
      const res = await api.adminSettleRider(crew.token, r.id);
      setMsg({ ok: true, text: res.paid_cents ? `Recorded ${money(res.paid_cents)} paid to ${r.full_name}.` : `${r.full_name} had nothing owing.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Couldn't record that payment." });
    } finally {
      setBusy(null);
    }
  }

  const applicants = apps.data?.items ?? [];
  const team = crew.data?.items ?? [];

  return (
    <>
      <PageTitle title="Riders" kicker={`${team.filter((r) => r.on_shift && r.status === "active").length} on shift now · ${applicants.length} applying`} />
      <ErrorLine error={crew.error ?? apps.error} />
      {msg && <p role="status" className={`mb-4 border-l-2 pl-3 text-[13px] ${msg.ok ? "border-market text-market" : "border-signal text-signal"}`}>{msg.text}</p>}

      {applicants.length > 0 && (
        <section className="mb-10">
          <p className="label mb-2">Hiring queue</p>
          <ul className="grid gap-3 md:grid-cols-2">
            {applicants.map((r) => (
              <li key={r.id} className="border-2 border-ink bg-card p-4">
                <p className="display text-[28px]">{r.full_name}</p>
                <dl className="mt-1 grid grid-cols-[90px_1fr] gap-y-0.5 text-[13px]">
                  <dt className="text-ink-3">Vehicle</dt><dd className="capitalize">{r.vehicle.replace(/_/g, " ")}</dd>
                  <dt className="text-ink-3">City</dt><dd>{r.city}</dd>
                  <dt className="text-ink-3">Phone</dt><dd>{r.phone}</dd>
                  {r.email && <><dt className="text-ink-3">Email</dt><dd className="break-all">{r.email}</dd></>}
                  {r.licence_number && <><dt className="text-ink-3">Licence</dt><dd className="font-mono">{r.licence_number}</dd></>}
                  <dt className="text-ink-3">Applied</dt><dd>{shortDate(r.applied_at)}</dd>
                </dl>
                <div className="mt-3 flex gap-2">
                  <button disabled={busy === r.id} onClick={() => setStatus(r, "active")} className="btn btn-ink btn-sm">Hire</button>
                  <button disabled={busy === r.id} onClick={() => { setAsking({ rider: r, status: "rejected" }); setNote(""); }} className="btn btn-ghost btn-sm">Turn down</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Table head={["Rider", "Vehicle", "City", "On a job", "Delivered", "Status", ""]}>
        {team.map((r) => (
          <tr key={r.id}>
            <td className="px-3 py-2.5">{r.full_name}<span className="block text-[12px] text-ink-3">{r.phone}</span></td>
            <td className="px-3 py-2.5 capitalize">{r.vehicle.replace(/_/g, " ")}</td>
            <td className="px-3 py-2.5">{r.city}</td>
            <td className="px-3 py-2.5 font-mono text-[13px]">{r.active_deliveries}</td>
            <td className="px-3 py-2.5 font-mono text-[13px]">{r.deliveries_completed.toLocaleString("en-US")}</td>
            <td className="px-3 py-2.5">
              {r.status === "active" ? <span className={`ticket ${r.on_shift ? "ticket-market" : "ticket-ink"}`}>{r.on_shift ? "ON SHIFT" : "OFF SHIFT"}</span> : <StatusTag status={r.status} />}
              {r.position?.at && r.on_shift && <span className="mt-1 block font-mono text-[11px] text-ink-3" suppressHydrationWarning>seen {new Date(r.position.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>}
            </td>
            <td className="space-x-1 whitespace-nowrap px-3 py-2.5 text-right">
              {r.status === "active" && <button disabled={busy === r.id} onClick={() => settle(r)} className="btn btn-ghost btn-sm">Mark paid</button>}
              {r.status === "active" ? (
                <button disabled={busy === r.id} onClick={() => { setAsking({ rider: r, status: "suspended" }); setNote(""); }} className="btn btn-ghost btn-sm text-signal">Suspend</button>
              ) : (
                <button disabled={busy === r.id} onClick={() => setStatus(r, "active", "")} className="btn btn-ghost btn-sm">Reinstate</button>
              )}
            </td>
          </tr>
        ))}
        {crew.data && team.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-ink-3">No riders hired yet.</td></tr>}
      </Table>
      <p className="mt-2 text-[12px] text-ink-3">&ldquo;Mark paid&rdquo; records that you&apos;ve paid a rider everything they&apos;re owed, outside the app.</p>

      {asking && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`${asking.status === "rejected" ? "Turn down" : "Suspend"} ${asking.rider.full_name}`}>
          <div className="absolute inset-0 bg-ink/40" onClick={() => setAsking(null)} />
          <form
            className="relative w-full max-w-md border-2 border-ink bg-paper"
            onSubmit={(e) => {
              e.preventDefault();
              setStatus(asking.rider, asking.status, note.trim());
            }}
          >
            <div className="border-b border-ink p-4">
              <p className="display text-[28px]">{asking.status === "rejected" ? "Turn down" : "Suspend"} {asking.rider.full_name}</p>
              {asking.status === "suspended" && <p className="text-[13px] text-ink-3">They go off shift and can&apos;t take jobs until reinstated.</p>}
            </div>
            <label className="block p-4"><span className="label">Note for the rider</span>
              <textarea required minLength={5} maxLength={500} rows={3} className="field mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="flex justify-end gap-2 border-t border-ink p-4">
              <button type="button" onClick={() => setAsking(null)} className="btn btn-ghost">Cancel</button>
              <button disabled={busy === asking.rider.id} className="btn btn-signal">{asking.status === "rejected" ? "Turn down" : "Suspend"}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
