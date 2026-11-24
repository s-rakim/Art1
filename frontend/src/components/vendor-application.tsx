"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { COUNTRIES } from "@/lib/countries";
import { money } from "@/lib/format";
import type { Plan } from "@/lib/types";
import { Check } from "./icons";
import { DemoNotice } from "./ui";

const steps = ["Your shop", "Your business", "What you sell", "Plan", "Review"];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function VendorApplication({ plans, demo }: { plans: Plan[]; demo: boolean }) {
  const { token, email } = useAuth();
  const params = useSearchParams();
  const wanted = params.get("plan");
  const initialPlan = plans.find((p) => p.code === wanted)?.code ?? plans.find((p) => p.highlighted)?.code ?? plans[0]?.code ?? "starter";
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({
    store_name: "", slug: "", tagline: "", country: "", support_email: "",
    business_type: "individual", legal_name: "", registration_number: "", tax_id: "", website: "", phone: "",
    categories: [] as string[], description: "", monthly_orders: "0-50", wholesale: false,
    plan_code: initialPlan, agree: false,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const supportEmail = f.support_email || email || "";

  async function submit() {
    setBusy(true);
    setError("");
    const opt = (s: string) => (s.trim() ? s.trim() : null);
    const site = f.website.trim() ? (/^https:\/\//i.test(f.website.trim()) ? f.website.trim() : `https://${f.website.trim().replace(/^http:\/\//i, "")}`) : null;
    // The API has no fields for these, so they travel in the note to the review team.
    const note = [
      `Seller type: ${f.business_type}`,
      f.categories.length ? `Departments: ${f.categories.join(", ")}` : "",
      `Expected orders a month: ${f.monthly_orders}`,
      f.wholesale ? "Wants to offer bulk pricing" : "",
    ].filter(Boolean).join(". ");
    try {
      await api.applySeller(token, {
        store_name: f.store_name.trim(),
        slug: f.slug || null,
        tagline: opt(f.tagline),
        description: opt(f.description),
        country: f.country,
        support_email: supportEmail.trim(),
        plan_code: f.plan_code,
        business: {
          legal_name: f.business_type === "individual" && !f.legal_name.trim() ? f.store_name.trim() : f.legal_name.trim(),
          registration_number: opt(f.registration_number),
          tax_id: opt(f.tax_id),
          website: site,
          phone: opt(f.phone),
        },
        message: note.slice(0, 500),
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "We couldn't send your application. Nothing was charged. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="display text-[64px]">Application in.</p>
        <p className="mt-4 text-[17px] text-ink-2">We&apos;ll review <b>{f.store_name}</b> and email {supportEmail} within two working days. You can set up products in the meantime; they go live once you&apos;re approved.</p>
        <Link href="/seller" className="btn btn-ink mt-8">Open the vendor dashboard</Link>
      </div>
    );

  const canNext = [
    f.store_name.trim().length >= 2 && SLUG.test(f.slug) && f.slug.length >= 3 && /^[A-Z]{2}$/.test(f.country) && EMAIL.test(supportEmail),
    (f.business_type === "individual" || f.legal_name.trim().length >= 2) && (!f.website.trim() || /^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(f.website.trim())),
    f.categories.length > 0 && f.description.trim().length >= 30,
    Boolean(f.plan_code),
    f.agree,
  ][step];
  const plan = plans.find((p) => p.code === f.plan_code);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {demo && <DemoNotice what="a demo application" />}
      <h1 className="display text-[56px] md:text-[72px]">Apply for a stall</h1>
      <ol className="mt-6 grid grid-cols-5 border border-ink text-[12px]">
        {steps.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 p-3 ${i ? "border-l border-ink" : ""} ${i === step ? "bg-ink text-paper" : i < step ? "bg-market-2" : ""}`}>
            <span className="font-mono">{i < step ? <Check size={14} /> : `0${i + 1}`}</span>
            <span className="hidden font-semibold md:inline">{s}</span>
          </li>
        ))}
      </ol>

      <div className="mt-8 space-y-5">
        {step === 0 && (
          <>
            <label className="block"><span className="label">Shop name</span>
              <input className="field mt-1" maxLength={120} value={f.store_name} onChange={(e) => {
                const name = e.target.value;
                setF((x) => ({ ...x, store_name: name, slug: x.slug && x.slug !== slugify(x.store_name) ? x.slug : slugify(name) }));
              }} />
            </label>
            <label className="block"><span className="label">Store address on the market</span>
              <div className="mt-1 flex items-center border border-rule bg-card focus-within:border-ink">
                <span className="pl-3 font-mono text-[13px] text-ink-3">/s/</span>
                <input className="h-11 flex-1 bg-transparent px-1 font-mono text-[13px] outline-none" maxLength={80} value={f.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/--+/g, "-"))} />
              </div>
              <span className="mt-1 block text-[12px] text-ink-3">Lowercase letters, numbers and single dashes. At least 3 characters.</span>
            </label>
            <label className="block"><span className="label">Tagline (optional)</span><input className="field mt-1" maxLength={120} value={f.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Linen clothes cut in Lagos" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="label">Country you ship from</span>
                <select className="field mt-1" value={f.country} onChange={(e) => set("country", e.target.value)}>
                  <option value="" disabled>Choose</option>
                  {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
                </select>
              </label>
              <label className="block"><span className="label">Support email shoppers see</span><input type="email" className="field mt-1" maxLength={254} value={supportEmail} onChange={(e) => set("support_email", e.target.value)} /></label>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <fieldset><legend className="label mb-2">You are</legend>
              <div className="flex flex-wrap gap-2">
                {[["individual", "An individual maker"], ["company", "A registered business"], ["manufacturer", "A manufacturer or wholesaler"]].map(([v, l]) => (
                  <label key={v} className={`cursor-pointer border px-3 py-2 text-[14px] ${f.business_type === v ? "border-ink bg-ink text-paper" : "border-rule"}`}>
                    <input type="radio" className="sr-only" checked={f.business_type === v} onChange={() => set("business_type", v)} />{l}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block">
              <span className="label">{f.business_type === "individual" ? "Your legal name (optional, we use the shop name if blank)" : "Registered business name"}</span>
              <input className="field mt-1" maxLength={120} value={f.legal_name} onChange={(e) => set("legal_name", e.target.value)} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="label">Registration number (optional)</span><input className="field mt-1 font-mono" maxLength={120} value={f.registration_number} onChange={(e) => set("registration_number", e.target.value)} /></label>
              <label className="block"><span className="label">Tax ID (optional)</span><input className="field mt-1 font-mono" maxLength={120} value={f.tax_id} onChange={(e) => set("tax_id", e.target.value)} /></label>
              <label className="block"><span className="label">Website (optional)</span><input className="field mt-1" maxLength={200} inputMode="url" value={f.website} onChange={(e) => set("website", e.target.value)} placeholder="yourshop.com" /></label>
              <label className="block"><span className="label">Business phone (optional)</span><input className="field mt-1" type="tel" maxLength={32} value={f.phone} onChange={(e) => set("phone", e.target.value.replace(/[^0-9 +().-]/g, ""))} /></label>
            </div>
            <p className="text-[12px] text-ink-3">Only the review team sees these. We ask so buyers know there&apos;s a real business behind each stall.</p>
          </>
        )}

        {step === 2 && (
          <>
            <fieldset><legend className="label mb-2">Departments</legend>
              <div className="flex flex-wrap gap-2">
                {["Women", "Men", "Shoes", "Bags & Accessories", "Home & Living", "Kitchen", "Electronics", "Beauty"].map((c) => {
                  const on = f.categories.includes(c);
                  return (
                    <button type="button" key={c} aria-pressed={on} onClick={() => set("categories", on ? f.categories.filter((x) => x !== c) : [...f.categories, c])} className={`border px-3 py-2 text-[14px] ${on ? "border-ink bg-ink text-paper" : "border-rule hover:border-ink"}`}>{c}</button>
                  );
                })}
              </div>
            </fieldset>
            <label className="block"><span className="label">Describe your shop</span>
              <textarea className="field mt-1" rows={5} maxLength={4000} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="What you make or source, where, and who buys it." />
              <span className="mt-1 block text-right font-mono text-[11px] text-ink-3">{f.description.length}/4000</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="label">Orders you expect a month</span>
                <select className="field mt-1" value={f.monthly_orders} onChange={(e) => set("monthly_orders", e.target.value)}>
                  {["0-50", "50-250", "250-1000", "1000+"].map((v) => <option key={v}>{v}</option>)}
                </select>
              </label>
              <label className="mt-6 flex cursor-pointer items-center gap-2 text-[14px]"><input type="checkbox" className="accent-ink" checked={f.wholesale} onChange={(e) => set("wholesale", e.target.checked)} /> I want to offer bulk pricing</label>
            </div>
          </>
        )}

        {step === 3 && (
          <div className="grid gap-3">
            {plans.map((p) => (
              <label key={p.id} className={`flex cursor-pointer items-center gap-4 border-2 p-4 ${f.plan_code === p.code ? "border-ink bg-card" : "border-rule"}`}>
                <input type="radio" className="accent-ink" checked={f.plan_code === p.code} onChange={() => set("plan_code", p.code)} />
                <span className="flex-1">
                  <span className="display block text-[26px]">{p.name}</span>
                  <span className="text-[13px] text-ink-3">
                    {p.product_limit ? `Up to ${p.product_limit.toLocaleString("en-US")} listings` : "Unlimited listings"} · {(p.commission_rate * 100).toFixed(p.commission_rate * 100 % 1 ? 1 : 0)}% commission
                    {p.per_item_fee_cents ? ` + ${money(p.per_item_fee_cents)} per unit` : ""}
                  </span>
                </span>
                <span className="price text-[20px]">{p.monthly_price_cents ? money(p.monthly_price_cents) : "Free"}<span className="text-[12px] text-ink-3">{p.monthly_price_cents ? "/mo" : ""}</span></span>
              </label>
            ))}
            <p className="text-[13px] text-ink-3">Nothing is charged until you&apos;re approved. You can switch plans any month.</p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <dl className="divide-y divide-rule border-y border-ink text-[14px]">
              {[
                ["Shop", f.store_name],
                ["Address", `/s/${f.slug}`],
                ["Ships from", COUNTRIES.find(([c]) => c === f.country)?.[1] ?? f.country],
                ["Support email", supportEmail],
                ["Business", f.legal_name || f.store_name],
                ["Departments", f.categories.join(", ")],
                ["Plan", plan?.name ?? ""],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[140px_1fr] py-2.5"><dt className="text-ink-3">{k}</dt><dd className="break-words">{v}</dd></div>
              ))}
            </dl>
            <label className="flex cursor-pointer items-start gap-2 text-[14px]"><input type="checkbox" className="mt-1 accent-ink" checked={f.agree} onChange={(e) => set("agree", e.target.checked)} />I agree to the market&apos;s vendor terms, including shipping times, returns and the prohibited items list.</label>
          </div>
        )}
      </div>

      {error && <p role="alert" className="mt-6 border-l-2 border-signal pl-3 text-[13px] text-signal">{error}</p>}
      <div className="mt-10 flex justify-between border-t border-ink pt-6">
        <button type="button" className="btn btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</button>
        {step < steps.length - 1 ? (
          <button type="button" className="btn btn-ink" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Continue</button>
        ) : (
          <button type="button" className="btn btn-signal" disabled={!canNext || busy} onClick={submit}>{busy ? "Sending…" : "Send application"}</button>
        )}
      </div>
    </div>
  );
}

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}
