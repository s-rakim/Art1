"use client";
import Link from "next/link";
import { useState } from "react";
import { ErrorLine, PageTitle } from "@/components/dash";
import { ContactCard } from "@/components/ui/contact-card";
import { api, ApiError } from "@/lib/api";
import type { Settings } from "@/lib/types";
import { useDraft } from "@/lib/hooks";
import { currencySign } from "@/lib/format";
import { useApi } from "@/lib/use-api";

// Every amount shoppers and vendors see comes from here or from Store space (stall rent and
// placements). Nothing about money is fixed in the code.

type Draft = Record<
  "standard" | "express" | "free_over" | "rider_fee" | "tax" | "contact_name" | "contact_email" | "contact_phone" | "contact_whatsapp" | "contact_note",
  string
>;

const sign = currencySign();
const toDollars = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2));
const PHONE = /^[0-9+() .-]{6,32}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fromSettings(s: Settings): Draft {
  return {
    standard: toDollars(s.standard_shipping_cents),
    express: toDollars(s.express_shipping_cents),
    free_over: toDollars(s.free_shipping_over_cents),
    rider_fee: toDollars(s.rider_fee_cents),
    tax: s.tax_rate == null ? "" : String(Math.round(s.tax_rate * 10000) / 100),
    contact_name: s.contact_name ?? "",
    contact_email: s.contact_email ?? "",
    contact_phone: s.contact_phone ?? "",
    contact_whatsapp: s.contact_whatsapp ?? "",
    contact_note: s.contact_note ?? "",
  };
}

/** Dollars typed by the admin to integer cents. Empty gives null; anything else invalid gives NaN. */
function cents(v: string): number | null {
  const t = v.trim().replace(/[$,\s]/g, "");
  if (!t) return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(parseFloat(t) * 100);
}

type Errors = Partial<Record<keyof Draft, string>>;

function validate(d: Draft): { errors: Errors; patch: Partial<Settings> } {
  const errors: Errors = {};
  const need = (k: keyof Draft, label: string) => {
    const c = cents(d[k]);
    if (c === null) errors[k] = `${label} is needed. Enter 0 for free.`;
    else if (Number.isNaN(c)) errors[k] = "Use an amount like 4.99.";
    return c ?? 0;
  };
  const standard = need("standard", "Standard delivery");
  const express = need("express", "Express delivery");
  const rider = need("rider_fee", "The rider fee");
  const freeOver = cents(d.free_over);
  if (Number.isNaN(freeOver) || freeOver === 0) errors.free_over = "Use an amount like 50, or leave it empty.";
  const taxText = d.tax.trim().replace("%", "");
  const tax = taxText === "" ? 0 : Number(taxText);
  if (!Number.isFinite(tax) || tax < 0 || tax > 50) errors.tax = "Use a rate between 0 and 50.";
  const email = d.contact_email.trim();
  if (email && !EMAIL.test(email)) errors.contact_email = "That doesn't look like an email address.";
  for (const k of ["contact_phone", "contact_whatsapp"] as const) {
    const v = d[k].trim();
    if (v && !PHONE.test(v)) errors[k] = "Digits, spaces, + ( ) . and - only, 6 to 32 characters.";
  }
  const text = (v: string) => v.trim() || null;
  return {
    errors,
    patch: {
      standard_shipping_cents: standard,
      express_shipping_cents: express,
      free_shipping_over_cents: freeOver && !Number.isNaN(freeOver) ? freeOver : null,
      rider_fee_cents: rider,
      tax_rate: Math.round(tax * 100) / 10000,
      contact_name: text(d.contact_name),
      contact_email: text(d.contact_email),
      contact_phone: text(d.contact_phone),
      contact_whatsapp: text(d.contact_whatsapp),
      contact_note: text(d.contact_note),
    },
  };
}

