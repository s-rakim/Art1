"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { FREE_SHIPPING_CENTS } from "@/lib/config";
import { money } from "@/lib/format";
import { cartSubtotal, useCart } from "@/store/cart";
import { Minus, Plus, X } from "./icons";
import { ProductImage } from "./product-art";

export function CartDrawer() {
  const { lines, open, setOpen, setQty, remove } = useCart();
  const path = usePathname();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [path, setOpen]);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  if (!open) return null;
  const subtotal = cartSubtotal(lines);
  const toFree = Math.max(0, FREE_SHIPPING_CENTS - subtotal);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Your bag">
      <div className="absolute inset-0 animate-fade bg-ink/40" onClick={() => setOpen(false)} />
      <div ref={panel} tabIndex={-1} className="absolute inset-y-0 right-0 flex w-full max-w-md animate-slide-in flex-col bg-paper outline-none">
        <div className="flex items-center justify-between border-b border-ink px-5 py-4">
          <h2 className="display text-[28px]">Your bag</h2>
          <button className="btn btn-ghost btn-sm px-2" onClick={() => setOpen(false)} aria-label="Close bag"><X /></button>
        </div>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-ink-2">Nothing in here yet.</p>
            <Link href="/deals" className="btn btn-ink">Browse today&apos;s deals</Link>
          </div>
        ) : (
          <>
            <div className="border-b border-rule px-5 py-3 text-[13px]">
              {toFree > 0 ? (
                <p>Add <span className="price">{money(toFree)}</span> more for free shipping.</p>
              ) : (
                <p className="text-market">You&apos;ve unlocked free shipping.</p>
              )}
              <div className="mt-2 h-1.5 bg-paper-2">
                <div className="h-full bg-market" style={{ width: `${Math.min(100, (subtotal / FREE_SHIPPING_CENTS) * 100)}%` }} />
              </div>
            </div>
            <ul className="flex-1 divide-y divide-rule overflow-y-auto px-5">
              {lines.map((l) => (
                <li key={l.id} className="flex gap-3 py-4">
                  <Link href={`/p/${l.slug}`} className="h-24 w-20 shrink-0 overflow-hidden bg-paper-2">
                    <ProductImage src={l.image_url} art={l.art} alt={l.title} />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="label truncate">{l.store_name}</p>
                    <Link href={`/p/${l.slug}`} className="line-clamp-2 text-[14px] hover:underline">{l.title}</Link>
                    <p className="text-[12px] text-ink-3">{l.variant_label}</p>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <div className="flex items-center border border-rule">
                        <button className="flex h-7 w-7 items-center justify-center hover:bg-paper-2" onClick={() => setQty(l.id, l.quantity - 1)} aria-label="Decrease quantity" disabled={l.quantity <= 1}><Minus size={14} /></button>
                        <span className="price w-8 text-center text-[13px]">{l.quantity}</span>
                        <button className="flex h-7 w-7 items-center justify-center hover:bg-paper-2" onClick={() => setQty(l.id, l.quantity + 1)} aria-label="Increase quantity"><Plus size={14} /></button>
                      </div>
                      <span className="price text-[14px]">{money(l.unit_price_cents * l.quantity)}</span>
                    </div>
                    <button className="mt-1 w-fit text-[12px] text-ink-3 underline hover:text-signal" onClick={() => remove(l.id)}>Remove</button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-ink bg-card px-5 py-4">
              <div className="mb-1 flex justify-between text-[14px]">
                <span>Subtotal</span>
                <span className="price">{money(subtotal)}</span>
              </div>
              <p className="mb-4 text-[12px] text-ink-3">Final prices, shipping and tax are confirmed at checkout.</p>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/cart" className="btn btn-line">View bag</Link>
                <Link href="/checkout" className="btn btn-signal">Checkout</Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
