"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { COUNTRIES } from "@/lib/countries";
import type { Plan } from "@/lib/types";
import { AlertCircle, Check, CheckCircle } from "./icons";
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
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <CheckCircle size={56} className="mx-auto text-text-success" />
        <p className="heading mt-3 text-[22px]">Application sent</p>
        <p className="mt-2 text-maxcontrast">We&apos;ll review <b>{f.store_name}</b> and email {supportEmail} within two working days. You can set up products in the meantime; they go live once you&apos;re approved.</p>
        <Link href="/seller" className="btn btn-primary mt-6">Open the vendor dashboard</Link>
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
    <div className="mx-auto max-w-3xl px-4 py-5 md:px-6">
      {demo && <DemoNotice what="a demo application" />}
      <h1 className="heading text-[22px]">Apply for a stall</h1>
      <ol className="mt-4 flex flex-wrap items-center gap-2 text-[14px]">
        {steps.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-3 bg-border-dark sm:w-6" aria-hidden />}
            <span className={`flex h-[28px] w-[28px] items-center justify-center rounded-full text-[13px] font-semibold tabular-nums ${i === step ? "bg-primary-element text-primary-element-text" : i < step ? "bg-success text-success-text" : "bg-background-dark text-maxcontrast"}`}>
              {i < step ? <Check size={16} /> : i + 1}
            </span>
            <span className={`hidden md:inline ${i === step ? "font-semibold" : "text-maxcontrast"}`}>{s}</span>
          </li>
        ))}
      </ol>

      <div className="card mt-5 space-y-5 p-4 md:p-6">
        {step === 0 && (
          <>
            <label className="block"><span className="label">Shop name</span>
              <input className="field mt-1" maxLength={120} value={f.store_name} onChange={(e) => {
                const name = e.target.value;
                setF((x) => ({ ...x, store_name: name, slug: x.slug && x.slug !== slugify(x.store_name) ? x.slug : slugify(name) }));
              }} />
            </label>
            <label className="block"><span className="label">Store address on the market</span>
              <div className="field field-group mt-1">
                <span className="pl-2 text-maxcontrast">/s/</span>
                <input className="" maxLength={80} value={f.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/--+/g, "-"))} />
              </div>
              <span className="mt-1 block text-[12px] text-maxcontrast">Lowercase letters, numbers and single dashes. At least 3 characters.</span>
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
                  <label key={v} className={`cursor-pointer rounded-element border px-3 py-1.5 text-[14px] ${f.business_type === v ? "border-primary-element bg-primary-element-light font-medium text-primary-element-light-text" : "border-border-maxcontrast hover:bg-background-hover"}`}>
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
              <label className="block"><span className="label">Registration number (optional)</span><input className="field mt-1 tabular-nums" maxLength={120} value={f.registration_number} onChange={(e) => set("registration_number", e.target.value)} /></label>
              <label className="block"><span className="label">Tax ID (optional)</span><input className="field mt-1 tabular-nums" maxLength={120} value={f.tax_id} onChange={(e) => set("tax_id", e.target.value)} /></label>
              <label className="block"><span className="label">Website (optional)</span><input className="field mt-1" maxLength={200} inputMode="url" value={f.website} onChange={(e) => set("website", e.target.value)} placeholder="yourshop.com" /></label>
              <label className="block"><span className="label">Business phone (optional)</span><input className="field mt-1" type="tel" maxLength={32} value={f.phone} onChange={(e) => set("phone", e.target.value.replace(/[^0-9 +().-]/g, ""))} /></label>
            </div>
            <p className="text-[12px] text-maxcontrast">Only the review team sees these. We ask so buyers know there&apos;s a real business behind each stall.</p>
          </>
        )}

        {step === 2 && (
          <>
            <fieldset><legend className="label mb-2">Departments</legend>
              <div className="flex flex-wrap gap-2">
                {["Women", "Men", "Shoes", "Bags & Accessories", "Home & Living", "Kitchen", "Electronics", "Beauty"].map((c) => {
                  const on = f.categories.includes(c);
                  return (
                    <button type="button" key={c} aria-pressed={on} onClick={() => set("categories", on ? f.categories.filter((x) => x !== c) : [...f.categories, c])} className={`rounded-pill border px-3 py-1 text-[14px] ${on ? "border-primary-element bg-primary-element-light font-medium text-primary-element-light-text" : "border-border-maxcontrast hover:bg-background-hover"}`}>{c}</button>
                  );
                })}
              </div>
            </fieldset>
            <label className="block"><span className="label">Describe your shop</span>
              <textarea className="field mt-1" rows={5} maxLength={4000} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="What you make or source, where, and who buys it." />
              <span className="mt-1 block text-right tabular-nums text-[12px] text-maxcontrast">{f.description.length}/4000</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="label">Orders you expect a month</span>
                <select className="field mt-1" value={f.monthly_orders} onChange={(e) => set("monthly_orders", e.target.value)}>
                  {["0-50", "50-250", "250-1000", "1000+"].map((v) => <option key={v}>{v}</option>)}
                </select>
              </label>
              <label className="mt-6 flex cursor-pointer items-center gap-2 text-[14px]"><input type="checkbox" className="accent-primary-element" checked={f.wholesale} onChange={(e) => set("wholesale", e.target.checked)} /> I want to offer bulk pricing</label>
            </div>
          </>
        )}

        {step === 3 && (
          <div className="grid gap-3">
            {plans.map((p) => (
              <label key={p.id} className={`flex cursor-pointer items-center gap-4 rounded-container border-2 p-4 ${f.plan_code === p.code ? "border-primary-element bg-primary-element-light" : "border-border hover:bg-background-hover"}`}>
                <input type="radio" className="accent-primary-element" checked={f.plan_code === p.code} onChange={() => set("plan_code", p.code)} />
                <span className="flex-1">
                  <span className="block font-semibold">{p.name}</span>
                  <span className="text-[13px] text-maxcontrast">
                    {p.product_limit ? `Up to ${p.product_limit.toLocaleString("en-US")} listings` : "Unlimited listings"}
                    {p.featured_slots ? ` · ${p.featured_slots} featured spot${p.featured_slots > 1 ? "s" : ""}` : ""}
                  </span>
                </span>
                <span className="text-[13px] font-semibold text-primary-element">Price on request</span>
              </label>
            ))}
            <p className="text-[13px] text-maxcontrast text-pretty">
              The market team confirms your rent and commission before anything is charged. Nothing is billed until you&apos;re
              approved, and you can switch plans any month. <a href="/sell#contact" className="link-u">Talk to the team</a>
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <dl className="divide-y divide-border text-[14px]">
              {[
                ["Shop", f.store_name],
                ["Address", `/s/${f.slug}`],
                ["Ships from", COUNTRIES.find(([c]) => c === f.country)?.[1] ?? f.country],
                ["Support email", supportEmail],
                ["Business", f.legal_name || f.store_name],
                ["Departments", f.categories.join(", ")],
                ["Plan", plan?.name ?? ""],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[140px_1fr] py-2.5"><dt className="text-maxcontrast">{k}</dt><dd className="break-words">{v}</dd></div>
              ))}
            </dl>
            <label className="flex cursor-pointer items-start gap-2 text-[14px]"><input type="checkbox" className="mt-1 accent-primary-element" checked={f.agree} onChange={(e) => set("agree", e.target.checked)} />I agree to the market&apos;s vendor terms, including shipping times, returns and the prohibited items list.</label>
          </div>
        )}
      </div>

      {error && <p role="alert" className="note note-error mt-4 text-[14px]"><AlertCircle size={18} /><span>{error}</span></p>}
      <div className="mt-4 flex justify-between gap-2">
        <button type="button" className="btn btn-tertiary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</button>
        {step < steps.length - 1 ? (
          <button type="button" className="btn btn-primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Continue</button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={!canNext || busy} onClick={submit}>{busy ? "Sending…" : "Send application"}</button>
        )}
      </div>
    </div>
  );
}

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}
