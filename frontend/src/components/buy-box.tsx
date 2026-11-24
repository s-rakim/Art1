"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { money, discount } from "@/lib/format";
import { safeColor } from "@/lib/safe";
import type { Product } from "@/lib/types";
import { useCart } from "@/store/cart";
import { Check, Minus, Plus } from "./icons";
import { WishButton } from "./wish-button";

export function BuyBox({ product }: { product: Product }) {
  const router = useRouter();
  const add = useCart((s) => s.add);
  const colors = useMemo(() => [...new Map(product.variants.filter((v) => v.color).map((v) => [v.color!, v.color_hex])).entries()], [product]);
  const sizes = useMemo(() => [...new Set(product.variants.map((v) => v.size).filter(Boolean))] as string[], [product]);
  const [color, setColor] = useState(colors[0]?.[0]);
  const [size, setSize] = useState<string | undefined>(sizes.length === 1 ? sizes[0] : undefined);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState("");

  const variant = product.variants.find((v) => (!color || v.color === color) && (!sizes.length || v.size === size));
  const tiers = product.price_tiers ?? [];
  const tier = [...tiers].reverse().find((t) => qty >= t.min_qty);
  const unit = tier?.price_cents ?? variant?.price_cents ?? product.price_cents;
  const compare = variant?.compare_at_cents ?? product.compare_at_cents;
  const off = discount(unit, compare);
  const stockFor = (s: string) => product.variants.find((v) => v.color === color && v.size === s)?.stock ?? 0;

  function commit(goCheckout: boolean) {
    if (sizes.length > 1 && !size) {
      setError("Pick a size first.");
      return;
    }
    if (!variant || variant.stock < 1) {
      setError("That one's sold out. Try another option.");
      return;
    }
    setError("");
    add(
      {
        product_id: product.id,
        variant_id: variant.id,
        slug: product.slug,
        title: product.title,
        variant_label: [variant.color, variant.size !== "One size" ? variant.size : null].filter(Boolean).join(" / "),
        unit_price_cents: unit,
        store_slug: product.store.slug,
        store_name: product.store.name,
        image_url: product.image_url,
        art: product.art ? { ...product.art, fg: safeColor(variant.color_hex, product.art.fg) } : undefined,
      },
      Math.min(qty, variant.stock),
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
    if (goCheckout) router.push("/checkout");
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className={`price text-[30px] leading-tight ${off ? "text-text-error" : ""}`}>{money(unit, product.currency)}</span>
          {off > 0 && (
            <>
              <s className="text-[15px] text-maxcontrast">{money(compare!, product.currency)}</s>
              <span className="chip chip-error">−{off}%</span>
            </>
          )}
        </div>
        {tier && tier.min_qty > 1 && <p className="mt-1 text-[13px] text-text-success">Bulk price applied for {tier.min_qty}+ units.</p>}
      </div>

      {tiers.length > 1 && (
        <div>
          <p className="label mb-2">Bulk pricing</p>
          <div className="grid grid-cols-4 overflow-hidden rounded-element border border-border-maxcontrast">
            {tiers.map((t, i) => {
              const on = tier?.min_qty === t.min_qty;
              return (
                <button
                  key={t.min_qty}
                  type="button"
                  onClick={() => setQty(t.min_qty)}
                  className={`border-border-maxcontrast p-2 text-left ${i ? "border-l" : ""} ${on ? "bg-primary-element-light text-primary-element-light-text" : "hover:bg-background-hover"}`}
                >
                  <span className="block text-[13px] opacity-75">{t.min_qty}+ pcs</span>
                  <span className="price block text-[14px]">{money(t.price_cents, product.currency)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {colors.length > 0 && (
        <fieldset>
          <legend className="mb-1.5"><span className="label">Colour</span> <span className="ml-1 text-[14px] font-semibold">{color}</span></legend>
          <div className="flex flex-wrap gap-2">
            {colors.map(([name, hex]) => (
              <button
                key={name}
                type="button"
                onClick={() => setColor(name)}
                aria-pressed={color === name}
                aria-label={name}
                title={name}
                className={`h-[38px] w-[38px] rounded-full border-2 p-[3px] ${color === name ? "border-primary-element" : "border-transparent hover:border-border-dark"}`}
              >
                <span className="block h-full w-full rounded-full border border-border-dark" style={{ background: safeColor(hex) }} />
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {sizes.length > 1 && (
        <fieldset>
          <legend className="label mb-1.5">Size</legend>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => {
              const stock = stockFor(s);
              return (
                <button
                  key={s}
                  type="button"
                  disabled={stock < 1}
                  onClick={() => { setSize(s); setError(""); }}
                  aria-pressed={size === s}
                  className={`relative h-[34px] min-w-[46px] rounded-element border px-3 text-[14px] font-medium ${size === s ? "border-primary-element bg-primary-element-light text-primary-element-light-text" : "border-border-maxcontrast hover:bg-background-hover"} disabled:border-border disabled:text-maxcontrast disabled:line-through`}
                >
                  {s}
                  {stock > 0 && stock < 4 && <span className="absolute -top-2.5 -right-2 rounded-pill bg-warning px-1.5 text-[12px] leading-[18px] text-warning-text">{stock} left</span>}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="flex items-center gap-3">
        <div className="flex h-[34px] items-center overflow-hidden rounded-element border border-border-maxcontrast">
          <button type="button" className="flex h-full w-[34px] items-center justify-center hover:bg-background-hover" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Fewer"><Minus size={16} /></button>
          <input
            className="price h-full w-12 border-x border-border bg-main-background text-center text-[15px] outline-none"
            value={qty}
            inputMode="numeric"
            aria-label="Quantity"
            onChange={(e) => setQty(Math.max(1, Math.min(999, parseInt(e.target.value.replace(/\D/g, "") || "1", 10))))}
          />
          <button type="button" className="flex h-full w-[34px] items-center justify-center hover:bg-background-hover" onClick={() => setQty((q) => Math.min(999, q + 1))} aria-label="More"><Plus size={16} /></button>
        </div>
        {variant && <p className="text-[14px] text-maxcontrast">{variant.stock > 0 ? `${variant.stock} in stock` : "Sold out"}</p>}
      </div>

      {error && <p role="alert" className="note note-error text-[14px]"><span>{error}</span></p>}

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <button type="button" onClick={() => commit(false)} className="btn btn-primary btn-lg">
          {added ? <><Check size={18} /> Added</> : "Add to bag"}
        </button>
        <button type="button" onClick={() => commit(true)} className="btn btn-lg">Buy now</button>
        <WishButton id={product.id} large />
      </div>

      {/* Mobile sticky bar, Shein-style */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-border bg-main-background p-3 shadow-modal md:hidden">
        <span className="price text-[18px]">{money(unit * qty, product.currency)}</span>
        <button type="button" onClick={() => commit(false)} className="btn btn-primary ml-auto flex-1">{added ? "Added" : "Add to bag"}</button>
      </div>
    </div>
  );
}
