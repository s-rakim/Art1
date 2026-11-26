"use client";
import { Fragment, useState, type FormEvent } from "react";
import { ErrorLine } from "@/components/dash";
import { Check, Clock, List, Shield } from "@/components/icons";
import { ENTRY_STATE, kindLabel, SheetViewer } from "@/components/ledger-sheets";
import { ActivityTable, Badge, GlassStage, Metric, Panel, PeriodSwitch, useHashView, type DashView } from "@/components/ui/glass-dashboard";
import { api } from "@/lib/api";
import { dayLabel, money, whenShort } from "@/lib/format";
import type { SheetEntry } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const VIEWS: DashView<"books" | "review" | "audit">[] = [
  { id: "books", label: "Sheets", icon: <List size={18} />, description: "Every stall's ledger, sales, payments and stock, read only. Pick a stall to see only theirs." },
  { id: "review", label: "Vendor entries", short: "Entries", icon: <Check size={18} />, description: "Rows vendors typed in. Confirm each by its transaction code or other key, or send it back." },
  { id: "audit", label: "Audit log", short: "Audit", icon: <Shield size={18} />, description: "Every change to payments, payouts and sheets, in order. Nothing here can be edited." },
];
const STATES = [["pending", "Waiting"], ["confirmed", "Confirmed"], ["rejected", "Sent back"]] as const;
const count = (n: number) => Math.round(n).toLocaleString("en-US");

export default function AdminLedger() {
  const [view, setView] = useHashView(VIEWS.map((v) => v.id), "books");
  const stores = useApi((t) => api.adminStores(t));
  const list = (stores.data?.items ?? []).map((s) => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <GlassStage kicker="Money" title="Ledger" views={VIEWS} view={view} onView={setView}>
      {view === "books" && <SheetViewer scope="admin" stores={list} />}
      {view === "review" && <Review stores={list} />}
      {view === "audit" && <Audit stores={list} />}
    </GlassStage>
  );
}

