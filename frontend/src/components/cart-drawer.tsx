"use client";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { money } from "@/lib/format";
import { cartSubtotal, useCart } from "@/store/cart";
import { Minus, Plus, X } from "./icons";
import { ProductImage } from "./product-image";
import { useSite } from "./site-context";

export function CartDrawer() {
  const freeOver = useSite().free_shipping_over_cents;
  const { lines, open, setOpen, setQty, remove } = useCart();
  const path = usePathname();
  // The bag lives in a shared store, so a page change closes it from here.
  useEffect(() => setOpen(false), [path, setOpen]);

  const subtotal = cartSubtotal(lines);
  const toFree = freeOver == null ? null : Math.max(0, freeOver - subtotal);

  return (
    // Base UI's dialog as a side sheet: focus stays in the bag, Escape and the backdrop close it.
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="modal-backdrop fixed inset-0 z-50 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-main-background text-main-text shadow-modal outline-none transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full motion-reduce:transition-none">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <Dialog.Title className="heading text-[20px]">Your bag</Dialog.Title>
            <Dialog.Close className="btn btn-tertiary btn-icon" aria-label="Close bag"><X /></Dialog.Close>
          </div>

          {lines.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <p className="text-maxcontrast">Nothing in here yet.</p>
              <Link href="/deals" className="btn btn-primary">Browse today&apos;s deals</Link>
            </div>
          ) : (
            <>
              {toFree !== null && freeOver ? (
              <div className="border-b border-border px-5 py-3 text-[13px]">
                {toFree > 0 ? (
                  <p>Add <span className="price">{money(toFree)}</span> more for free shipping.</p>
                ) : (
                  <p className="text-text-success">You&apos;ve unlocked free shipping.</p>
                )}
                <div className="rounded-pill mt-2 h-1.5 bg-background-hover">
                  <div className="rounded-pill h-full bg-success" style={{ width: `${Math.min(100, (subtotal / freeOver) * 100)}%` }} />
                </div>
              </div>
              ) : null}
              <ul className="flex-1 divide-y divide-border overflow-y-auto px-5">
                {lines.map((l) => (
                  <li key={l.id} className="flex gap-3 py-4">
                    <Link href={`/p/${l.slug}`} className="rounded-element h-24 w-20 shrink-0 overflow-hidden bg-background-hover">
                      <ProductImage src={l.image_url} art={l.art} alt={l.title} />
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="label truncate">{l.store_name}</p>
                      <Link href={`/p/${l.slug}`} className="line-clamp-2 text-[14px] hover:underline">{l.title}</Link>
                      <p className="text-[12px] text-maxcontrast">{l.variant_label}</p>
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <div className="rounded-element flex items-center border border-border">
                          <button className="rounded-full flex h-7 w-7 items-center justify-center hover:bg-background-hover" onClick={() => setQty(l.id, l.quantity - 1)} aria-label="Decrease quantity" disabled={l.quantity <= 1}><Minus size={14} /></button>
                          <span className="price w-8 text-center text-[13px]">{l.quantity}</span>
                          <button className="rounded-full flex h-7 w-7 items-center justify-center hover:bg-background-hover" onClick={() => setQty(l.id, l.quantity + 1)} aria-label="Increase quantity"><Plus size={14} /></button>
                        </div>
                        <span className="price text-[14px]">{money(l.unit_price_cents * l.quantity)}</span>
                      </div>
                      <button className="mt-1 w-fit text-[12px] text-maxcontrast underline hover:text-text-error" onClick={() => remove(l.id)}>Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border bg-main-background px-5 py-4">
                <div className="mb-1 flex justify-between text-[14px]">
                  <span>Subtotal</span>
                  <span className="price">{money(subtotal)}</span>
                </div>
                <p className="mb-4 text-[12px] text-maxcontrast">Final prices, shipping and tax are confirmed at checkout.</p>
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/cart" className="btn btn-secondary">View bag</Link>
                  <Link href="/checkout" className="btn btn-primary">Checkout</Link>
                </div>
              </div>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
