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
          <span className={`price text-[34px] ${off ? "text-signal" : ""}`}>{money(unit, product.currency)}</span>
          {off > 0 && (
            <>
              <s className="font-mono text-[15px] text-ink-3">{money(compare!, product.currency)}</s>
              <span className="ticket">−{off}%</span>
            </>
          )}
        </div>
        {tier && tier.min_qty > 1 && <p className="mt-1 text-[13px] text-market">Bulk price applied for {tier.min_qty}+ units.</p>}
      </div>

      {tiers.length > 1 && (
        <div>
          <p className="label mb-2">Bulk pricing</p>
          <div className="grid grid-cols-4 border border-ink">
            {tiers.map((t, i) => {
              const on = tier?.min_qty === t.min_qty;
              return (
                <button
                  key={t.min_qty}
                  type="button"
                  onClick={() => setQty(t.min_qty)}
                  className={`border-ink p-2 text-left ${i ? "border-l" : ""} ${on ? "bg-market text-paper" : "hover:bg-paper-2"}`}
                >
                  <span className="block font-mono text-[11px] opacity-70">{t.min_qty}+ pcs</span>
                  <span className="price block text-[14px]">{money(t.price_cents, product.currency)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {colors.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-[13px]"><span className="label">Colour</span> <span className="ml-1 font-semibold">{color}</span></legend>
          <div className="flex flex-wrap gap-2">
            {colors.map(([name, hex]) => (
              <button
                key={name}
                type="button"
                onClick={() => setColor(name)}
                aria-pressed={color === name}
                aria-label={name}
                title={name}
                className={`h-10 w-10 border-2 p-0.5 ${color === name ? "border-ink" : "border-transparent hover:border-rule"}`}
              >
                <span className="block h-full w-full border border-ink/15" style={{ background: safeColor(hex) }} />
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {sizes.length > 1 && (
        <fieldset>
          <legend className="label mb-2">Size</legend>
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
                  className={`relative h-10 min-w-12 border px-3 font-mono text-[13px] ${size === s ? "border-ink bg-ink text-paper" : "border-rule bg-card hover:border-ink"} disabled:text-ink-3 disabled:line-through`}
                >
                  {s}
                  {stock > 0 && stock < 4 && <span className="absolute -top-2 -right-2 bg-tag px-1 font-mono text-[9px] text-ink">{stock} left</span>}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="flex items-center gap-3">
        <div className="flex h-11 items-center border border-ink">
          <button type="button" className="flex h-full w-10 items-center justify-center hover:bg-paper-2" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Fewer"><Minus size={16} /></button>
          <input
            className="price h-full w-14 border-x border-ink bg-card text-center text-[14px] outline-none"
            value={qty}
            inputMode="numeric"
            aria-label="Quantity"
            onChange={(e) => setQty(Math.max(1, Math.min(999, parseInt(e.target.value.replace(/\D/g, "") || "1", 10))))}
          />
          <button type="button" className="flex h-full w-10 items-center justify-center hover:bg-paper-2" onClick={() => setQty((q) => Math.min(999, q + 1))} aria-label="More"><Plus size={16} /></button>
        </div>
        {variant && <p className="text-[13px] text-ink-2">{variant.stock > 0 ? `${variant.stock} in stock` : "Sold out"}</p>}
      </div>

      {error && <p role="alert" className="border-l-2 border-signal pl-3 text-[13px] text-signal">{error}</p>}

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <button type="button" onClick={() => commit(false)} className="btn btn-ink h-12">
          {added ? <><Check size={18} /> Added</> : "Add to bag"}
        </button>
        <button type="button" onClick={() => commit(true)} className="btn btn-signal h-12">Buy now</button>
        <WishButton id={product.id} large />
      </div>

      {/* Mobile sticky bar, Shein-style */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-ink bg-paper p-3 md:hidden">
        <span className="price text-[18px]">{money(unit * qty, product.currency)}</span>
        <button type="button" onClick={() => commit(false)} className="btn btn-signal ml-auto flex-1">{added ? "Added" : "Add to bag"}</button>
      </div>
    </div>
  );
}
