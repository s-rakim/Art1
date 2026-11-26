"use client";
import { Fragment, useState, type FormEvent } from "react";
import { ErrorLine } from "@/components/dash";
import { Lock } from "@/components/icons";
import { Badge, ExportButton, Panel, PeriodSwitch, saveBlob, saveCsv, type BadgeState } from "@/components/ui/glass-dashboard";
import { api } from "@/lib/api";
import { currencySign, dayLabel, money, whenShort } from "@/lib/format";
import type { AuditEvent, EntryInput, EntryKind, Sheet, SheetCell, SheetColumn, SheetEntry, SheetName } from "@/lib/types";
import { useApi } from "@/lib/use-api";

// The ledger: read-only sheets built from the books (the admin sees every stall, a vendor only
// their own; the API enforces that), and the vendor's own hand-kept sheet, whose rows reach the
// books only after the admin confirms each one against its reference.

export const SHEETS: ReadonlyArray<readonly [SheetName, string]> = [
  ["ledger", "Ledger"],
  ["sales", "Sales"],
  ["payments", "Payments"],
  ["inventory", "Inventory sold"],
  ["payouts", "Payouts"],
  ["entries", "Confirmed entries"],
];

export const KINDS: ReadonlyArray<readonly [EntryKind, string]> = [
  ["sale", "Sale"],
  ["payment", "Payment received"],
  ["expense", "Expense"],
  ["stock_in", "Stock in"],
  ["stock_out", "Stock out"],
  ["other", "Other"],
];
export const kindLabel = (k: EntryKind) => KINDS.find(([v]) => v === k)?.[1] ?? k;

export const ENTRY_STATE: Record<SheetEntry["status"], { label: string; state: BadgeState }> = {
  pending: { label: "Waiting for the market", state: "wait" },
  confirmed: { label: "Confirmed", state: "good" },
  rejected: { label: "Sent back", state: "alert" },
};

function cell(v: SheetCell, type: SheetColumn["type"]) {
  if (v === null || v === "") return "–";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (type === "money" && typeof v === "number") return money(v);
  if (type === "number" && typeof v === "number") return v.toLocaleString("en-US");
  if (type === "date" && typeof v === "string") return v.length === 10 ? dayLabel(v) : whenShort(v);
  return String(v);
}

const isoDay = (d: Date) => d.toLocaleDateString("en-CA");

/**
 * One read-only sheet at a time, with the sheet tabs, a date range, a stall picker (admin only),
 * a totals row and CSV export. The API builds the CSV with every row in the range, not only the
 * page on screen.
 */