function Review({ stores }: { stores: Array<{ id: string; name: string }> }) {
  const [status, setStatus] = useState<SheetEntry["status"]>("pending");
  const [store, setStore] = useState("");
  const entries = useApi((t) => api.adminEntries(t, status, store || undefined), [status, store]);
  const [open, setOpen] = useState<{ id: string; mode: "confirm" | "reject" } | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const rows = entries.data?.items ?? [];

  async function submit(e: FormEvent, r: SheetEntry) {
    e.preventDefault();
    if (!open) return;
    setBusy(true);
    setMsg(null);
    try {
      if (open.mode === "confirm") await api.adminConfirmEntry(entries.token, r.id, value);
      else await api.adminRejectEntry(entries.token, r.id, value);
      entries.setData((p) => p && { ...p, items: p.items.filter((x) => x.id !== r.id), total: p.total - 1 });
      setOpen(null);
      setValue("");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="gd-metrics">
        <Metric i={0} tone={status === "pending" && rows.length ? "attention" : "accent"} label={STATES.find(([s]) => s === status)?.[1] ?? "Entries"} icon={<Clock size={16} />} value={entries.data ? entries.data.total : null} format={count} note={store ? stores.find((s) => s.id === store)?.name : "across every stall"} />
        <Metric i={1} label="Amount in these rows" icon={<List size={16} />} value={entries.data ? rows.reduce((a, r) => a + r.amount_cents, 0) : null} format={money} note={`${rows.length} rows`} />
      </div>
      <Panel
        title="Entries"
        subtitle="To confirm, type the row's key yourself, from the payment message or the receipt. It must match what the vendor wrote."
        action={<PeriodSwitch value={status} options={STATES} onChange={setStatus} label="Status" />}
      >
        <div className="gd-tools">
          <label className="gd-filter">
            <select value={store} onChange={(e) => setStore(e.target.value)} aria-label="Stall">
              <option value="">Every stall</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        <ErrorLine error={entries.error} />
        {rows.length === 0 ? (
          <p className="gd-empty">{entries.data ? "Nothing here." : "Loading…"}</p>
        ) : (
          <div className="gd-table sheet-grid">
            <table>
              <thead>
                <tr>{["Stall", "Date", "Kind", "Description", "Qty", "Amount", "Reference", "Status", ""].map((h, i) => <th key={h || i} scope="col" className={h === "Qty" || h === "Amount" ? "num" : undefined}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td className="font-semibold">{r.store_name ?? stores.find((s) => s.id === r.store_id)?.name ?? "–"}</td>
                      <td>{dayLabel(r.entry_date)}</td>
                      <td>{kindLabel(r.kind)}</td>
                      <td className="max-w-[260px] whitespace-normal">{r.description}</td>
                      <td className="num">{r.quantity ?? "–"}</td>
                      <td className="num">{money(r.amount_cents)}</td>
                      <td className="tabular-nums">{r.reference ?? "–"}</td>
                      <td><Badge state={ENTRY_STATE[r.status].state}>{ENTRY_STATE[r.status].label}</Badge>{r.admin_note && <span className="block max-w-[200px] whitespace-normal text-[12px] text-maxcontrast">{r.admin_note}</span>}</td>
                      <td>
                        {r.status === "pending" && (
                          <span className="flex gap-1.5">
                            <button type="button" className="gd-btn gd-btn-primary" disabled={!r.reference} title={r.reference ? undefined : "No key to check it against. Send it back."} onClick={() => { setOpen({ id: r.id, mode: "confirm" }); setValue(""); setMsg(null); }}>Confirm</button>
                            <button type="button" className="gd-btn" onClick={() => { setOpen({ id: r.id, mode: "reject" }); setValue(""); setMsg(null); }}>Send back</button>
                          </span>
                        )}
                      </td>
                    </tr>
                    {open?.id === r.id && (
                      <tr>
                        <td colSpan={9}>
                          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => submit(e, r)}>
                            <label className="min-w-[220px] flex-1">
                              <span className="label">{open.mode === "confirm" ? "Key from the payment message or receipt" : "What's wrong with it? The vendor sees this."}</span>
                              <input className="field mt-1" required autoFocus autoComplete="off" spellCheck={false} maxLength={open.mode === "confirm" ? 64 : 500} value={value} onChange={(e) => setValue(e.target.value)} />
                            </label>
                            <button type="button" className="btn btn-tertiary" onClick={() => setOpen(null)}>Cancel</button>
                            <button className={`btn ${open.mode === "confirm" ? "btn-primary" : "btn-error"}`} disabled={busy || !value.trim()}>{busy ? "…" : open.mode === "confirm" ? "Confirm row" : "Send back"}</button>
                            {msg && <p className="basis-full text-[13px] text-text-error" role="alert">{msg}</p>}
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function Audit({ stores }: { stores: Array<{ id: string; name: string }> }) {
  const [store, setStore] = useState("");
  const log = useApi((t) => api.adminAudit(t, { store_id: store || undefined }), [store]);
  return (
    <Panel title="Audit log" subtitle="Newest first. Written by the server; it can't be changed from here or anywhere else.">
      <div className="gd-tools">
        <label className="gd-filter">
          <select value={store} onChange={(e) => setStore(e.target.value)} aria-label="Stall">
            <option value="">Every stall</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      <ErrorLine error={log.error} />
      <ActivityTable
        rows={log.data?.items ?? []}
        rowKey={(a) => a.id}
        search={(a) => `${a.action} ${a.entity ?? ""} ${a.actor ?? ""} ${a.detail ?? ""}`}
        filterBy={(a) => a.entity ?? "other"}
        filterLabel="Kind"
        searchLabel="Search the log"
        empty={log.data ? "Nothing logged yet." : "Loading…"}
        columns={[
          { label: "When", cell: (a) => whenShort(a.at) },
          { label: "Who", cell: (a) => a.actor ?? "system" },
          { label: "What", cell: (a) => a.action.replace(/_/g, " ") },
          { label: "On", cell: (a) => (a.entity ? `${a.entity.replace(/_/g, " ")}${a.entity_id ? ` ${a.entity_id.slice(0, 8)}` : ""}` : "–") },
          { label: "Stall", cell: (a) => stores.find((s) => s.id === a.store_id)?.name ?? "–" },
          { label: "Detail", cell: (a) => <span className="block max-w-[360px] truncate font-mono text-[12px]" title={a.detail ?? undefined}>{a.detail ?? ""}</span> },
        ]}
      />
    </Panel>
  );
}
