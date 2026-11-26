"use client";
import { Fragment, useRef, useState, type FormEvent } from "react";
import { ErrorLine } from "@/components/dash";
import { Bank, Cash, Clock, Receipt, Search, Store, Upload, Wallet } from "@/components/icons";
import {
  Badge, ExportButton, GlassStage, Metric, Panel, PeriodSwitch, saveCsv, useHashView, type BadgeState, type DashView,
} from "@/components/ui/glass-dashboard";
import { api } from "@/lib/api";
import { ago, money, moneyShort, whenShort } from "@/lib/format";
import { useLiveReload } from "@/lib/live";
import type { PaymentImport, PaymentReceipt, ReceiptStatus, Settlement } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const VIEWS: DashView<"receipts" | "import" | "payouts">[] = [
  { id: "receipts", label: "Payments in", short: "Payments", icon: <Receipt size={18} />, description: "Every M-Pesa and bank payment into the market's till, and the order it paid for." },
  { id: "import", label: "Add from messages", short: "Add", icon: <Upload size={18} />, description: "Paste or upload M-Pesa and bank messages. The name, amount and code are read out for you." },
  { id: "payouts", label: "Payouts to stalls", short: "Payouts", icon: <Bank size={18} />, description: "What each stall is owed after rent, commission and delivery, and when it's due." },
];
const STATUSES = [["unconfirmed", "Waiting"], ["confirmed", "Used"], ["expired", "Expired"], ["void", "Void"]] as const;
const STATE: Record<ReceiptStatus, BadgeState> = { unconfirmed: "wait", confirmed: "good", expired: "plain", void: "alert" };
const LABEL: Record<ReceiptStatus, string> = { unconfirmed: "Waiting for an order", confirmed: "Used", expired: "Expired", void: "Void" };
const count = (n: number) => Math.round(n).toLocaleString("en-US");
const MAX_FILE = 1024 * 1024;

