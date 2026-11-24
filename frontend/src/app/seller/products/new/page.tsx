"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ErrorLine, PageTitle } from "@/components/dash";
import { Plus, X } from "@/components/icons";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { safeImageUrl } from "@/lib/safe";
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

const blank: VariantDraft = { color: "", color_hex: "#16130f", size: "", sku: "", price: "", compare: "", stock: "", moq: "1" };

export default function NewProduct() {
  const router = useRouter();
  const { token } = useAuth();
  const cats = useApi(() => api.categories());
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [variants, setVariants] = useState<VariantDraft[]>([{ ...blank }]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [busy, setBusy] = useState<"draft" | "active" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const setV = (i: number, k: keyof VariantDraft, v: string) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const f of Array.from(files).slice(0, 12 - images.length)) {
        const url = await api.uploadImage(token, f);
        if (safeImageUrl(url)) setImages((xs) => [...xs, url]);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Photo uploads need the live backend. You can add photos later.");
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  }

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
      await api.createProduct(token, {
        title: title.trim(),
        description: description.trim(),
        brand: brand.trim() || null,
        category_id: category || null,
        status,
        attributes: Object.fromEntries(specs.filter((s) => s.k.trim() && s.v.trim()).map((s) => [s.k.trim().slice(0, 120), s.v.trim().slice(0, 120)])),
        tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20).map((t) => t.slice(0, 40)),
        images: images.map((url) => ({ url, alt: title.trim().slice(0, 120) || null })),
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
      router.push("/seller/products");
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

        <fieldset>
          <legend className="label mb-2">Photos ({images.length}/12)</legend>
          <div className="flex flex-wrap gap-2">
            {images.map((src, i) => (
              <div key={src} className="relative h-28 w-24 overflow-hidden border border-rule bg-paper-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                {i === 0 && <span className="absolute bottom-0 left-0 bg-ink px-1 font-mono text-[10px] text-paper">COVER</span>}
                <button type="button" onClick={() => setImages((xs) => xs.filter((x) => x !== src))} className="absolute top-1 right-1 bg-paper p-0.5" aria-label="Remove photo"><X size={14} /></button>
              </div>
            ))}
            {images.length < 12 && (
              <label className={`flex h-28 w-24 cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-ink text-[12px] ${uploading ? "opacity-50" : ""}`}>
                <Plus size={18} />
                {uploading ? "Uploading…" : "Add photos"}
                <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="sr-only" disabled={uploading} onChange={(e) => addPhotos(e.target.files)} />
              </label>
            )}
          </div>
          <p className="mt-1 text-[12px] text-ink-3">JPEG, PNG, WebP or AVIF, up to 5 MB each. The first photo is the cover.</p>
        </fieldset>

        <fieldset>
          <legend className="label mb-2">Variants</legend>
          <div className="overflow-x-auto">
            <div className="min-w-[760px] space-y-2">
              <div className="grid grid-cols-[1fr_44px_80px_130px_90px_90px_70px_60px_36px] gap-2 font-mono text-[10px] uppercase text-ink-3">
                <span>Colour</span><span /><span>Size</span><span>SKU</span><span>Price</span><span>Was</span><span>Stock</span><span>Min</span><span />
              </div>
              {variants.map((v, i) => (
                <div key={i} className="grid grid-cols-[1fr_44px_80px_130px_90px_90px_70px_60px_36px] items-center gap-2">
                  <input className="field !h-9" placeholder="Colour" maxLength={40} value={v.color} onChange={(e) => setV(i, "color", e.target.value)} aria-label="Colour name" />
                  <input type="color" className="h-9 w-11 border border-rule bg-card" value={v.color_hex} onChange={(e) => setV(i, "color_hex", e.target.value)} aria-label="Colour swatch" />
                  <input className="field !h-9" placeholder="Size" maxLength={12} value={v.size} onChange={(e) => setV(i, "size", e.target.value)} aria-label="Size" />
                  <input className="field !h-9 font-mono text-[12px]" placeholder={autoSku(title, v, i)} maxLength={64} value={v.sku} onChange={(e) => setV(i, "sku", e.target.value.replace(/[^A-Za-z0-9._-]/g, ""))} aria-label="SKU" />
                  <input required className="field !h-9 font-mono" placeholder="0.00" inputMode="decimal" value={v.price} onChange={(e) => setV(i, "price", e.target.value.replace(/[^\d.]/g, ""))} aria-label="Price" />
                  <input className="field !h-9 font-mono" placeholder="optional" inputMode="decimal" value={v.compare} onChange={(e) => setV(i, "compare", e.target.value.replace(/[^\d.]/g, ""))} aria-label="Original price, shown struck through" />
                  <input required className="field !h-9 font-mono" placeholder="0" inputMode="numeric" value={v.stock} onChange={(e) => setV(i, "stock", e.target.value.replace(/\D/g, "").slice(0, 7))} aria-label="Stock" />
                  <input className="field !h-9 font-mono" inputMode="numeric" value={v.moq} onChange={(e) => setV(i, "moq", e.target.value.replace(/\D/g, "").slice(0, 3))} aria-label="Minimum order quantity" />
                  <button type="button" disabled={variants.length === 1} onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))} className="btn btn-ghost btn-sm px-2" aria-label="Remove variant"><X size={16} /></button>
                </div>
              ))}
            </div>
          </div>
          <button type="button" disabled={variants.length >= 100} onClick={() => setVariants((vs) => [...vs, { ...vs[vs.length - 1], sku: "", size: "" }])} className="btn btn-ghost btn-sm mt-2"><Plus size={16} /> Add variant</button>
          <p className="mt-1 text-[12px] text-ink-3">Leave SKU empty and we&apos;ll fill one in. &ldquo;Was&rdquo; shows a struck-through price and only counts if it&apos;s higher. &ldquo;Min&rdquo; is the smallest quantity a buyer can order.</p>
        </fieldset>

        <fieldset>
          <legend className="label mb-2">Bulk pricing (optional, applies to every variant)</legend>
          {tiers.map((t, i) => (
            <div key={i} className="mb-2 flex items-center gap-2 text-[14px]">
              <input className="field !h-9 w-24 font-mono" placeholder="Qty" inputMode="numeric" value={t.min_qty} onChange={(e) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, min_qty: e.target.value.replace(/\D/g, "").slice(0, 3) } : x)))} aria-label="Minimum quantity" />
              <span>+ units at</span>
              <input className="field !h-9 w-28 font-mono" placeholder="Unit price" inputMode="decimal" value={t.price} onChange={(e) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, price: e.target.value.replace(/[^\d.]/g, "") } : x)))} aria-label="Unit price" />
              <button type="button" onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))} className="btn btn-ghost btn-sm px-2" aria-label="Remove tier"><X size={16} /></button>
            </div>
          ))}
          {tiers.length < 10 && <button type="button" onClick={() => setTiers((ts) => [...ts, { min_qty: "", price: "" }])} className="btn btn-ghost btn-sm"><Plus size={16} /> Add a quantity break</button>}
        </fieldset>

        <fieldset>
          <legend className="label mb-2">Specs (optional)</legend>
          {specs.map((s, i) => (
            <div key={i} className="mb-2 flex items-center gap-2">
              <input className="field !h-9 w-44" placeholder="Material" maxLength={60} value={s.k} onChange={(e) => setSpecs((xs) => xs.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} aria-label="Spec name" />
              <input className="field !h-9 flex-1" placeholder="100% linen" maxLength={120} value={s.v} onChange={(e) => setSpecs((xs) => xs.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} aria-label="Spec value" />
              <button type="button" onClick={() => setSpecs((xs) => xs.filter((_, j) => j !== i))} className="btn btn-ghost btn-sm px-2" aria-label="Remove spec"><X size={16} /></button>
            </div>
          ))}
          {specs.length < 40 && <button type="button" onClick={() => setSpecs((xs) => [...xs, { k: "", v: "" }])} className="btn btn-ghost btn-sm"><Plus size={16} /> Add a spec</button>}
        </fieldset>

        <label className="block max-w-xl"><span className="label">Search tags (comma separated)</span><input maxLength={600} className="field mt-1" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="linen, summer, wrap dress" /></label>

        <ErrorLine error={error} />
        <div className="flex flex-wrap gap-2 border-t border-ink pt-5">
          <button disabled={!!busy || uploading} className="btn btn-signal">{busy === "active" ? "Publishing…" : "Publish"}</button>
          <button type="button" disabled={!!busy || uploading} onClick={() => submit("draft")} className="btn btn-line">{busy === "draft" ? "Saving…" : "Save as draft"}</button>
          <button type="button" onClick={() => router.back()} className="btn btn-ghost">Cancel</button>
        </div>
      </div>
    </form>
  );
}
