"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorLine, PageTitle } from "@/components/dash";
import { Plus, X } from "@/components/icons";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type VariantDraft = { color: string; color_hex: string; size: string; price: string; stock: string };
type Tier = { min_qty: string; price: string };

const toCents = (s: string) => Math.round(parseFloat(s) * 100);

export default function NewProduct() {
  const router = useRouter();
  const { token } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("women");
  const [variants, setVariants] = useState<VariantDraft[]>([{ color: "", color_hex: "#16130f", size: "", price: "", stock: "" }]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setV = (i: number, k: keyof VariantDraft, v: string) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const bad = variants.find((v) => !(toCents(v.price) > 0) || !/^\d+$/.test(v.stock));
    if (bad) return setError("Every variant needs a price above zero and a whole-number stock level.");
    setBusy(true);
    try {
      await api.createProduct(token, {
        title: title.trim(),
        description: description.trim(),
        category_slug: category,
        variants: variants.map((v) => ({ color: v.color || null, color_hex: /^#[0-9a-f]{6}$/i.test(v.color_hex) ? v.color_hex : null, size: v.size || null, price_cents: toCents(v.price), stock: parseInt(v.stock, 10) })),
        price_tiers: tiers.filter((t) => t.min_qty && t.price).map((t) => ({ min_qty: parseInt(t.min_qty, 10), price_cents: toCents(t.price) })),
      });
      router.push("/seller/products");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the product. Your draft is still here.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-3xl">
      <PageTitle kicker="Listings go live after a quick review" title="New product" />
      <div className="space-y-5">
        <label className="block"><span className="label">Title</span><input required minLength={4} maxLength={140} className="field mt-1" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="block"><span className="label">Department</span>
          <select className="field mt-1" value={category} onChange={(e) => setCategory(e.target.value)}>
            {[["women", "Women"], ["men", "Men"], ["shoes", "Shoes"], ["bags", "Bags & Accessories"], ["home", "Home & Living"], ["kitchen", "Kitchen"], ["electronics", "Electronics"], ["beauty", "Beauty"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Description</span><textarea required minLength={30} maxLength={5000} rows={6} className="field mt-1" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Materials, fit, care, what's in the box. Plain text only." /></label>

        <fieldset>
          <legend className="label mb-2">Variants</legend>
          <div className="space-y-2">
            {variants.map((v, i) => (
              <div key={i} className="grid grid-cols-[1fr_44px_80px_90px_80px_36px] items-center gap-2">
                <input className="field !h-9" placeholder="Colour" maxLength={40} value={v.color} onChange={(e) => setV(i, "color", e.target.value)} aria-label="Colour name" />
                <input type="color" className="h-9 w-11 border border-rule bg-card" value={v.color_hex} onChange={(e) => setV(i, "color_hex", e.target.value)} aria-label="Colour swatch" />
                <input className="field !h-9" placeholder="Size" maxLength={12} value={v.size} onChange={(e) => setV(i, "size", e.target.value)} aria-label="Size" />
                <input className="field !h-9 font-mono" placeholder="Price" inputMode="decimal" value={v.price} onChange={(e) => setV(i, "price", e.target.value.replace(/[^\d.]/g, ""))} aria-label="Price" />
                <input className="field !h-9 font-mono" placeholder="Stock" inputMode="numeric" value={v.stock} onChange={(e) => setV(i, "stock", e.target.value.replace(/\D/g, "").slice(0, 6))} aria-label="Stock" />
                <button type="button" disabled={variants.length === 1} onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))} className="btn btn-ghost btn-sm px-2" aria-label="Remove variant"><X size={16} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setVariants((vs) => [...vs, { ...vs[vs.length - 1] }])} className="btn btn-ghost btn-sm mt-2"><Plus size={16} /> Add variant</button>
        </fieldset>

        <fieldset>
          <legend className="label mb-2">Bulk pricing (optional)</legend>
          {tiers.map((t, i) => (
            <div key={i} className="mb-2 flex items-center gap-2 text-[14px]">
              <input className="field !h-9 w-24 font-mono" placeholder="Qty" inputMode="numeric" value={t.min_qty} onChange={(e) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, min_qty: e.target.value.replace(/\D/g, "") } : x)))} aria-label="Minimum quantity" />
              <span>+ units at</span>
              <input className="field !h-9 w-28 font-mono" placeholder="Unit price" inputMode="decimal" value={t.price} onChange={(e) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, price: e.target.value.replace(/[^\d.]/g, "") } : x)))} aria-label="Unit price" />
              <button type="button" onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))} className="btn btn-ghost btn-sm px-2" aria-label="Remove tier"><X size={16} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setTiers((ts) => [...ts, { min_qty: "", price: "" }])} className="btn btn-ghost btn-sm"><Plus size={16} /> Add a quantity break</button>
        </fieldset>

        <p className="text-[13px] text-ink-3">Photos are uploaded after the listing is created, from the product page in your dashboard.</p>
        <ErrorLine error={error} />
        <div className="flex gap-2 border-t border-ink pt-5">
          <button disabled={busy} className="btn btn-signal">{busy ? "Saving…" : "Submit for review"}</button>
          <button type="button" onClick={() => router.back()} className="btn btn-ghost">Cancel</button>
        </div>
      </div>
    </form>
  );
}
