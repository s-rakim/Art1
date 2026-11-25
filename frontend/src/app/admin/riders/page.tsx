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
      {msg && <p role="status" className={`mb-4 border-l-2 pl-3 text-[13px] ${msg.ok ? "border-element-success text-text-success" : "border-element-error text-text-error"}`}>{msg.text}</p>}

      {applicants.length > 0 && (
        <section className="mb-10">
          <p className="label mb-2">Hiring queue</p>
          <ul className="grid gap-3 md:grid-cols-2">
            {applicants.map((r) => (
              <li key={r.id} className="card p-4">
                <p className="heading text-[20px]">{r.full_name}</p>
                <dl className="mt-1 grid grid-cols-[90px_1fr] gap-y-0.5 text-[13px]">
                  <dt className="text-maxcontrast">Vehicle</dt><dd className="capitalize">{r.vehicle.replace(/_/g, " ")}</dd>
                  <dt className="text-maxcontrast">City</dt><dd>{r.city}</dd>
                  <dt className="text-maxcontrast">Phone</dt><dd>{r.phone}</dd>
                  {r.email && <><dt className="text-maxcontrast">Email</dt><dd className="break-all">{r.email}</dd></>}
                  {r.licence_number && <><dt className="text-maxcontrast">Licence</dt><dd className="tabular-nums">{r.licence_number}</dd></>}
                  <dt className="text-maxcontrast">Applied</dt><dd>{shortDate(r.applied_at)}</dd>
                </dl>
                <div className="mt-3 flex gap-2">
                  <button disabled={busy === r.id} onClick={() => setStatus(r, "active")} className="btn btn-primary btn-sm">Hire</button>
                  <button disabled={busy === r.id} onClick={() => { setAsking({ rider: r, status: "rejected" }); setNote(""); }} className="btn btn-tertiary btn-sm">Turn down</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Table head={["Rider", "Vehicle", "City", "On a job", "Delivered", "Status", ""]}>
        {team.map((r) => (
          <tr key={r.id}>
            <td className="px-3 py-2.5">{r.full_name}<span className="block text-[12px] text-maxcontrast">{r.phone}</span></td>
            <td className="px-3 py-2.5 capitalize">{r.vehicle.replace(/_/g, " ")}</td>
            <td className="px-3 py-2.5">{r.city}</td>
            <td className="px-3 py-2.5 tabular-nums text-[13px]">{r.active_deliveries}</td>
            <td className="px-3 py-2.5 tabular-nums text-[13px]">{r.deliveries_completed.toLocaleString("en-US")}</td>
            <td className="px-3 py-2.5">
              {r.status === "active" ? <span className={`chip chip-error ${r.on_shift ? "chip-success" : "chip-primary"}`}>{r.on_shift ? "ON SHIFT" : "OFF SHIFT"}</span> : <StatusTag status={r.status} />}
              {r.position?.at && r.on_shift && <span className="mt-1 block tabular-nums text-[12px] text-maxcontrast" suppressHydrationWarning>seen {new Date(r.position.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>}
            </td>
            <td className="space-x-1 whitespace-nowrap px-3 py-2.5 text-right">
              {r.status === "active" && <button disabled={busy === r.id} onClick={() => settle(r)} className="btn btn-tertiary btn-sm">Mark paid</button>}
              {r.status === "active" ? (
                <button disabled={busy === r.id} onClick={() => { setAsking({ rider: r, status: "suspended" }); setNote(""); }} className="btn btn-tertiary btn-sm text-text-error">Suspend</button>
              ) : (
                <button disabled={busy === r.id} onClick={() => setStatus(r, "active", "")} className="btn btn-tertiary btn-sm">Reinstate</button>
              )}
            </td>
          </tr>
        ))}
        {crew.data && team.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-maxcontrast">No riders hired yet.</td></tr>}
      </Table>
      <p className="mt-2 text-[12px] text-maxcontrast">&ldquo;Mark paid&rdquo; records that you&apos;ve paid a rider everything they&apos;re owed, outside the app.</p>

      {asking && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`${asking.status === "rejected" ? "Turn down" : "Suspend"} ${asking.rider.full_name}`}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setAsking(null)} />
          <form
            className="modal relative w-full max-w-md overflow-hidden"
            onSubmit={(e) => {
              e.preventDefault();
              setStatus(asking.rider, asking.status, note.trim());
            }}
          >
            <div className="border-b border-border p-4">
              <p className="heading text-[20px]">{asking.status === "rejected" ? "Turn down" : "Suspend"} {asking.rider.full_name}</p>
              {asking.status === "suspended" && <p className="text-[13px] text-maxcontrast">They go off shift and can&apos;t take jobs until reinstated.</p>}
            </div>
            <label className="block p-4"><span className="label">Note for the rider</span>
              <textarea required minLength={5} maxLength={500} rows={3} className="field mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="flex justify-end gap-2 border-t border-border p-4">
              <button type="button" onClick={() => setAsking(null)} className="btn btn-tertiary">Cancel</button>
              <button disabled={busy === asking.rider.id} className="btn btn-primary">{asking.status === "rejected" ? "Turn down" : "Suspend"}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
