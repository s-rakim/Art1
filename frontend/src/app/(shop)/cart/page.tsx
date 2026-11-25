"use client";
import Link from "next/link";
import { Minus, Plus } from "@/components/icons";
import { ProductImage } from "@/components/product-image";
import { Empty } from "@/components/ui";
import { useSite } from "@/components/site-context";
import { money } from "@/lib/format";
import { cartSubtotal, useCart } from "@/store/cart";
import { useHydrated } from "@/lib/hooks";

export default function CartPage() {
  const h = useHydrated();
  const freeOver = useSite().free_shipping_over_cents;
  const { lines, saved, setQty, remove, saveForLater, moveToCart } = useCart();
  if (!h) return <div className="min-h-[50vh] px-4 py-5 md:px-6" />;

  const byStore = lines.reduce<Record<string, typeof lines>>((acc, l) => {
    (acc[l.store_name] ||= []).push(l);
    return acc;
  }, {});
  const subtotal = cartSubtotal(lines);

  return (
    <div className="px-4 py-5 md:px-6">
      <h1 className="heading mb-5 text-[22px]">Your bag</h1>
      {lines.length === 0 ? (
        <Empty title="Your bag is empty" body="Things you add will wait here until you're ready." action={<Link href="/deals" className="btn btn-primary">See today&apos;s deals</Link>} />
      ) : (
        <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
          <div className="space-y-8">
            {Object.entries(byStore).map(([store, items]) => {
              const storeTotal = cartSubtotal(items);
              return (
                <section key={store} className="card">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-main-background px-4 py-3">
                    <Link href={`/s/${items[0].store_slug}`} className="font-semibold hover:underline">Shipped by {store}</Link>
                    {freeOver != null && (
                      <span className="text-[12px] text-maxcontrast">
                        {storeTotal >= freeOver ? "Free shipping from this store" : `${money(freeOver - storeTotal)} more from this store for free shipping`}
                      </span>
                    )}
                  </header>
                  <ul className="divide-y divide-border">
                    {items.map((l) => (
                      <li key={l.id} className="flex gap-4 p-4">
                        <Link href={`/p/${l.slug}`} className="rounded-element h-32 w-24 shrink-0 overflow-hidden bg-background-hover">
                          <ProductImage src={l.image_url} art={l.art} alt={l.title} />
                        </Link>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex justify-between gap-4">
                            <Link href={`/p/${l.slug}`} className="font-medium hover:underline">{l.title}</Link>
                            <span className="price shrink-0">{money(l.unit_price_cents * l.quantity)}</span>
                          </div>
                          <p className="text-[13px] text-maxcontrast">{l.variant_label} · {money(l.unit_price_cents)} each</p>
                          <div className="mt-auto flex flex-wrap items-center gap-4 pt-3 text-[13px]">
                            <div className="rounded-element flex items-center border border-border">
                              <button className="rounded-full flex h-8 w-8 items-center justify-center hover:bg-background-hover" onClick={() => setQty(l.id, l.quantity - 1)} disabled={l.quantity <= 1} aria-label="Decrease quantity"><Minus size={14} /></button>
                              <span className="price w-10 text-center">{l.quantity}</span>
                              <button className="rounded-full flex h-8 w-8 items-center justify-center hover:bg-background-hover" onClick={() => setQty(l.id, l.quantity + 1)} aria-label="Increase quantity"><Plus size={14} /></button>
                            </div>
                            <button className="btn btn-tertiary btn-sm" onClick={() => remove(l.id)}>Remove</button>
                            <button className="btn btn-tertiary btn-sm" onClick={() => saveForLater(l.id)}>Save for later</button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          <aside className="lg:sticky lg:top-[60px] lg:self-start">
            <div className="card p-5">
              <h2 className="heading text-[20px]">Summary</h2>
              <dl className="mt-4 space-y-2 text-[14px]">
                <div className="flex justify-between"><dt>Items ({lines.reduce((a, l) => a + l.quantity, 0)})</dt><dd className="price">{money(subtotal)}</dd></div>
                <div className="flex justify-between text-maxcontrast"><dt>Shipping</dt><dd>At checkout</dd></div>
                <div className="flex justify-between text-maxcontrast"><dt>Tax</dt><dd>At checkout</dd></div>
              </dl>
              <div className="h-px bg-border my-4" />
              <div className="flex justify-between text-[16px] font-semibold"><span>Estimated total</span><span className="price">{money(subtotal)}</span></div>
              <Link href="/checkout" className="btn btn-primary mt-5 btn-lg w-full">Go to checkout</Link>
              <p className="mt-3 text-[12px] text-maxcontrast">Prices are checked again by each store when you place the order.</p>
            </div>
          </aside>
        </div>
      )}

      {saved.length > 0 && (
        <section className="mt-14">
          <h2 className="heading mb-4 text-[22px]">Saved for later</h2>
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
            {saved.map((l) => (
              <li key={l.id} className="text-[13px]">
                <div className="rounded-element aspect-[4/5] overflow-hidden bg-background-hover"><ProductImage src={l.image_url} art={l.art} alt={l.title} /></div>
                <p className="mt-2 line-clamp-2">{l.title}</p>
                <p className="price">{money(l.unit_price_cents)}</p>
                <button className="btn btn-secondary btn-sm mt-2 w-full" onClick={() => moveToCart(l.id)}>Move to bag</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
