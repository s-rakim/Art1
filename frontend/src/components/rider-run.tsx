"use client";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/glass-dashboard";
import { Door, Lock, Message, Phone, Search } from "@/components/icons";
import { StatusTag } from "@/components/status-tag";
import { api, ApiError } from "@/lib/api";
import { ago, money, whenShort } from "@/lib/format";
import { km } from "@/lib/geo";
import type { Delivery, LatLng, OpenJob, PayInfo, PaymentCheck, PaymentMatch, RiderRules } from "@/lib/types";

/** The API's own message for a refusal (it names the rule), or a fallback for a dropped connection. */
export function why(e: unknown, fallback: string) {
  return e instanceof ApiError && e.message ? e.message : fallback;
}

/** Only digits and a leading plus survive into a tel: link. */
const telHref = (p: string) => (/^[0-9 +().-]{6,32}$/.test(p) ? `tel:${p.replace(/[^0-9+]/g, "")}` : null);

function directions(from: LatLng | null, to: LatLng | null, address?: string | null) {
  if (to && from) return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${from.lat}%2C${from.lng}%3B${to.lat}%2C${to.lng}`;
  if (to) return `https://www.openstreetmap.org/?mlat=${to.lat}&mlon=${to.lng}#map=17/${to.lat}/${to.lng}`;
  if (address) return `https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`;
  return null;
}

// ---------------------------------------------------------------------------------------
// Open jobs

/**
 * Whether job `b` could ride along with job `a`: drop-offs within the batch radius of each
 * other, and the same shop or shops within the pickup radius. A preview only, on rounded
 * drop-offs; the API makes the real call when the rider accepts.
 */
export function fitsWith(a: OpenJob, b: OpenJob, r: RiderRules) {
  if (!a.dropoff || !b.dropoff) return false;
  const near = km(a.dropoff, b.dropoff) <= r.batch_radius_km;
  const shops = a.store.id === b.store.id || (!!a.pickup && !!b.pickup && km(a.pickup, b.pickup) <= r.pickup_radius_km);
  return near && shops;
}

function lockText(j: OpenJob, r: RiderRules | null) {
  if (j.blocked_reason === "batch_full") return `Your run is full${r ? ` at ${r.max_batch} jobs` : ""}. Finish a drop-off to take more.`;
  if (j.blocked_reason === "pickup_far") return `The shop is more than ${r?.pickup_radius_km ?? "a few"} km from the shops on your run.`;
  return `The drop-off is more than ${r?.batch_radius_km ?? "a few"} km from your run.`;
}

