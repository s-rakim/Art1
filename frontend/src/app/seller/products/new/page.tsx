"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorLine, PageTitle } from "@/components/dash";
import { ImageIcon, Plus, Video, X } from "@/components/icons";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";

type VariantDraft = { color: string; color_hex: string; size: string; sku: string; price: string; compare: string; stock: string; moq: string };
type Tier = { min_qty: string; price: string };
type Spec = { k: string; v: string };

const toCents = (s: string) => Math.round(parseFloat(s) * 100);
const skuPart = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 6);
const autoSku = (title: string, v: VariantDraft, i: number) =>
  [title.split(/\s+/).map((w) => w[0] ?? "").join("").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "ITEM", skuPart(v.color), skuPart(v.size), String(i + 1)]
    .filter(Boolean)
    .join("-");

const blank: VariantDraft = { color: "", color_hex: "#222222", size: "", sku: "", price: "", compare: "", stock: "", moq: "1" };

export default function NewProduct() {
  const router = useRouter();
  const { token } = useAuth();
  const cats = useApi(() => api.categories());
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [variants, setVariants] = useState<VariantDraft[]>([{ ...blank }]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [busy, setBusy] = useState<"draft" | "active" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setV = (i: number, k: keyof VariantDraft, v: string) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  async function submit(status: "draft" | "active") {
    setError(null);
    const bad = variants.find((v) => !(toCents(v.price) > 0) || !/^\d+$/.test(v.stock));
    if (bad) return setError("Every variant needs a price above zero and a whole-number stock level.");
    const skus = variants.map((v, i) => (v.sku.trim() || autoSku(title, v, i)).slice(0, 64));
    if (skus.some((s) => !/^[A-Za-z0-9._-]+$/.test(s))) return setError("SKUs can only use letters, numbers, dots, dashes and underscores.");
    if (new Set(skus).size !== skus.length) return setError("Each variant needs its own SKU.");
    const tierList = tiers
      .filter((t) => t.min_qty && t.price)
      .map((t) => ({ min_qty: Math.min(999, parseInt(t.min_qty, 10)), price_cents: toCents(t.price) }))
      .filter((t) => t.min_qty > 1 && t.price_cents > 0)
      .sort((a, b) => a.min_qty - b.min_qty);
    setBusy(status);
    try {
      const created = await api.createProduct(token, {
        title: title.trim(),
        description: description.trim(),
        brand: brand.trim() || null,
        category_id: category || null,
        status,
        attributes: Object.fromEntries(specs.filter((s) => s.k.trim() && s.v.trim()).map((s) => [s.k.trim().slice(0, 120), s.v.trim().slice(0, 120)])),
        tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20).map((t) => t.slice(0, 40)),
        images: [],
        variants: variants.map((v, i) => {
          const options: Record<string, string> = {};
          if (v.color.trim()) options.color = v.color.trim();
          if (v.color.trim() && /^#[0-9a-f]{6}$/i.test(v.color_hex)) options.color_hex = v.color_hex.toLowerCase();
          if (v.size.trim()) options.size = v.size.trim();
          const compare = v.compare ? toCents(v.compare) : null;
          return {
            sku: skus[i],
            title: [v.color.trim(), v.size.trim()].filter(Boolean).join(" / ") || "Default",
            options,
            price_cents: toCents(v.price),
            compare_at_cents: compare && compare > toCents(v.price) ? compare : null,
            stock: parseInt(v.stock, 10),
            min_order_qty: Math.max(1, Math.min(999, parseInt(v.moq || "1", 10) || 1)),
            tier_prices: tierList,
            is_active: true,
          };
        }),
      });
      // Photos and the video go through the editor, where each file is checked and cleaned on upload.
      router.push(`/seller/products/${encodeURIComponent(created.id)}?created=1`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the product. Your draft is still here.");
      setBusy(null);
    }
  }

  const roots = (cats.data ?? []).filter((c) => !c.parent_id);
  const kids = (id: string) => (cats.data ?? []).filter((c) => c.parent_id === id);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit("active");
      }}
      className="max-w-4xl"
    >
      <PageTitle kicker="Save a draft, or publish once your stall is approved" title="New product" />
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
          <label className="block"><span className="label">Title</span><input required minLength={4} maxLength={200} className="field mt-1" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="block"><span className="label">Brand (optional)</span><input maxLength={120} className="field mt-1" value={brand} onChange={(e) => setBrand(e.target.value)} /></label>
        </div>
        <label className="block"><span className="label">Category</span>
          <select required className="field mt-1" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="" disabled>Choose one</option>
            {roots.map((r) => {
              const sub = kids(r.id);
              return sub.length ? (
                <optgroup key={r.id} label={r.name}>
                  <option value={r.id}>{r.name}, general</option>
                  {sub.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ) : (
                <option key={r.id} value={r.id}>{r.name}</option>
              );
            })}
          </select>
        </label>
        <label className="block"><span className="label">Description</span><textarea required minLength={30} maxLength={20000} rows={6} className="field mt-1" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Materials, fit, care, what's in the box. Plain text only." /></label>

        <div className="flex items-start gap-3 rounded-container border border-border-dark bg-background-hover px-4 py-3 text-[14px]">
          <span aria-hidden className="mt-0.5 flex gap-1 text-primary-element"><ImageIcon size={20} /><Video size={20} /></span>
          <p className="text-pretty">Photos and a video come next. Save the details here first, then add up to 12 photos and one short clip on the listing&apos;s page.</p>
        </div>

        <fieldset>
          <legend className="label mb-2">Variants</legend>
          <div className="overflow-x-auto">
            <div className="min-w-[760px] space-y-2">
              <div className="grid grid-cols-[1fr_44px_80px_130px_90px_90px_70px_60px_36px] gap-2 tabular-nums text-[12px] text-maxcontrast">
                <span>Colour</span><span /><span>Size</span><span>SKU</span><span>Price</span><span>Was</span><span>Stock</span><span>Min</span><span />
              </div>
              {variants.map((v, i) => (
                <div key={i} className="grid grid-cols-[1fr_44px_80px_130px_90px_90px_70px_60px_36px] items-center gap-2">
                  <input className="field" placeholder="Colour" maxLength={40} value={v.color} onChange={(e) => setV(i, "color", e.target.value)} aria-label="Colour name" />
                  <input type="color" className="rounded-element h-9 w-11 border border-border bg-main-background" value={v.color_hex} onChange={(e) => setV(i, "color_hex", e.target.value)} aria-label="Colour swatch" />
                  <input className="field" placeholder="Size" maxLength={12} value={v.size} onChange={(e) => setV(i, "size", e.target.value)} aria-label="Size" />
                  <input className="field tabular-nums text-[12px]" placeholder={autoSku(title, v, i)} maxLength={64} value={v.sku} onChange={(e) => setV(i, "sku", e.target.value.replace(/[^A-Za-z0-9._-]/g, ""))} aria-label="SKU" />
                  <input required className="field tabular-nums" placeholder="0.00" inputMode="decimal" value={v.price} onChange={(e) => setV(i, "price", e.target.value.replace(/[^\d.]/g, ""))} aria-label="Price" />
                  <input className="field tabular-nums" placeholder="optional" inputMode="decimal" value={v.compare} onChange={(e) => setV(i, "compare", e.target.value.replace(/[^\d.]/g, ""))} aria-label="Original price, shown struck through" />
                  <input required className="field tabular-nums" placeholder="0" inputMode="numeric" value={v.stock} onChange={(e) => setV(i, "stock", e.target.value.replace(/\D/g, "").slice(0, 7))} aria-label="Stock" />
                  <input className="field tabular-nums" inputMode="numeric" value={v.moq} onChange={(e) => setV(i, "moq", e.target.value.replace(/\D/g, "").slice(0, 3))} aria-label="Minimum order quantity" />
                  <button type="button" disabled={variants.length === 1} onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))} className="btn btn-tertiary btn-sm px-2" aria-label="Remove variant"><X size={16} /></button>
                </div>
              ))}
            </div>
          </div>
          <button type="button" disabled={variants.length >= 100} onClick={() => setVariants((vs) => [...vs, { ...vs[vs.length - 1], sku: "", size: "" }])} className="btn btn-tertiary btn-sm mt-2"><Plus size={16} /> Add variant</button>
          <p className="mt-1 text-[12px] text-maxcontrast">Leave SKU empty and we&apos;ll fill one in. &ldquo;Was&rdquo; shows a struck-through price and only counts if it&apos;s higher. &ldquo;Min&rdquo; is the smallest quantity a buyer can order.</p>
        </fieldset>

        <fieldset>
          <legend className="label mb-2">Bulk pricing (optional, applies to every variant)</legend>
          {tiers.map((t, i) => (
            <div key={i} className="mb-2 flex items-center gap-2 text-[14px]">
              <input className="field w-24 tabular-nums" placeholder="Qty" inputMode="numeric" value={t.min_qty} onChange={(e) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, min_qty: e.target.value.replace(/\D/g, "").slice(0, 3) } : x)))} aria-label="Minimum quantity" />
              <span>+ units at</span>
              <input className="field w-28 tabular-nums" placeholder="Unit price" inputMode="decimal" value={t.price} onChange={(e) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, price: e.target.value.replace(/[^\d.]/g, "") } : x)))} aria-label="Unit price" />
              <button type="button" onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))} className="btn btn-tertiary btn-sm px-2" aria-label="Remove tier"><X size={16} /></button>
            </div>
          ))}
          {tiers.length < 10 && <button type="button" onClick={() => setTiers((ts) => [...ts, { min_qty: "", price: "" }])} className="btn btn-tertiary btn-sm"><Plus size={16} /> Add a quantity break</button>}
        </fieldset>

        <fieldset>
          <legend className="label mb-2">Specs (optional)</legend>
          {specs.map((s, i) => (
            <div key={i} className="mb-2 flex items-center gap-2">
              <input className="field w-44" placeholder="Material" maxLength={60} value={s.k} onChange={(e) => setSpecs((xs) => xs.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} aria-label="Spec name" />
              <input className="field flex-1" placeholder="100% linen" maxLength={120} value={s.v} onChange={(e) => setSpecs((xs) => xs.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} aria-label="Spec value" />
              <button type="button" onClick={() => setSpecs((xs) => xs.filter((_, j) => j !== i))} className="btn btn-tertiary btn-sm px-2" aria-label="Remove spec"><X size={16} /></button>
            </div>
          ))}
          {specs.length < 40 && <button type="button" onClick={() => setSpecs((xs) => [...xs, { k: "", v: "" }])} className="btn btn-tertiary btn-sm"><Plus size={16} /> Add a spec</button>}
        </fieldset>

        <label className="block max-w-xl"><span className="label">Search tags (comma separated)</span><input maxLength={600} className="field mt-1" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="linen, summer, wrap dress" /></label>

        <ErrorLine error={error} />
        <div className="flex flex-wrap gap-2 border-t border-border pt-5">
          <button disabled={!!busy} className="btn btn-primary">{busy === "active" ? "Saving…" : "Publish and add photos"}</button>
          <button type="button" disabled={!!busy} onClick={() => submit("draft")} className="btn btn-secondary">{busy === "draft" ? "Saving…" : "Save draft and add photos"}</button>
          <button type="button" onClick={() => router.back()} className="btn btn-tertiary">Cancel</button>
        </div>
      </div>
    </form>
  );
}
