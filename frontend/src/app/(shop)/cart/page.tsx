"use client";
import Link from "next/link";
import { Heart, Minus, Plus } from "@/components/icons";
import { ProductImage } from "@/components/product-image";
import { Empty } from "@/components/ui";
import { useSite } from "@/components/site-context";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import { useHydrated } from "@/lib/hooks";
import { cartCount, cartSubtotal, ticked, useCart } from "@/store/cart";

export default function CartPage() {
  const h = useHydrated();
  const freeOver = useSite().free_shipping_over_cents;
  const { token } = useAuth();
  const { lines, unticked, setQty, remove, saveForLater, tick } = useCart();
  if (!h) return <div className="min-h-[50vh] px-4 py-5 md:px-6" />;

  const byStore = lines.reduce<Record<string, typeof lines>>((acc, l) => {
    (acc[l.store_name] ||= []).push(l);
    return acc;
  }, {});
  const buying = ticked(lines, unticked);
  const subtotal = cartSubtotal(buying);
  const shops = new Set(buying.map((l) => l.store_slug)).size;
  const all = buying.length === lines.length;

  function later(id: string, productId: string) {
    saveForLater(id);
    // Signed in: the heart goes to the account too, so it shows on every device.
    if (token) api.wishAdd(token, productId).catch(() => {});
  }

  return (
    <div className="px-4 py-5 md:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="heading text-[22px]">Your bag</h1>
        <Link href="/wishlist" className="btn btn-tertiary btn-sm"><Heart size={16} />Wishlist</Link>
      </div>
      {lines.length === 0 ? (
        <Empty title="Your bag is empty" body="Things you add will wait here until you're ready. Anything you saved for later is in your wishlist." action={<Link href="/deals" className="btn btn-primary">See today&apos;s deals</Link>} />
      ) : (
        <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <label className="flex items-center gap-3 text-[14px]">
              <input type="checkbox" className="h-5 w-5 accent-primary-element" checked={all} ref={(el) => { if (el) el.indeterminate = !all && buying.length > 0; }} onChange={(e) => tick(lines.map((l) => l.id), e.target.checked)} />
              <span><b>{all ? "Buying everything" : `Buying ${buying.length} of ${lines.length}`}</b><span className="text-maxcontrast">. Untick what you want to leave in the bag for now.</span></span>
            </label>
            {Object.entries(byStore).map(([store, items]) => {
              const picked = ticked(items, unticked);
              const storeTotal = cartSubtotal(picked);
              const allHere = picked.length === items.length;
              return (
                <section key={store} className="card">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-main-background px-4 py-3">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-primary-element"
                        checked={allHere}
                        ref={(el) => { if (el) el.indeterminate = !allHere && picked.length > 0; }}
                        onChange={(e) => tick(items.map((l) => l.id), e.target.checked)}
                        aria-label={`Buy everything from ${store}`}
                      />
                      <Link href={`/s/${items[0].store_slug}`} className="font-semibold hover:underline">From {store}</Link>
                    </label>
                    {freeOver != null && picked.length > 0 && (
                      <span className="text-[12px] text-maxcontrast">
                        {storeTotal >= freeOver ? "Free delivery from this shop" : `${money(freeOver - storeTotal)} more from this shop for free delivery`}
                      </span>
                    )}
                  </header>
                  <ul className="divide-y divide-border">
                    {items.map((l) => {
                      const on = !unticked.includes(l.id);
                      return (
                        <li key={l.id} className={`flex gap-4 p-4 ${on ? "" : "opacity-60"}`}>
                          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-primary-element" checked={on} onChange={(e) => tick([l.id], e.target.checked)} aria-label={`Buy ${l.title}, ${l.variant_label}`} />
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
                              <button className="btn btn-tertiary btn-sm" onClick={() => later(l.id, l.product_id)}><Heart size={14} />Save for later</button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
          <aside className="lg:sticky lg:top-[60px] lg:self-start">
            <div className="card p-5">
              <h2 className="heading text-[20px]">Summary</h2>
              <dl className="mt-4 space-y-2 text-[14px]">
                <div className="flex justify-between"><dt>Items you&apos;re buying ({cartCount(buying)})</dt><dd className="price">{money(subtotal)}</dd></div>
                <div className="flex justify-between text-maxcontrast"><dt>Delivery</dt><dd>At checkout</dd></div>
                <div className="flex justify-between text-maxcontrast"><dt>Tax</dt><dd>At checkout</dd></div>
              </dl>
              <div className="my-4 h-px bg-border" />
              <div className="flex justify-between text-[16px] font-semibold"><span>Estimated total</span><span className="price">{money(subtotal)}</span></div>
              {buying.length > 0 ? (
                <Link href="/checkout" className="btn btn-primary btn-lg mt-5 w-full">{all ? "Go to checkout" : `Check out ${cartCount(buying)} item${cartCount(buying) === 1 ? "" : "s"}`}</Link>
              ) : (
                <button disabled className="btn btn-primary btn-lg mt-5 w-full">Tick something to buy</button>
              )}
              <p className="mt-3 text-[12px] text-maxcontrast">
                {shops > 1 ? `From ${shops} shops, so it comes in ${shops} parcels. Pay for each as it arrives, or all at once, into the market's own till.` : "You pay when it arrives, by M-Pesa or bank, into the market's own till."}
                {!all && " Unticked items stay in your bag."}
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