export function JobCard({ j, rules, picked, fits, onRun, onShift, busy, onPick, onClaim, onSkip }: {
  j: OpenJob;
  rules: RiderRules | null;
  picked: boolean;
  /** Could join the job the rider picked on the map. */
  fits: boolean;
  onRun: boolean;
  onShift: boolean;
  busy: boolean;
  onPick: () => void;
  onClaim: () => void;
  onSkip: () => void;
}) {
  const blocked = !j.batchable;
  return (
    <li id={`job-${j.id}`} className="job-card" data-picked={picked || undefined} data-blocked={blocked || undefined}>
      <div className="job-card-body" inert={blocked}>
        <button type="button" className="job-pick" aria-pressed={picked} onClick={onPick}>
          <span className="flex items-center gap-2">
            <span className="job-dot" data-tone={picked ? "live" : "open"} aria-hidden />
            <span className="font-semibold tabular-nums">{j.order_number}</span>
            <span className="min-w-0 truncate text-[13px] text-maxcontrast">{j.store.name}</span>
            <span className="price ml-auto text-text-success">{money(j.earning_cents)}</span>
          </span>
          <span className="job-facts mt-1">
            <span>Drop-off near {j.area ?? "the pin"}</span>
            {j.items > 0 && <span>{j.items} item{j.items === 1 ? "" : "s"}</span>}
            {j.distance_km !== null && <span>{j.distance_km.toFixed(1)} km to the shop</span>}
            {j.trip_km !== null && <span>{j.trip_km.toFixed(1)} km trip</span>}
            <span>Placed {ago(j.placed_at)}</span>
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
          {j.offered && <Badge state="plain">Offered to you{j.offer_expires_at ? ` until ${whenShort(j.offer_expires_at)}` : ""}</Badge>}
          {fits && <Badge state="good">Can ride with the one you picked</Badge>}
          {j.amount_due_cents > 0 && <span className="text-[12px] text-maxcontrast">Customer pays {money(j.amount_due_cents)} at the door</span>}
          <span className="ml-auto flex gap-2">
            <button type="button" className="btn btn-tertiary" onClick={onSkip} disabled={busy}>Skip</button>
            <button type="button" className="btn btn-primary" onClick={onClaim} disabled={busy || !onShift} title={onShift ? undefined : "Start your shift to take jobs"}>
              {busy ? "…" : onRun ? "Add to run" : "Accept"}
            </button>
          </span>
        </div>
      </div>
      {blocked && (
        <p className="job-card-lock">
          <Lock size={18} />
          <span><span className="tabular-nums">{j.order_number}</span>: {lockText(j, rules)}</span>
        </p>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------------------
// Stops on the run

function PayWhere({ pay, order }: { pay: PayInfo | null; order: string }) {
  if (!pay) return <>into the market&apos;s M-Pesa till or bank account, with <b className="tabular-nums">{order}</b> as the reference</>;
  const ways = [
    pay.mpesa_till && <>M-Pesa till <b className="tabular-nums">{pay.mpesa_till}</b></>,
    pay.mpesa_paybill && <>paybill <b className="tabular-nums">{pay.mpesa_paybill}</b>, account <b className="tabular-nums">{order}</b></>,
    pay.bank_account_number && <>{pay.bank_name ?? "bank"} account <b className="tabular-nums">{pay.bank_account_number}</b></>,
  ].filter(Boolean);
  return (
    <>
      to {ways.map((w, i) => <span key={i}>{i > 0 && (i === ways.length - 1 ? " or " : ", ")}{w}</span>)}
      {pay.account_name && <> ({pay.account_name})</>}, with <b className="tabular-nums">{order}</b> as the reference
    </>
  );
}

/**
 * At the door: the customer pays the market (never the vendor or the rider), and the rider
 * finds that payment by the transaction code from the customer's M-Pesa or bank message, or by
 * the payer's name. A code counts once, ever; the API refuses a code used on another order.
 */
function PaymentStep({ d, token, pay, check, onCheck }: {
  d: Delivery;
  token: string | null;
  pay: PayInfo | null;
  check: PaymentCheck | null;
  onCheck: (c: PaymentCheck) => void;
}) {
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // What this parcel costs. paid_cents covers the whole order, so it isn't subtracted here:
  // with several shops on one order it can include another parcel's payment.
  const due = check?.due_cents ?? d.amount_due_cents ?? 0;

  async function find(term: string) {
    if (term.length < 3) return setMsg("Type at least 3 characters of the code or the name.");
    setBusy("find");
    setMsg(null);
    try {
      onCheck(await api.riderPayment(token, d.id, term));
      setAsked(term);
    } catch (err) {
      setMsg(why(err, "Couldn't look that up. Check your signal and try again."));
    } finally {
      setBusy(null);
    }
  }

  async function use(m: PaymentMatch) {
    setBusy(m.receipt_id);
    setMsg(null);
    try {
      const next = await api.riderConfirmPayment(token, d.id, { receipt_id: m.receipt_id });
      onCheck(next);
      setAsked(null);
      setQ("");
      if (!next.payment_confirmed) setMsg(`Counted ${money(m.amount_cents, m.currency)}. That isn't the whole ${money(next.due_cents, next.currency)} yet: find the rest of the payment.`);
    } catch (err) {
      setMsg(why(err, "That didn't save. Check your signal and try again."));
      if (asked) api.riderPayment(token, d.id, asked).then(onCheck, () => {});
    } finally {
      setBusy(null);
    }
  }

  const matches = asked ? check?.matches ?? [] : [];
  return (
    <div className="mx-3 mb-3 rounded-xl border border-border p-3">
      <p className="text-[14px]">
        Ask the customer to pay <b>{money(due)}</b> <PayWhere pay={pay} order={d.order_number} />. Then type the
        transaction code from their message, or the name it was paid from.
      </p>
      {pay?.instructions && <p className="mt-1 text-[13px] text-maxcontrast">{pay.instructions}</p>}
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); find(q.trim()); }} className="mt-3 flex gap-2" role="search">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Transaction code or payer&apos;s name</span>
          <input
            className="field"
            value={q}
            maxLength={80}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="Code (e.g. SKL4H7Q2XZ) or name"
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <button className="btn btn-secondary" disabled={busy !== null}><Search size={16} />{busy === "find" ? "Looking…" : "Find"}</button>
      </form>
      {asked && (
        <div aria-live="polite">
          {matches.length === 0 ? (
            <p className="mt-3 text-[13px] text-maxcontrast">
              Nothing for &ldquo;{asked}&rdquo; yet. Payments reach the market a minute or two after the customer pays.{" "}
              <button type="button" className="link-u" onClick={() => find(asked)} disabled={busy !== null}>Check again</button>
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {matches.map((m) => (
                <li key={m.receipt_id} className="flex flex-wrap items-center gap-2 rounded-lg bg-background-hover px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold tabular-nums">{money(m.amount_cents, m.currency)} <span className="font-normal text-maxcontrast">· {m.code}</span></p>
                    <p className="text-[12px] text-maxcontrast">{m.payer_name ?? "Name not in the message"}{m.received_at && ` · ${whenShort(m.received_at)}`}</p>
                  </div>
                  {m.used ? (
                    <Badge state="alert">Already used</Badge>
                  ) : (
                    <>
                      {!m.enough && <Badge state="wait">Less than due</Badge>}
                      <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => use(m)}>
                        {busy === m.receipt_id ? "…" : m.enough ? "Confirm payment" : "Count it"}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {msg && <p className="mt-2 text-[13px]" role="status">{msg}</p>}
    </div>
  );
}

export function StopCard({ d, n, token, here, onShift, pay, onSaved, onDone }: {
  d: Delivery;
  /** Position on the run, in the order the orders were placed. */
  n: number;
  token: string | null;
  here: LatLng | null;
  onShift: boolean;
  pay: PayInfo | null;
  /** The stop changed on the server: reload the run. */
  onSaved: () => void;
  /** Delivered or handed back: reload the run, the totals and today's list. */
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [check, setCheck] = useState<PaymentCheck | null>(null);
  const [code, setCode] = useState("");
  const [failing, setFailing] = useState(false);
  const [note, setNote] = useState("");

  const due = check?.due_cents ?? d.amount_due_cents ?? 0;
  const paidCents = check?.paid_cents ?? 0;
  const paid = check?.payment_confirmed ?? d.payment_confirmed ?? false;
  const collected = d.status !== "accepted";
  const route = directions(here, collected ? d.dropoff : d.pickup, collected ? d.dropoff_address : null);
  const tel = d.customer_phone ? telHref(d.customer_phone) : null;

  async function step(task: () => Promise<unknown>, after: () => void) {
    setBusy(true);
    setMsg(null);
    try {
      await task();
      after();
    } catch (e) {
      setMsg(why(e, "That didn't save. Check your signal and try again."));
    } finally {
      setBusy(false);
    }
  }

  const next =
    d.status === "accepted" ? { label: `Picked up from ${d.store_name}`, go: () => step(() => api.riderAction(token, d.id, "picked_up"), onSaved) }
    : d.status === "picked_up" ? { label: "I'm at the door", icon: <Door size={18} />, go: () => step(() => api.riderArrived(token, d.id), onSaved) }
    : null;

  return (
    <li id={`stop-${d.id}`} className="job-card">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <span className="job-dot" data-tone="live" aria-hidden />
        <span className="font-semibold tabular-nums">Stop {n} · {d.order_number}</span>
        <StatusTag status={d.status} />
        {d.earning_cents != null && <span className="price ml-auto text-text-success">{money(d.earning_cents)}</span>}
      </div>

      <ol className="space-y-2.5 px-4 py-3 text-[14px]">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-element text-[12px] text-primary-element-text" aria-hidden>P</span>
          <span>
            <span className="sr-only">Pick up: </span><b>{d.store_name}</b>
            {d.pickup?.label && <><br />{d.pickup.label}</>}
            {collected && <span className="text-maxcontrast"> · collected</span>}
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success text-[12px] text-success-text" aria-hidden>D</span>
          <span className="min-w-0">
            <span className="sr-only">Deliver to: </span>
            {d.customer_name && <b>{d.customer_name}<br /></b>}
            {d.dropoff_address ?? d.dropoff?.label ?? "Address on the way"}
            {d.customer_phone && (
              <span className="mt-1 flex items-center gap-1.5">
                <Phone size={15} />
                {tel ? <a className="link-u tabular-nums" href={tel}>{d.customer_phone}</a> : <span className="tabular-nums">{d.customer_phone}</span>}
              </span>
            )}
          </span>
        </li>
      </ol>

      {d.customer_note && (
        <p className="note note-info mx-3 mb-3 text-[13px]">
          <Message size={16} />
          <span><b>From the customer:</b> {d.customer_note}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 text-[13px]">
        {due > 0 ? <span>Customer pays <b>{money(due)}</b> on arrival</span> : <span>Nothing to collect</span>}
        {paid ? <Badge state="good">Paid</Badge> : paidCents > 0 && paidCents < due ? <Badge state="wait">{money(paidCents)} of {money(due)} paid</Badge> : due > 0 && <Badge state="wait">Not paid yet</Badge>}
      </div>

      {d.status === "arrived" && !paid && <PaymentStep d={d} token={token} pay={pay} check={check} onCheck={(c) => { setCheck(c); if (c.payment_confirmed) onSaved(); }} />}

      {d.status === "arrived" && paid && (
        <form
          className="flex items-end gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{6}$/.test(code)) step(() => api.riderAction(token, d.id, "delivered", { code }), onDone);
          }}
        >
          <label className="flex-1">
            <span className="label">Customer&apos;s 6-digit handover code</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="field mt-1 text-[20px] tabular-nums"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>
          <button disabled={busy || code.length !== 6 || !onShift} className="btn btn-primary btn-lg">Delivered</button>
        </form>
      )}

      {msg && <p className="px-4 pb-2 text-[13px] text-text-error" role="alert">{msg}</p>}

      {failing ? (
        <form
          className="space-y-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim()) step(() => api.riderAction(token, d.id, "failed", { note: note.trim() }), onDone);
          }}
        >
          <label className="block">
            <span className="label">What went wrong?</span>
            <input required maxLength={300} className="field mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nobody home, wrong address, refused…" />
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn btn-tertiary flex-1" onClick={() => setFailing(false)}>Back</button>
            <button disabled={busy || !note.trim()} className="btn btn-error flex-1">Report and return to shop</button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2 border-t border-border p-3">
          {next && (
            <button disabled={busy || !onShift} onClick={next.go} className="btn btn-primary btn-lg flex-[2]">
              {next.icon}
              {onShift ? next.label : "Start shift to continue"}
            </button>
          )}
          {route && d.status !== "arrived" && <a className="btn btn-secondary btn-lg" target="_blank" rel="noopener noreferrer" href={route}>Directions</a>}
          <button onClick={() => { setFailing(true); setNote(""); }} className="btn btn-tertiary btn-lg">Can&apos;t deliver</button>
        </div>
      )}
    </li>
  );
}
