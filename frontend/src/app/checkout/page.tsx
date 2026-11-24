"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProductImage } from "@/components/product-art";
import { DemoNotice, Empty } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AUTH_ENABLED, FREE_SHIPPING_CENTS } from "@/lib/config";
import { COUNTRIES } from "@/lib/countries";
import { money } from "@/lib/format";
import { cartSubtotal, useCart } from "@/store/cart";
import type { Address } from "@/lib/types";

const methods = [
  { id: "standard", label: "Standard", note: "Each store ships separately, 3 to 12 days", cents: 499 },
  { id: "express", label: "Express", note: "Tracked, 2 to 4 days where the store offers it", cents: 1299 },
] as const;

const payments = [
  { id: "cod", label: "Cash on delivery", note: "Pay the rider when your parcel arrives. Have the exact amount ready if you can." },
  { id: "bank_transfer", label: "Bank transfer", note: "Each store sends its account details. Your order ships once the store confirms the money arrived." },
] as const;

const empty: Address = { full_name: "", line1: "", line2: "", city: "", region: "", postal_code: "", country: "US", phone: "", lat: null, lng: null };

export default function CheckoutPage() {
  const router = useRouter();
  const { token, email, ready } = useAuth();
  const [h, setH] = useState(false);
  useEffect(() => setH(true), []);
  const { lines, clear } = useCart();
  const [addr, setAddr] = useState<Address>(empty);
  const [method, setMethod] = useState<(typeof methods)[number]["id"]>("standard");
  const [payment, setPayment] = useState<(typeof payments)[number]["id"]>("cod");
  const [coupon, setCoupon] = useState("");
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!h || !ready) return <div className="mx-auto min-h-[50vh] max-w-[1400px] px-4 py-10" />;
  if (lines.length === 0)
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-10">
        <Empty title="Nothing to check out" action={<Link href="/" className="btn btn-ink">Keep shopping</Link>} />
      </div>
    );

  // Estimates only. The API recalculates every price, tier and shipping cost from the ids we send.
  const stores = new Set(lines.map((l) => l.store_slug));
  const subtotal = cartSubtotal(lines);
  const perStore = [...stores].map((s) => cartSubtotal(lines.filter((l) => l.store_slug === s)));
  const m = methods.find((x) => x.id === method)!;
  const shipping = perStore.reduce((a, st) => a + (method === "standard" && st >= FREE_SHIPPING_CENTS ? 0 : m.cents), 0);

  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setAddr({ ...addr, [k]: e.target.value });

  // Optional: a pin helps the rider find the door. Only sent with this order, never stored on the device.
  function pin() {
    if (!("geolocation" in navigator)) return setError("This browser can't share a location. The address is enough.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setAddr((a) => ({ ...a, lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 }));
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError("We couldn't get your location. The address is enough on its own.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function place(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const opt = (v?: string | null) => (v && v.trim() ? v.trim() : null);
      const res = await api.checkout(token, {
        items: lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, quantity: l.quantity })),
        shipping_address: {
          full_name: addr.full_name.trim(),
          line1: addr.line1.trim(),
          line2: opt(addr.line2),
          city: addr.city.trim(),
          region: opt(addr.region),
          postal_code: opt(addr.postal_code),
          country: addr.country,
          phone: opt(addr.phone),
          lat: addr.lat ?? null,
          lng: addr.lng ?? null,
          is_default: false,
        },
        shipping_method: method,
        payment_method: payment,
        coupon_code: opt(coupon),
      });
      if (res.payment_url) {
        const u = new URL(res.payment_url);
        if (u.protocol !== "https:") throw new Error("Payment link was not secure, so we stopped.");
        window.location.assign(u.toString());
        return;
      }
      clear();
      router.push(`/orders/${encodeURIComponent(res.order_id)}?placed=1`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error && err.message.includes("secure") ? err.message : "We couldn't reach the store just now. Nothing was charged. Try again in a minute.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10">
      {!AUTH_ENABLED && <DemoNotice what="a demo checkout" />}
      <h1 className="display mb-8 text-[56px] md:text-[72px]">Checkout</h1>
      <form onSubmit={place} className="grid gap-10 lg:grid-cols-[1fr_400px]">
        <div className="space-y-10">
          <fieldset>
            <legend className="display mb-1 text-[26px]"><span className="font-mono text-[14px] text-signal">01 </span>Delivery address</legend>
            {email && <p className="mb-4 text-[13px] text-ink-3">Receipts go to {email}</p>}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="label">Full name</span><input required maxLength={120} autoComplete="name" className="field mt-1" value={addr.full_name} onChange={set("full_name")} /></label>
              <label className="sm:col-span-2"><span className="label">Address</span><input required maxLength={200} autoComplete="address-line1" className="field mt-1" value={addr.line1} onChange={set("line1")} /></label>
              <label className="sm:col-span-2"><span className="label">Apartment, suite (optional)</span><input maxLength={200} autoComplete="address-line2" className="field mt-1" value={addr.line2} onChange={set("line2")} /></label>
              <label><span className="label">City</span><input required maxLength={100} autoComplete="address-level2" className="field mt-1" value={addr.city} onChange={set("city")} /></label>
              <label><span className="label">State / region</span><input maxLength={100} autoComplete="address-level1" className="field mt-1" value={addr.region} onChange={set("region")} /></label>
              <label><span className="label">Postal code (if you have one)</span><input maxLength={16} pattern="[A-Za-z0-9 \-]{2,16}" autoComplete="postal-code" className="field mt-1" value={addr.postal_code} onChange={set("postal_code")} /></label>
              <label>
                <span className="label">Country</span>
                <select required className="field mt-1" value={addr.country} onChange={set("country")} autoComplete="country">
                  {COUNTRIES.map(([c, n]) => (
                    <option key={c} value={c}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2"><span className="label">Phone, for the rider</span><input required type="tel" maxLength={24} pattern="[0-9 +\(\)\-]{6,32}" autoComplete="tel" className="field mt-1" value={addr.phone ?? ""} onChange={set("phone")} /></label>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                {addr.lat != null && addr.lng != null ? (
                  <>
                    <span className="ticket ticket-market">PIN SET</span>
                    <span className="font-mono text-[12px]">{addr.lat.toFixed(5)}, {addr.lng.toFixed(5)}</span>
                    <button type="button" className="text-[13px] underline" onClick={() => setAddr({ ...addr, lat: null, lng: null })}>Remove pin</button>
                  </>
                ) : (
                  <button type="button" className="btn btn-line btn-sm" disabled={locating} onClick={pin}>{locating ? "Finding you…" : "Drop a pin at my location"}</button>
                )}
                <span className="text-[12px] text-ink-3">Optional. Helps the rider find the door.</span>
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend className="display mb-4 text-[26px]"><span className="font-mono text-[14px] text-signal">02 </span>Shipping</legend>
            <div className="grid gap-2">
              {methods.map((x) => (
                <label key={x.id} className={`flex cursor-pointer items-center gap-4 border p-4 ${method === x.id ? "border-ink bg-card" : "border-rule"}`}>
                  <input type="radio" name="method" checked={method === x.id} onChange={() => setMethod(x.id)} className="accent-ink" />
                  <span className="flex-1">
                    <span className="block font-semibold">{x.label}</span>
                    <span className="block text-[13px] text-ink-3">{x.note}</span>
                  </span>
                  <span className="price text-[14px]">{money(x.cents)} / store</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="display mb-4 text-[26px]"><span className="font-mono text-[14px] text-signal">03 </span>Payment</legend>
            <div className="grid gap-2">
              {payments.map((x) => (
                <label key={x.id} className={`flex cursor-pointer items-center gap-4 border p-4 ${payment === x.id ? "border-ink bg-card" : "border-rule"}`}>
                  <input type="radio" name="payment" checked={payment === x.id} onChange={() => setPayment(x.id)} className="accent-ink" />
                  <span className="flex-1">
                    <span className="block font-semibold">{x.label}</span>
                    <span className="block text-[13px] text-ink-3">{x.note}</span>
                  </span>
                </label>
              ))}
              <div className="flex items-center gap-4 border border-dashed border-rule p-4 text-ink-3" aria-disabled="true">
                <input type="radio" disabled className="accent-ink" aria-label="Card, not available yet" />
                <span className="flex-1">
                  <span className="block font-semibold">Card</span>
                  <span className="block text-[13px]">Coming soon.</span>
                </span>
              </div>
            </div>
            <label className="mt-6 block max-w-xs">
              <span className="label">Coupon code</span>
              <input maxLength={40} pattern="[A-Za-z0-9_\-]{2,40}" autoComplete="off" className="field mt-1 font-mono uppercase" value={coupon} onChange={(e) => setCoupon(e.target.value)} />
            </label>
          </fieldset>
        </div>

        <aside className="lg:sticky lg:top-40 lg:self-start">
          <div className="border-2 border-ink bg-card">
            <ul className="max-h-80 divide-y divide-rule overflow-y-auto">
              {lines.map((l) => (
                <li key={l.id} className="flex gap-3 p-3">
                  <div className="relative h-16 w-14 shrink-0 bg-paper-2">
                    <ProductImage src={l.image_url} art={l.art} alt={l.title} />
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center bg-ink px-1 font-mono text-[10px] text-paper">{l.quantity}</span>
                  </div>
                  <div className="min-w-0 flex-1 text-[13px]">
                    <p className="truncate">{l.title}</p>
                    <p className="text-ink-3">{l.store_name}</p>
                  </div>
                  <span className="price text-[13px]">{money(l.unit_price_cents * l.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-2 border-t border-ink p-5 text-[14px]">
              <div className="flex justify-between"><dt>Subtotal</dt><dd className="price">{money(subtotal)}</dd></div>
              <div className="flex justify-between"><dt>Shipping ({stores.size} {stores.size === 1 ? "store" : "stores"})</dt><dd className="price">{shipping ? money(shipping) : "Free"}</dd></div>
              <div className="flex justify-between text-ink-3"><dt>Tax{coupon.trim() ? " and coupon" : ""}</dt><dd>Worked out when you place it</dd></div>
              <div className="rule-dashed !my-4" />
              <div className="flex justify-between text-[17px] font-semibold"><dt>Estimated total</dt><dd className="price">{money(subtotal + shipping)}</dd></div>
            </dl>
            <div className="px-5 pb-5">
              {error && <p role="alert" className="mb-3 border-l-2 border-signal pl-3 text-[13px] text-signal">{error}</p>}
              <button disabled={busy} className="btn btn-signal h-12 w-full">{busy ? "Placing order…" : "Place order"}</button>
              <p className="mt-3 text-[11px] text-ink-3">By placing the order you agree to each store&apos;s returns policy and our buyer protection terms.</p>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