export default function AdminPayments() {
  const [view, setView] = useHashView(VIEWS.map((v) => v.id), "receipts");
  const [status, setStatus] = useState<ReceiptStatus>("unconfirmed");
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const receipts = useApi((t) => api.adminPayments(t, status, asked), [status, asked]);
  const settlements = useApi((t) => api.adminSettlements(t));
  const settings = useApi((t) => api.adminSettings(t));
  const live = useLiveReload(["order", "job"], () => (receipts.reload(), settlements.reload()), 30000);

  const rows = receipts.data?.items ?? [];
  const stalls = settlements.data ?? [];

  return (
    <GlassStage
      kicker="Money"
      title="Payments and payouts"
      live={live}
      pollSeconds={30}
      views={VIEWS}
      view={view}
      onView={setView}
      actions={
        view === "receipts" ? (
          <ExportButton
            disabled={!rows.length}
            onClick={() =>
              saveCsv(`payments-${status}.csv`, [
                ["Received", "Code", "Payer", "Phone", "Amount", "Currency", "Provider", "Reference", "Order", "Status", "Used at", "Confirmed by"],
                ...rows.map((r) => [r.received_at, r.code, r.payer_name, r.payer_phone, (r.amount_cents / 100).toFixed(2), r.currency, r.provider, r.account_ref, r.order_number, LABEL[r.status], r.used_at, r.confirmed_by]),
              ])
            }
          />
        ) : view === "payouts" ? (
          <ExportButton
            disabled={!stalls.length}
            onClick={() =>
              saveCsv("stall-payouts.csv", [
                ["Stall", "Sales", "Owed", "Held", "Rent", "Commission", "Fees", "Delivery", "Paid out", "Net to pay", "Books balanced", "Blockers", "Next payout", "Last payout"],
                ...stalls.map((s) => [
                  s.store_name,
                  ...[s.sales_cents, s.owed_cents, s.held_cents, s.rent_due_cents, s.commission_cents, s.fees_cents, s.delivery_cents, s.paid_out_cents, s.net_cents].map((c) => (c / 100).toFixed(2)),
                  s.books_balanced ? "Yes" : "No", s.blockers.join("; "), s.next_payout_at, s.last_payout_at,
                ]),
              ])
            }
          />
        ) : null
      }
    >
      {view === "receipts" && (
        <>
          <ErrorLine error={receipts.error} />
          <div className="gd-metrics">
            <Metric i={0} tone="accent" label={STATUSES.find(([s]) => s === status)?.[1] ?? "Payments"} icon={<Receipt size={16} />} value={receipts.data ? receipts.data.total : null} format={count} note={asked ? `matching "${asked}"` : "in the databank"} />
            <Metric i={1} label="On this page" icon={<Cash size={16} />} value={receipts.data ? rows.reduce((a, r) => a + r.amount_cents, 0) : null} format={moneyShort} note={`${rows.length} payments`} />
            <Metric
              i={2}
              tone={status === "unconfirmed" && rows.length ? "attention" : undefined}
              label="Oldest waiting"
              icon={<Clock size={16} />}
              value={status === "unconfirmed" && rows.length ? rows.length : 0}
              format={() => (status === "unconfirmed" && rows.length ? ago(rows.reduce((a, r) => (r.received_at < a ? r.received_at : a), rows[0].received_at)) ?? "–" : "–")}
              note="riders confirm these at the door"
            />
          </div>
          <Panel
            title="The databank"
            subtitle="A code is used once, ever. Waiting codes expire if no order claims them."
            i={3}
            action={<PeriodSwitch value={status} options={STATUSES} onChange={setStatus} label="Status" />}
          >
            <form
              className="gd-tools"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                setAsked(q.trim());
              }}
            >
              <label className="gd-search">
                <Search size={15} />
                <input type="search" value={q} maxLength={80} onChange={(e) => setQ(e.target.value)} placeholder="Code, name, phone or order" aria-label="Search payments" />
              </label>
              <button className="gd-btn">Search</button>
              {asked && <button type="button" className="gd-btn" onClick={() => { setQ(""); setAsked(""); }}>Clear</button>}
            </form>
            <ReceiptTable rows={rows} token={receipts.token} onChanged={() => (receipts.reload(), settlements.reload())} />
          </Panel>
        </>
      )}

      {view === "import" && <ImportTool token={receipts.token} onStored={() => (receipts.reload(), setStatus("unconfirmed"))} />}

      {view === "payouts" && (
        <>
          <ErrorLine error={settlements.error} />
          <div className="gd-metrics">
            <Metric i={0} tone="accent" label="Owed to stalls" icon={<Wallet size={16} />} value={settlements.data ? stalls.reduce((a, s) => a + Math.max(0, s.net_cents), 0) : null} format={moneyShort} note="net of rent, commission and delivery" />
            <Metric i={1} label="Held back" icon={<Clock size={16} />} value={settlements.data ? stalls.reduce((a, s) => a + s.held_cents, 0) : null} format={moneyShort} note="paid in, still inside the payout wait" />
            <Metric
              i={2}
              tone={stalls.some(due) ? "attention" : undefined}
              label="Due now"
              icon={<Store size={16} />}
              value={settlements.data ? stalls.filter(due).length : null}
              format={count}
              note={settings.data?.payout_interval_days ? `paid every ${settings.data.payout_interval_days} days` : "on the payout schedule"}
            />
            <Metric i={3} label="Market's share" icon={<Cash size={16} />} value={settlements.data ? stalls.reduce((a, s) => a + s.rent_due_cents + s.commission_cents + s.fees_cents + s.delivery_cents, 0) : null} format={moneyShort} note="rent, commission, fees and delivery" />
          </div>
          <Panel title="Stalls" subtitle="Pay a stall once its books balance. Each payout needs the transfer's reference." i={4}>
            <Payouts stalls={stalls} token={settlements.token} onPaid={settlements.reload} />
          </Panel>
        </>
      )}
    </GlassStage>
  );
}

const due = (s: Settlement) => s.net_cents > 0 && s.books_balanced && (!s.next_payout_at || new Date(s.next_payout_at) <= new Date());

// ---------------------------------------------------------------------------------------

