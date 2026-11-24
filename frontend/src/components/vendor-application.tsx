"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import type { Plan, PlanTier } from "@/lib/types";
import { Check } from "./icons";
import { DemoNotice } from "./ui";

const steps = ["Your shop", "What you sell", "Plan", "Review"];

export function VendorApplication({ plans, demo }: { plans: Plan[]; demo: boolean }) {
  const { token } = useAuth();
  const params = useSearchParams();
  const initialPlan = (plans.find((p) => p.id === params.get("plan"))?.id ?? "shopfront") as PlanTier;
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({
    store_name: "", slug: "", country: "", contact_phone: "", business_type: "individual",
    categories: [] as string[], description: "", monthly_orders: "0-50", wholesale: false,
    plan: initialPlan, agree: false,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api.applySeller(token, { ...f, agree: undefined });
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
        <p className="mt-4 text-[17px] text-ink-2">We&apos;ll review <b>{f.store_name}</b> and email you within two working days. You can set up products in the meantime; they go live once you&apos;re approved.</p>
        <Link href="/seller" className="btn btn-ink mt-8">Open the vendor dashboard</Link>
      </div>
    );

  const canNext = [
    f.store_name.trim().length >= 2 && /^[a-z0-9-]{3,40}$/.test(f.slug) && f.country.trim().length >= 2,
    f.categories.length > 0 && f.description.trim().length >= 30,
    Boolean(f.plan),
    f.agree,
  ][step];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {demo && <DemoNotice what="a demo application" />}
      <h1 className="display text-[56px] md:text-[72px]">Apply for a stall</h1>
      <ol className="mt-6 grid grid-cols-4 border border-ink text-[12px]">
        {steps.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 p-3 ${i ? "border-l border-ink" : ""} ${i === step ? "bg-ink text-paper" : i < step ? "bg-market-2" : ""}`}>
            <span className="font-mono">{i < step ? <Check size={14} /> : `0${i + 1}`}</span>
            <span className="hidden font-semibold sm:inline">{s}</span>
          </li>
        ))}
      </ol>

      <div className="mt-8 space-y-5">
        {step === 0 && (
          <>
            <label className="block"><span className="label">Shop name</span>
              <input className="field mt-1" maxLength={60} value={f.store_name} onChange={(e) => {
                const name = e.target.value;
                setF((x) => ({ ...x, store_name: name, slug: x.slug && x.slug !== slugify(x.store_name) ? x.slug : slugify(name) }));
              }} />
            </label>
            <label className="block"><span className="label">Store address on the market</span>
              <div className="mt-1 flex items-center border border-rule bg-card focus-within:border-ink">
                <span className="pl-3 font-mono text-[13px] text-ink-3">/s/</span>
                <input className="h-11 flex-1 bg-transparent px-1 font-mono text-[13px] outline-none" maxLength={40} value={f.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
              </div>
              <span className="mt-1 block text-[12px] text-ink-3">Lowercase letters, numbers and dashes, 3 to 40 characters.</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="label">Country you ship from</span><input className="field mt-1" maxLength={60} value={f.country} onChange={(e) => set("country", e.target.value)} /></label>
              <label className="block"><span className="label">Contact phone</span><input className="field mt-1" type="tel" maxLength={24} value={f.contact_phone} onChange={(e) => set("contact_phone", e.target.value.replace(/[^0-9 +()-]/g, ""))} /></label>
            </div>
            <fieldset><legend className="label mb-2">You are</legend>
              <div className="flex flex-wrap gap-2">
                {[["individual", "An individual maker"], ["company", "A registered business"], ["manufacturer", "A manufacturer or wholesaler"]].map(([v, l]) => (
                  <label key={v} className={`cursor-pointer border px-3 py-2 text-[14px] ${f.business_type === v ? "border-ink bg-ink text-paper" : "border-rule"}`}>
                    <input type="radio" className="sr-only" checked={f.business_type === v} onChange={() => set("business_type", v)} />{l}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {step === 1 && (
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
              <textarea className="field mt-1" rows={5} maxLength={1000} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="What you make or source, where, and who buys it." />
              <span className="mt-1 block text-right font-mono text-[11px] text-ink-3">{f.description.length}/1000</span>
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

        {step === 2 && (
          <div className="grid gap-3">
            {plans.map((p) => (
              <label key={p.id} className={`flex cursor-pointer items-center gap-4 border-2 p-4 ${f.plan === p.id ? "border-ink bg-card" : "border-rule"}`}>
                <input type="radio" className="accent-ink" checked={f.plan === p.id} onChange={() => set("plan", p.id)} />
                <span className="flex-1"><span className="display block text-[26px]">{p.name}</span><span className="text-[13px] text-ink-3">{p.product_limit ? `Up to ${p.product_limit.toLocaleString("en-US")} listings` : "Unlimited listings"} · {(p.commission_rate * 100).toFixed(0)}% commission</span></span>
                <span className="price text-[20px]">{money(p.monthly_price_cents)}<span className="text-[12px] text-ink-3">/mo</span></span>
              </label>
            ))}
            <p className="text-[13px] text-ink-3">Nothing is charged until you&apos;re approved. You can switch plans any month.</p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <dl className="divide-y divide-rule border-y border-ink text-[14px]">
              {[["Shop", f.store_name], ["Address", `/s/${f.slug}`], ["Ships from", f.country], ["Departments", f.categories.join(", ")], ["Plan", plans.find((p) => p.id === f.plan)?.name ?? ""]].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[140px_1fr] py-2.5"><dt className="text-ink-3">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            <label className="flex cursor-pointer items-start gap-2 text-[14px]"><input type="checkbox" className="mt-1 accent-ink" checked={f.agree} onChange={(e) => set("agree", e.target.checked)} />I agree to the market&apos;s vendor terms, including shipping times, returns and the prohibited items list.</label>
          </div>
        )}
      </div>

      {error && <p role="alert" className="mt-6 border-l-2 border-signal pl-3 text-[13px] text-signal">{error}</p>}
      <div className="mt-10 flex justify-between border-t border-ink pt-6">
        <button type="button" className="btn btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</button>
        {step < 3 ? (
          <button type="button" className="btn btn-ink" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Continue</button>
        ) : (
          <button type="button" className="btn btn-signal" disabled={!canNext || busy} onClick={submit}>{busy ? "Sending…" : "Send application"}</button>
        )}
      </div>
    </div>
  );
}

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
}