export function SheetViewer({ scope, stores }: { scope: "seller" | "admin"; stores?: Array<{ id: string; name: string }> }) {
  const [sheet, setSheet] = useState<SheetName>("ledger");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return isoDay(d);
  });
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [store, setStore] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const filters = { from: from || undefined, to: to || undefined, store_id: scope === "admin" && store ? store : undefined };
  const data = useApi((t) => api.sheet(t, scope, sheet, { ...filters, page }), [scope, sheet, from, to, store, page]);
  const s: Sheet | null = data.data;

  async function exportCsv() {
    setBusy(true);
    setMsg(null);
    const name = `${sheet}-${from || "start"}-to-${to || "today"}${filters.store_id ? `-${stores?.find((x) => x.id === store)?.name ?? "stall"}` : ""}.csv`;
    try {
      saveBlob(name, await api.sheetCsv(data.token, scope, sheet, filters));
    } catch {
      // The API couldn't build the file: save what's on screen instead, and say so.
      if (s) {
        saveCsv(name, [s.columns.map((c) => c.label), ...s.rows.map((r) => s.columns.map((c) => (c.type === "money" && typeof r[c.key] === "number" ? ((r[c.key] as number) / 100).toFixed(2) : (r[c.key] as string | number | null))))]);
        setMsg("Saved the rows on screen only. The full export didn't work just now.");
      }
    } finally {
      setBusy(false);
    }
  }

  const sums = s?.columns.map((c) => (c.type === "money" || (c.type === "number" && c.key !== "quantity_left") ? s.rows.reduce((a, r) => a + (typeof r[c.key] === "number" ? (r[c.key] as number) : 0), 0) : null));
  const pages = s ? Math.max(1, Math.ceil(s.total / Math.max(1, s.page_size))) : 1;

  return (
    <Panel
      title={SHEETS.find(([k]) => k === sheet)?.[1] ?? "Sheet"}
      subtitle={scope === "admin" ? "Read only. Every stall, or pick one." : "Read only. Your stall's figures from the market's books."}
      action={<ExportButton onClick={exportCsv} disabled={busy || !s?.rows.length} label={busy ? "Preparing…" : "Export CSV"} />}
    >
      <div className="gd-tools">
        <PeriodSwitch value={sheet} options={SHEETS} onChange={(v) => { setSheet(v); setPage(1); }} label="Sheet" />
      </div>
      <div className="gd-tools">
        <label className="gd-filter"><span className="text-[12px]">From</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="From date" />
        </label>
        <label className="gd-filter"><span className="text-[12px]">To</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="To date" />
        </label>
        {scope === "admin" && stores && (
          <label className="gd-filter">
            <select value={store} onChange={(e) => { setStore(e.target.value); setPage(1); }} aria-label="Stall">
              <option value="">Every stall</option>
              {stores.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <ErrorLine error={data.error} />
      {msg && <p className="mb-2 text-[13px] text-maxcontrast" role="status">{msg}</p>}
      {!s ? (
        <p className="gd-empty" role="status">Loading the sheet…</p>
      ) : s.rows.length === 0 ? (
        <p className="gd-empty">Nothing in this sheet for these dates.</p>
      ) : (
        <div className="gd-table sheet-grid">
          <table>
            <thead>
              <tr>{s.columns.map((c) => <th key={c.key} scope="col" className={c.type === "money" || c.type === "number" ? "num" : undefined}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {s.rows.map((r, i) => (
                <tr key={i}>{s.columns.map((c) => <td key={c.key} className={c.type === "money" || c.type === "number" ? "num" : undefined}>{cell(r[c.key], c.type)}</td>)}</tr>
              ))}
            </tbody>
            {sums?.some((x) => x !== null) && (
              <tfoot>
                <tr>
                  {s.columns.map((c, i) => (
                    <td key={c.key} className={c.type === "money" || c.type === "number" ? "num" : undefined}>
                      {i === 0 ? (pages > 1 ? "Total, this page" : "Total") : sums[i] === null ? "" : cell(sums[i], c.type)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-[13px]">
          <span className="tabular-nums text-maxcontrast">Page {page} of {pages} · {s?.total.toLocaleString("en-US")} rows</span>
          <button type="button" className="gd-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <button type="button" className="gd-btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------
// The vendor's own sheet

type Draft = { entry_date: string; kind: EntryKind; description: string; quantity: string; amount: string; reference: string };
const blank = (): Draft => ({ entry_date: isoDay(new Date()), kind: "sale", description: "", quantity: "", amount: "", reference: "" });
const toDraft = (e: SheetEntry): Draft => ({
  entry_date: e.entry_date.slice(0, 10), kind: e.kind, description: e.description, quantity: e.quantity === null ? "" : String(e.quantity),
  amount: (e.amount_cents / 100).toFixed(2), reference: e.reference ?? "",
});

/** What the API accepts as a reference, and what the admin types back to confirm the row. */
const REFERENCE = /^[A-Za-z0-9 ./#_-]{2,64}$/;

function readDraft(d: Draft): EntryInput | string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.entry_date)) return "Pick a date.";
  if (!d.description.trim()) return "Say what the row is for.";
  const amount = Number.parseFloat(d.amount);
  if (!Number.isFinite(amount) || amount < 0) return "Enter the amount.";
  const qty = d.quantity.trim() ? Number.parseInt(d.quantity, 10) : null;
  if (qty !== null && (!Number.isFinite(qty) || qty < 0)) return "Quantity must be a whole number.";
  const reference = d.reference.trim();
  if (!REFERENCE.test(reference)) return "Add the reference the market can check: the M-Pesa code, receipt or invoice number (letters, digits, . / # _ -).";
  return {
    entry_date: d.entry_date, kind: d.kind, description: d.description.trim().slice(0, 300), quantity: qty,
    amount_cents: Math.round(amount * 100), reference,
  };
}

function DraftCells({ d, set, form }: { d: Draft; set: (next: Draft) => void; form: string }) {
  const sign = currencySign();
  return (
    <>
      <td><input form={form} type="date" className="sheet-input" value={d.entry_date} onChange={(e) => set({ ...d, entry_date: e.target.value })} aria-label="Date" required /></td>
      <td>
        <select form={form} className="sheet-input" value={d.kind} onChange={(e) => set({ ...d, kind: e.target.value as EntryKind })} aria-label="Kind">
          {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </td>
      <td><input form={form} className="sheet-input min-w-[180px]" value={d.description} maxLength={300} onChange={(e) => set({ ...d, description: e.target.value })} aria-label="Description" placeholder="What it was" required /></td>
      <td className="num"><input form={form} className="sheet-input w-[70px] text-right" inputMode="numeric" value={d.quantity} onChange={(e) => set({ ...d, quantity: e.target.value.replace(/\D/g, "").slice(0, 7) })} aria-label="Quantity" /></td>
      <td className="num">
        <span className="inline-flex items-center gap-1">
          <span className="text-maxcontrast">{sign}</span>
          <input form={form} className="sheet-input w-[100px] text-right" inputMode="decimal" value={d.amount} onChange={(e) => set({ ...d, amount: e.target.value.replace(/[^0-9.]/g, "").slice(0, 12) })} aria-label={`Amount in ${sign}`} required />
        </span>
      </td>
      <td><input form={form} className="sheet-input w-[140px] uppercase" value={d.reference} maxLength={64} required spellCheck={false} onChange={(e) => set({ ...d, reference: e.target.value })} aria-label="Reference" placeholder="M-Pesa code, receipt no." /></td>
    </>
  );
}

/**
 * The vendor's editable sheet. Rows wait for the market to confirm them against their reference
 * (a transaction code or receipt number); confirmed rows are locked and show up in the read-only
 * "Confirmed entries" sheet. Every change is kept in the row's history.
 */
export function EntrySheet() {
  const entries = useApi((t) => api.sellerEntries(t));
  const [draft, setDraft] = useState<Draft>(blank);
  const [editing, setEditing] = useState<{ id: string; d: Draft } | null>(null);
  const [history, setHistory] = useState<{ id: string; rows: AuditEvent[] | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const rows = entries.data?.items ?? [];

  async function add(e: FormEvent) {
    e.preventDefault();
    const body = readDraft(draft);
    if (typeof body === "string") return setMsg(body);
    setBusy("new");
    setMsg(null);
    try {
      const row = await api.sellerAddEntry(entries.token, body);
      entries.setData((p) => p && { ...p, items: [row, ...p.items], total: p.total + 1 });
      setDraft({ ...blank(), entry_date: draft.entry_date, kind: draft.kind });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "That row didn't save.");
    } finally {
      setBusy(null);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const body = readDraft(editing.d);
    if (typeof body === "string") return setMsg(body);
    setBusy(editing.id);
    setMsg(null);
    try {
      const row = await api.sellerUpdateEntry(entries.token, editing.id, body);
      entries.setData((p) => p && { ...p, items: p.items.map((x) => (x.id === row.id ? row : x)) });
      setEditing(null);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "That change didn't save.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: SheetEntry) {
    setBusy(row.id);
    setMsg(null);
    try {
      await api.sellerDeleteEntry(entries.token, row.id);
      entries.setData((p) => p && { ...p, items: p.items.filter((x) => x.id !== row.id), total: p.total - 1 });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn't remove that row.");
    } finally {
      setBusy(null);
    }
  }

  async function showHistory(row: SheetEntry) {
    if (history?.id === row.id) return setHistory(null);
    setHistory({ id: row.id, rows: null });
    try {
      const list = await api.sellerEntryHistory(entries.token, row.id);
      setHistory((h) => (h?.id === row.id ? { id: row.id, rows: list } : h));
    } catch {
      setHistory((h) => (h?.id === row.id ? { id: row.id, rows: [] } : h));
    }
  }

  const waiting = rows.filter((r) => r.status === "pending").length;
  return (
    <Panel
      title="Your own sheet"
      subtitle={`Keep your own record of sales, payments and stock. The market checks each row against its reference before it counts.${waiting ? ` ${waiting} waiting.` : ""}`}
      action={<ExportButton disabled={!rows.length} onClick={() => saveCsv("my-sheet.csv", [
        ["Date", "Kind", "Description", "Quantity", "Amount", "Reference", "Status", "Market's note"],
        ...rows.map((r) => [r.entry_date, kindLabel(r.kind), r.description, r.quantity, (r.amount_cents / 100).toFixed(2), r.reference, ENTRY_STATE[r.status].label, r.admin_note]),
      ])} />}
    >
      <ErrorLine error={entries.error} />
      {msg && <p className="mb-2 text-[13px] text-text-error" role="alert">{msg}</p>}
      <form id="entry-new" onSubmit={add} />
      <form id="entry-edit" onSubmit={save} />
      <div className="gd-table sheet-grid">
        <table>
          <thead>
            <tr>
              {["Date", "Kind", "Description", "Qty", "Amount", "Reference", "Status", ""].map((h, i) => <th key={h || i} scope="col" className={h === "Qty" || h === "Amount" ? "num" : undefined}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="sheet-new">
              <DraftCells d={draft} set={setDraft} form="entry-new" />
              <td className="text-[12px] text-maxcontrast">New row</td>
              <td><button form="entry-new" className="gd-btn gd-btn-primary" disabled={busy === "new"}>{busy === "new" ? "…" : "Add"}</button></td>
            </tr>
            {rows.map((r) => {
              const locked = r.status === "confirmed";
              const open = editing?.id === r.id;
              return (
                <Fragment key={r.id}>
                  <tr data-locked={locked || undefined}>
                    {open && editing ? (
                      <DraftCells d={editing.d} set={(d) => setEditing({ id: r.id, d })} form="entry-edit" />
                    ) : (
                      <>
                        <td>{dayLabel(r.entry_date)}</td>
                        <td>{kindLabel(r.kind)}</td>
                        <td className="max-w-[280px] whitespace-normal">{r.description}</td>
                        <td className="num">{r.quantity ?? "–"}</td>
                        <td className="num">{money(r.amount_cents)}</td>
                        <td className="tabular-nums">{r.reference ?? "–"}</td>
                      </>
                    )}
                    <td>
                      <Badge state={ENTRY_STATE[r.status].state}>{locked && <Lock size={12} />}{ENTRY_STATE[r.status].label}</Badge>
                      {r.admin_note && <span className="block max-w-[220px] whitespace-normal text-[12px] text-maxcontrast">{r.admin_note}</span>}
                    </td>
                    <td>
                      <span className="flex gap-1.5">
                        {open ? (
                          <>
                            <button form="entry-edit" className="gd-btn gd-btn-primary" disabled={busy === r.id}>{busy === r.id ? "…" : "Save"}</button>
                            <button type="button" className="gd-btn" onClick={() => setEditing(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            {!locked && <button type="button" className="gd-btn" onClick={() => { setEditing({ id: r.id, d: toDraft(r) }); setMsg(null); }}>Edit</button>}
                            {r.status === "pending" && <button type="button" className="gd-btn" disabled={busy === r.id} onClick={() => remove(r)}>Remove</button>}
                            <button type="button" className="gd-btn" aria-expanded={history?.id === r.id} onClick={() => showHistory(r)}>History</button>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                  {history?.id === r.id && (
                    <tr>
                      <td colSpan={8} className="whitespace-normal">
                        {history.rows === null ? (
                          <p className="text-[13px] text-maxcontrast" role="status">Loading history…</p>
                        ) : history.rows.length === 0 ? (
                          <p className="text-[13px] text-maxcontrast">No changes recorded yet.</p>
                        ) : (
                          <ol className="space-y-1 text-[13px]">
                            {history.rows.map((h) => (
                              <li key={h.id}><span className="tabular-nums text-maxcontrast">{whenShort(h.at)}</span> · <b>{h.action.replace(/_/g, " ")}</b>{h.actor && <> by {h.actor}</>}{h.detail && <span className="block break-words font-mono text-[12px] text-maxcontrast">{h.detail}</span>}</li>
                            ))}
                          </ol>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {entries.data && rows.length === 0 && <p className="gd-empty">No rows yet. Add your first one above.</p>}
    </Panel>
  );
}