export default function Pricing() {
  const { data, setData, error, token } = useApi((t) => api.adminSettings(t));
  const [draft, setDraft] = useDraft(data, fromSettings);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const { errors: found, patch } = validate(draft);
    setErrors(found);
    if (Object.keys(found).length) {
      setMsg({ ok: false, text: "Check the highlighted fields." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const s = await api.adminUpdateSettings(token, patch);
      setData(s);
      setMsg({ ok: true, text: "Saved. New orders use these fees from now on; orders already placed keep theirs." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Couldn't save. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const field = (k: keyof Draft, label: string, opts: { hint?: string; prefix?: string; suffix?: string; inputMode?: "decimal" | "email" | "tel" | "text"; type?: string } = {}) =>
    draft && (
      // The hint sits outside the label so screen readers hear the field's name, then the hint.
      <div>
        <label htmlFor={`fee-${k}`} className="label">{label}</label>
        <span className="relative mt-1 block">
          {opts.prefix && <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-maxcontrast">{opts.prefix}</span>}
          <input
            id={`fee-${k}`}
            className="field tabular-nums"
            style={{ paddingLeft: opts.prefix ? `calc(1.25rem + ${opts.prefix.length}ch)` : undefined, paddingRight: opts.suffix ? "2rem" : undefined }}
            type={opts.type ?? "text"}
            inputMode={opts.inputMode ?? "decimal"}
            value={draft[k]}
            aria-invalid={errors[k] ? true : undefined}
            aria-describedby={errors[k] || opts.hint ? `${k}-help` : undefined}
            onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
          />
          {opts.suffix && <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-maxcontrast">{opts.suffix}</span>}
        </span>
        {(errors[k] || opts.hint) && (
          <span id={`${k}-help`} className={`mt-1 block text-[12px] ${errors[k] ? "text-text-error" : "text-maxcontrast"}`}>{errors[k] ?? opts.hint}</span>
        )}
      </div>
    );

  return (
    <>
      <PageTitle title="Fees and contact" kicker="What shoppers pay for delivery, and who vendors call" />
      <ErrorLine error={error} />
      {draft && data && (
        <form onSubmit={save} noValidate className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <section className="rounded-container border border-border-dark bg-main-background p-5">
              <h2 className="heading text-[18px]">Delivery and tax</h2>
              <p className="mt-1 text-[13px] text-maxcontrast text-pretty">In {data.currency}. Shoppers see these at checkout. Riders are paid the rider fee for each delivery.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {field("standard", "Standard delivery", { prefix: sign })}
                {field("express", "Express delivery", { prefix: sign })}
                {field("free_over", "Free standard delivery over", { prefix: sign, hint: "Per store. Leave empty if delivery is never free." })}
                {field("rider_fee", "Rider fee per delivery", { prefix: sign })}
                {field("tax", "Tax rate", { suffix: "%", hint: "0 if prices already include tax." })}
              </div>
            </section>

            <section className="rounded-container border border-border-dark bg-main-background p-5">
              <h2 className="heading text-[18px]">Market team contact</h2>
              <p className="mt-1 text-[13px] text-maxcontrast text-pretty">Shown on the Rent a stall page instead of prices, so would-be vendors can ask for a quote.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {field("contact_name", "Name", { inputMode: "text", hint: "A person or a team, like “Stall rentals”." })}
                {field("contact_email", "Email", { inputMode: "email", type: "email" })}
                {field("contact_phone", "Phone", { inputMode: "tel", type: "tel" })}
                {field("contact_whatsapp", "WhatsApp", { inputMode: "tel", type: "tel", hint: "With the country code, like +234 803 555 0142." })}
              </div>
              <label className="mt-4 block">
                <span className="label">Note</span>
                <textarea
                  rows={3}
                  maxLength={500}
                  className="field mt-1"
                  value={draft.contact_note}
                  aria-describedby="contact_note-help"
                  onChange={(e) => setDraft({ ...draft, contact_note: e.target.value })}
                />
                <span id="contact_note-help" className="mt-1 block text-[12px] text-maxcontrast">Hours, or what to have ready. {500 - draft.contact_note.length} characters left.</span>
              </label>
            </section>

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={busy} className="btn btn-primary">{busy ? "Saving…" : "Save fees and contact"}</button>
              <Link href="/admin/space" className="btn btn-tertiary">Stall rent and placement prices</Link>
            </div>
            {msg && <p role="status" aria-live="polite" className={`border-l-2 pl-3 text-[13px] ${msg.ok ? "border-element-success text-text-success" : "border-element-error text-text-error"}`}>{msg.text}</p>}
          </div>

          <aside className="xl:sticky xl:top-[60px] xl:self-start">
            <p className="label mb-2">Preview on the Rent a stall page</p>
            <ContactCard
              name={draft.contact_name.trim() || "The market team"}
              role="Stall rentals and vendor support"
              email={draft.contact_email.trim() || null}
              phone={draft.contact_phone.trim() || null}
              whatsapp={draft.contact_whatsapp.trim() || null}
              note={draft.contact_note.trim() || null}
            />
          </aside>
        </form>
      )}
    </>
  );
}
