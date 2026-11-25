"use client";
import Link from "next/link";
import { useState } from "react";
import { ErrorLine, PageTitle, Table } from "@/components/dash";
import { StatusTag } from "@/components/status-tag";
import { api, ApiError } from "@/lib/api";
import { shortDate } from "@/lib/format";
import type { AdminStore } from "@/lib/types";
import { useApi } from "@/lib/use-api";

type Change = { status?: "active" | "suspended" | "rejected"; plan_code?: string; review_note?: string };
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

export default function AdminStores() {
  const { data, setData, error, token } = useApi((t) => api.adminStores(t));
  const plans = useApi((t) => api.adminPlans(t));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ store: AdminStore; status: "suspended" | "rejected" } | null>(null);
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");

  async function update(s: AdminStore, body: Change) {
    setBusy(s.id);
    setMsg(null);
    try {
      const r = await api.adminUpdateStore(token, s.id, body);
      setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === s.id ? { ...x, ...r, application: r.application ?? x.application } : x)) } : d));
      setAsking(null);
      setNote("");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  }

  const all = data?.items ?? [];
  const pending = all.filter((s) => s.status === "pending");
  const rest = all.filter((s) => s.status !== "pending" && `${s.name} ${s.slug} ${s.owner_email ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const planName = (code: string) => plans.data?.find((p) => p.code === code)?.name ?? code;

  return (
    <>
      <PageTitle title="Stores" kicker={`${all.filter((s) => s.status === "active").length} trading · ${pending.length} waiting for review`} />
      <ErrorLine error={error ?? msg} />

      {pending.length > 0 && (
        <section className="mb-10">
          <p className="label mb-2">Stall applications</p>
          <ul className="grid gap-3 lg:grid-cols-2">
            {pending.map((s) => {
              const biz = (s.application?.business ?? {}) as Record<string, unknown>;
              const site = str(biz.website);
              return (
                <li key={s.id} className="card flex flex-col">
                  <div className="flex items-center justify-between gap-3 border-b border-border p-4">
                    <span className="heading text-[20px]">{s.name}</span>
                    <span className="tabular-nums text-[12px] text-maxcontrast">/s/{s.slug}</span>
                  </div>
                  <dl className="grid flex-1 grid-cols-[130px_1fr] gap-x-3 gap-y-1 p-4 text-[13px]">
                    <dt className="text-maxcontrast">Owner</dt><dd className="break-all">{s.owner_email ?? "Unknown"}</dd>
                    <dt className="text-maxcontrast">Business</dt><dd>{str(biz.legal_name) ?? "Not given"}</dd>
                    {str(biz.registration_number) && <><dt className="text-maxcontrast">Registration</dt><dd className="tabular-nums">{str(biz.registration_number)}</dd></>}
                    {str(biz.tax_id) && <><dt className="text-maxcontrast">Tax ID</dt><dd className="tabular-nums">{str(biz.tax_id)}</dd></>}
                    {site && <><dt className="text-maxcontrast">Website</dt><dd className="break-all">{/^https:\/\//.test(site) ? <a className="underline" href={site} target="_blank" rel="noopener noreferrer nofollow">{site}</a> : site}</dd></>}
                    {str(biz.phone) && <><dt className="text-maxcontrast">Phone</dt><dd>{str(biz.phone)}</dd></>}
                    <dt className="text-maxcontrast">Ships from</dt><dd>{s.country ?? "Not given"}</dd>
                    <dt className="text-maxcontrast">Plan</dt><dd>{planName(s.plan_code)}</dd>
                    <dt className="text-maxcontrast">Applied</dt><dd>{shortDate(s.created_at)}</dd>
                    {str(s.application?.message) && <><dt className="text-maxcontrast">Their note</dt><dd className="whitespace-pre-line">{str(s.application.message)}</dd></>}
                  </dl>
                  <div className="flex gap-2 border-t border-border p-3">
                    <button disabled={busy === s.id} onClick={() => update(s, { status: "active" })} className="btn btn-primary btn-sm">Approve stall</button>
                    <button disabled={busy === s.id} onClick={() => { setAsking({ store: s, status: "rejected" }); setNote(""); }} className="btn btn-tertiary btn-sm">Reject</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="mb-3 flex items-center gap-3">
        <input className="field max-w-xs" placeholder="Search stores or owners" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search stores" />
      </div>
      <Table head={["Store", "Owner", "Plan", "Country", "Live items", "Status", ""]}>
        {rest.map((s) => (
          <tr key={s.id}>
            <td className="px-3 py-2.5">
              {s.status === "active" ? <Link className="hover:underline" href={`/s/${s.slug}`}>{s.name}</Link> : s.name}
              {s.review_note && <span className="block text-[12px] text-maxcontrast">{s.review_note}</span>}
            </td>
            <td className="px-3 py-2.5 text-[13px]">{s.owner_email}</td>
            <td className="px-3 py-2.5">
              <select
                aria-label={`Plan for ${s.name}`}
                disabled={busy === s.id || !plans.data}
                className="rounded-element border border-border bg-main-background px-1 py-1 text-[13px]"
                value={s.plan_code}
                onChange={(e) => update(s, { plan_code: e.target.value })}
              >
                {(plans.data ?? [{ id: s.plan_code, code: s.plan_code, name: s.plan_code }]).map((p) => <option key={p.id} value={p.code}>{p.name}</option>)}
              </select>
            </td>
            <td className="px-3 py-2.5">{s.country}</td>
            <td className="px-3 py-2.5 tabular-nums text-[13px]">{s.product_count}</td>
            <td className="px-3 py-2.5"><StatusTag status={s.status} /></td>
            <td className="px-3 py-2.5 text-right whitespace-nowrap">
              {s.status === "active" ? (
                <button disabled={busy === s.id} onClick={() => { setAsking({ store: s, status: "suspended" }); setNote(""); }} className="btn btn-tertiary btn-sm text-text-error">Suspend</button>
              ) : (
                <button disabled={busy === s.id} onClick={() => update(s, { status: "active", review_note: "" })} className="btn btn-tertiary btn-sm">Reinstate</button>
              )}
            </td>
          </tr>
        ))}
      </Table>

      {asking && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`${asking.status === "rejected" ? "Reject" : "Suspend"} ${asking.store.name}`}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setAsking(null)} />
          <form
            className="modal relative w-full max-w-md overflow-hidden"
            onSubmit={(e) => {
              e.preventDefault();
              update(asking.store, { status: asking.status, review_note: note.trim() });
            }}
          >
            <div className="border-b border-border p-4">
              <p className="heading text-[20px]">{asking.status === "rejected" ? "Reject" : "Suspend"} {asking.store.name}</p>
              <p className="text-[13px] text-maxcontrast">{asking.status === "suspended" ? "Their listings disappear right away and rent stops." : "They can see this note and apply again."}</p>
            </div>
            <label className="block p-4"><span className="label">Reason the vendor will see</span>
              <textarea required minLength={5} maxLength={500} rows={3} className="field mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="flex justify-end gap-2 border-t border-border p-4">
              <button type="button" onClick={() => setAsking(null)} className="btn btn-tertiary">Cancel</button>
              <button disabled={busy === asking.store.id} className="btn btn-primary">{asking.status === "rejected" ? "Reject" : "Suspend"}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