function ReceiptTable({ rows, token, onChanged }: { rows: PaymentReceipt[]; token: string | null; onChanged: () => void }) {
  const orders = useApi((t) => api.adminOrders(t));
  const [open, setOpen] = useState<{ id: string; mode: "apply" | "void" } | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const unpaid = (orders.data?.items ?? []).filter((o) => o.status === "pending_payment" || o.status === "pending");

  async function submit(e: FormEvent, r: PaymentReceipt) {
    e.preventDefault();
    if (!open) return;
    setBusy(true);
    setMsg(null);
    try {
      if (open.mode === "apply") {
        await api.adminApplyPayment(token, r.id, value);
      } else {
        await api.adminVoidPayment(token, r.id, value.trim());
      }
      setOpen(null);
      setValue("");
      onChanged();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  if (!rows.length) return <p className="gd-empty">No payments here.</p>;
  return (
    <div className="gd-table">
      <datalist id="unpaid-orders">
        {unpaid.map((o) => <option key={o.id} value={o.number}>{money(o.total_cents, o.currency)}</option>)}
      </datalist>
      <table>
        <thead>
          <tr>
            {["Received", "Code", "Payer", "Amount", "Reference", "Order", "Status", ""].map((h) => <th key={h} scope="col" className={h === "Amount" ? "num" : undefined}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.id}>
              <tr>
                <td>{whenShort(r.received_at)}</td>
                <td className="font-semibold tabular-nums">{r.code}</td>
                <td>{r.payer_name ?? "–"}{r.payer_phone && <span className="block text-[12px] text-maxcontrast tabular-nums">{r.payer_phone}</span>}</td>
                <td className="num">{money(r.amount_cents, r.currency)}{r.provider && <span className="block text-[12px] text-maxcontrast">{r.provider}</span>}</td>
                <td className="tabular-nums">{r.account_ref ?? "–"}</td>
                <td className="tabular-nums">{r.order_number ?? "–"}{r.confirmed_by && <span className="block text-[12px] text-maxcontrast">by {r.confirmed_by}</span>}</td>
                <td><Badge state={STATE[r.status]}>{LABEL[r.status]}</Badge>{r.note && <span className="block max-w-[200px] truncate text-[12px] text-maxcontrast" title={r.note}>{r.note}</span>}</td>
                <td>
                  {r.status === "unconfirmed" && (
                    <span className="flex gap-1.5">
                      <button type="button" className="gd-btn" onClick={() => { setOpen({ id: r.id, mode: "apply" }); setValue(""); setMsg(null); }}>Apply to order</button>
                      <button type="button" className="gd-btn" onClick={() => { setOpen({ id: r.id, mode: "void" }); setValue(""); setMsg(null); }}>Void</button>
                    </span>
                  )}
                </td>
              </tr>
              {open?.id === r.id && (
                <tr>
                  <td colSpan={8}>
                    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => submit(e, r)}>
                      <label className="min-w-[220px] flex-1">
                        <span className="label">{open.mode === "apply" ? `Order number this ${r.code} paid for` : `Why void ${r.code}?`}</span>
                        <input
                          className="field mt-1"
                          required
                          autoFocus
                          maxLength={open.mode === "apply" ? 40 : 300}
                          list={open.mode === "apply" ? "unpaid-orders" : undefined}
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                          placeholder={open.mode === "apply" ? "BZ-1042" : "Duplicate message, refunded, test payment…"}
                        />
                      </label>
                      <button type="button" className="btn btn-tertiary" onClick={() => setOpen(null)}>Cancel</button>
                      <button className={`btn ${open.mode === "apply" ? "btn-primary" : "btn-error"}`} disabled={busy || !value.trim()}>
                        {busy ? "…" : open.mode === "apply" ? "Apply payment" : "Void payment"}
                      </button>
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
  );
}

// ---------------------------------------------------------------------------------------

function ImportTool({ token, onStored }: { token: string | null; onStored: () => void }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PaymentImport | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function run(commit: boolean) {
    setBusy(commit ? "save" : "read");
    setMsg(null);
    try {
      const out = await api.adminImportPayments(token, text, commit);
      setPreview(out);
      if (commit) {
        setSaved(out.stored);
        onStored();
      } else setSaved(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't read those messages.");
    } finally {
      setBusy(null);
    }
  }

  async function load(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_FILE) return setMsg("That file is over 1 MB. Export a shorter date range.");
    const body = await f.text();
    setText((cur) => (cur ? `${cur}\n${body}` : body).slice(0, 50000));
    setPreview(null);
    if (file.current) file.current.value = "";
  }

  const fresh = preview?.rows.filter((r) => !r.duplicate).length ?? 0;
  return (
    <div className="gd-split">
      <Panel title="Messages" subtitle="One message per line or paragraph. M-Pesa confirmations and bank alerts both work." i={0}>
        <label className="block">
          <span className="sr-only">Payment messages</span>
          <textarea
            className="field min-h-[220px] font-mono text-[13px]"
            value={text}
            maxLength={50000}
            spellCheck={false}
            onChange={(e) => { setText(e.target.value); setPreview(null); setSaved(null); }}
            placeholder={"SKL4H7Q2XZ Confirmed. USD 24.50 received from JANE WANJIKU 0712345678 for account BZ-261125-100001 on 25/11/26 at 2:05 PM."}
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="gd-btn gd-btn-primary" disabled={!text.trim() || busy !== null} onClick={() => run(false)}>
            {busy === "read" ? "Reading…" : "Read messages"}
          </button>
          <label className="gd-btn cursor-pointer">
            <Upload size={16} />
            Upload a .txt or .csv
            <input ref={file} type="file" accept=".txt,.csv,text/plain,text/csv" className="sr-only" onChange={(e) => load(e.target.files?.[0])} />
          </label>
          {text && <button type="button" className="gd-btn" onClick={() => { setText(""); setPreview(null); setSaved(null); }}>Clear</button>}
        </div>
        <p className="mt-3 text-[13px] text-maxcontrast">
          Payments also land here by themselves from the SMS forwarder on the till phone and from Safaricom&apos;s Daraja callback, once those are switched on.
        </p>
        {msg && <p className="mt-2 text-[13px] text-text-error" role="alert">{msg}</p>}
      </Panel>

      <Panel
        title="What was read"
        subtitle={preview ? `${preview.rows.length} payments, ${preview.rows.length - fresh} already in the databank${preview.failed.length ? `, ${preview.failed.length} lines not understood` : ""}` : "Nothing read yet"}
        i={1}
        action={
          preview && saved === null && fresh > 0 ? (
            <button type="button" className="gd-btn gd-btn-primary" disabled={busy !== null} onClick={() => run(true)}>
              {busy === "save" ? "Saving…" : `Save ${fresh} payment${fresh === 1 ? "" : "s"}`}
            </button>
          ) : undefined
        }
      >
        {saved !== null && <p className="note note-success mb-3 text-[14px]"><span>Saved {saved} payment{saved === 1 ? "" : "s"} to the databank. Riders can confirm them at the door now.</span></p>}
        {preview && preview.rows.length > 0 && (
          <div className="gd-table">
            <table>
              <thead><tr>{["Code", "Payer", "Amount", "Received", "Order", ""].map((h) => <th key={h} scope="col" className={h === "Amount" ? "num" : undefined}>{h}</th>)}</tr></thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={`${r.code}-${i}`}>
                    <td className="font-semibold tabular-nums">{r.code || "–"}</td>
                    <td>{r.payer_name ?? "–"}{r.payer_phone && <span className="block text-[12px] text-maxcontrast tabular-nums">{r.payer_phone}</span>}</td>
                    <td className="num">{money(r.amount_cents, r.currency)}</td>
                    <td>{r.received_at ? whenShort(r.received_at) : "–"}</td>
                    <td className="tabular-nums">{r.matched_order_number ?? r.account_ref ?? "–"}</td>
                    <td>{r.duplicate ? <Badge state="plain">Already saved</Badge> : r.matched_order_number ? <Badge state="good">Matches an order</Badge> : <Badge state="wait">New</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {preview && preview.failed.length > 0 && (
          <details className="mt-3 text-[13px]">
            <summary className="cursor-pointer font-semibold">Lines that weren&apos;t payments ({preview.failed.length})</summary>
            <ul className="mt-2 space-y-1 text-maxcontrast">
              {preview.failed.map((f, i) => <li key={i} className="break-words font-mono">{f}</li>)}
            </ul>
          </details>
        )}
        {!preview && <p className="gd-empty">Paste messages and press Read. Nothing is saved until you press Save.</p>}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------------------

function Payouts({ stalls, token, onPaid }: { stalls: Settlement[]; token: string | null; onPaid: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function start(s: Settlement) {
    setOpen(s.store_id);
    setAmount((Math.max(0, s.net_cents) / 100).toFixed(2));
    setReference("");
    setNote("");
    setForce(false);
    setMsg(null);
  }

  async function pay(e: FormEvent, s: Settlement) {
    e.preventDefault();
    const cents = Math.round(Number.parseFloat(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return setMsg("Enter the amount you sent.");
    if (!s.books_balanced && !force) return setMsg("The books don't balance yet. Tick 'Pay anyway' and say why, or fix the blockers first.");
    if (force && !note.trim()) return setMsg("Say why you're paying before the books balance.");
    setBusy(true);
    setMsg(null);
    try {
      await api.adminRecordPayout(token, s.store_id, { amount_cents: cents, reference: reference.trim(), note: note.trim() || undefined, force: force || undefined });
      setDone(`Recorded ${money(cents)} to ${s.store_name}.`);
      setOpen(null);
      onPaid();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  if (!stalls.length) return <p className="gd-empty">No stalls with money in or out yet.</p>;
  return (
    <>
      {done && <p className="note note-success mb-3 text-[14px]" role="status"><span>{done}</span></p>}
      <div className="gd-table">
        <table>
          <thead>
            <tr>
              {["Stall", "Sales", "Held", "Rent", "Commission", "Fees", "Delivery", "Paid out", "Net to pay", "Books", "Next payout", ""].map((h, i) => (
                <th key={h || i} scope="col" className={i >= 1 && i <= 8 ? "num" : undefined}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stalls.map((s) => (
              <Fragment key={s.store_id}>
                <tr>
                  <td className="font-semibold">{s.store_name}</td>
                  <td className="num">{money(s.sales_cents)}</td>
                  <td className="num">{money(s.held_cents)}</td>
                  <td className="num">{money(s.rent_due_cents)}</td>
                  <td className="num">{money(s.commission_cents)}</td>
                  <td className="num">{money(s.fees_cents)}</td>
                  <td className="num">{money(s.delivery_cents)}</td>
                  <td className="num">{money(s.paid_out_cents)}</td>
                  <td className="num font-semibold">{money(s.net_cents)}</td>
                  <td>
                    {s.books_balanced ? <Badge state="good">Balanced</Badge> : <Badge state="alert">Not yet</Badge>}
                    {s.blockers.length > 0 && <span className="block max-w-[220px] whitespace-normal text-[12px] text-maxcontrast">{s.blockers.join(" · ")}</span>}
                  </td>
                  <td>
                    {s.next_payout_at ? whenShort(s.next_payout_at) : "–"}
                    {s.last_payout_at && <span className="block text-[12px] text-maxcontrast">last {whenShort(s.last_payout_at)}</span>}
                  </td>
                  <td>
                    <button type="button" className={`gd-btn ${due(s) ? "gd-btn-primary" : ""}`} disabled={s.net_cents <= 0} onClick={() => start(s)}>Record payout</button>
                  </td>
                </tr>
                {open === s.store_id && (
                  <tr>
                    <td colSpan={12}>
                      <form className="grid gap-2 sm:grid-cols-[140px_1fr_1fr_auto] sm:items-end" onSubmit={(e) => pay(e, s)}>
                        <label>
                          <span className="label">Amount sent</span>
                          <input className="field mt-1 tabular-nums" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
                        </label>
                        <label>
                          <span className="label">Transfer reference</span>
                          <input className="field mt-1" required maxLength={64} autoFocus value={reference} onChange={(e) => setReference(e.target.value)} placeholder="M-Pesa or bank reference" />
                        </label>
                        <label>
                          <span className="label">Note {force ? "(required)" : "(optional)"}</span>
                          <input className="field mt-1" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
                        </label>
                        <div className="flex gap-2">
                          <button type="button" className="btn btn-tertiary" onClick={() => setOpen(null)}>Cancel</button>
                          <button className="btn btn-primary" disabled={busy || !reference.trim()}>{busy ? "…" : "Record"}</button>
                        </div>
                        {!s.books_balanced && (
                          <label className="flex items-center gap-2 text-[13px] sm:col-span-4">
                            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                            Pay anyway, before the books balance. This is written to the audit log with your note.
                          </label>
                        )}
                        {msg && <p className="text-[13px] text-text-error sm:col-span-4" role="alert">{msg}</p>}
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
