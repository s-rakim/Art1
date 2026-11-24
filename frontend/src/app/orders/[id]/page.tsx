import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "@/components/icons";
import { ProductImage } from "@/components/product-art";
import { StatusTag } from "@/components/status-tag";
import { OrderTracking } from "@/components/order-tracking";
import { Breadcrumbs, DemoNotice } from "@/components/ui";
import { api } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import { requireUser, serverToken } from "@/lib/guard";
import { CancelOrder } from "@/components/cancel-order";

export const metadata: Metadata = { title: "Order details", robots: { index: false } };

const flow = ["pending_payment", "paid", "shipped", "fulfilled"];
const words: Record<string, string> = {
  pending_payment: "Order placed", paid: "Payment confirmed", shipped: "On its way",
  fulfilled: "Delivered", canceled: "Cancelled", refunded: "Refunded",
};
const pay: Record<string, string> = { cod: "Cash on delivery", bank_transfer: "Bank transfer", manual: "Cash or bank transfer, paid to the store", stripe: "Card", test: "Card (test)" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const user = await requireUser(`/orders/${id}`);
  // The API only returns orders that belong to the signed-in user.
  const order = await api.order(await serverToken(), id).catch(() => null);
  if (!order) notFound();
  const placed = (await searchParams).placed === "1";
  const reached = new Map(order.events.map((e) => [e.status, e.at]));
  const ended = order.status === "canceled" || order.status === "refunded";
  const steps = ended ? [...flow.slice(0, reached.has("paid") ? 2 : 1), order.status] : flow;
  const live = ["paid", "partially_fulfilled"].includes(order.status);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {user.demo && <DemoNotice what="a sample order" />}
      {placed && (
        <div role="status" className="mb-8 flex items-center gap-3 border-2 border-market bg-market-2 p-4">
          <Check className="text-market" />
          <p><b>Order placed.</b> Each store will email you when your items ship.</p>
        </div>
      )}
      <Breadcrumbs items={[["Orders", "/orders"], [order.number]]} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-[48px] md:text-[64px]">Order {order.number}</h1>
        <StatusTag status={order.status} />
      </div>
      <p className="mt-1 text-ink-3">Placed {shortDate(order.created_at)}</p>

      <ol className={`mt-10 grid gap-0 border border-ink ${steps.length === 4 ? "sm:grid-cols-4" : steps.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`} aria-label="Order progress">
        {steps.map((s, i) => {
          const done = reached.has(s) || (s === "shipped" && order.status === "partially_fulfilled");
          const at = reached.get(s);
          return (
            <li key={s} className={`border-ink p-4 ${i ? "border-t sm:border-t-0 sm:border-l" : ""} ${done ? "bg-card" : "text-ink-3"}`}>
              <span className={`flex h-6 w-6 items-center justify-center font-mono text-[11px] ${done ? (s === "canceled" || s === "refunded" ? "bg-signal text-white" : "bg-market text-paper") : "border border-rule"}`}>
                {done ? <Check size={14} /> : i + 1}
              </span>
              <p className="mt-2 text-[14px] font-semibold">{words[s] ?? s}</p>
              <p className="font-mono text-[11px]">{at ? shortDate(at) : done ? "Done" : "Waiting"}</p>
            </li>
          );
        })}
      </ol>

      {order.status === "partially_fulfilled" && (
        <p className="mt-4 text-[14px] text-ink-3">Part of this order has arrived. The rest is still with its store or on the road.</p>
      )}
      {live && <OrderTracking orderId={order.id} />}

      <div className="mt-10 grid gap-10 md:grid-cols-[1fr_300px]">
        <ul className="divide-y divide-rule border-y border-ink">
          {order.lines.map((l) => (
            <li key={l.id} className="flex gap-4 py-4">
              <div className="h-24 w-20 shrink-0 overflow-hidden bg-paper-2"><ProductImage src={l.image_url} art={l.art} alt={l.title} /></div>
              <div className="flex-1 text-[14px]">
                {l.slug ? <Link href={`/p/${l.slug}`} className="font-medium hover:underline">{l.title}</Link> : <span className="font-medium">{l.title}</span>}
                <p className="text-ink-3">{l.variant_label} · Qty {l.quantity}</p>
                <p className="text-ink-3">Sold by <Link className="underline" href={`/s/${l.store_slug}`}>{l.store_name}</Link></p>
              </div>
              <span className="price text-[14px]">{money(l.unit_price_cents * l.quantity, order.currency)}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-6 text-[14px]">
          <div>
            <p className="label mb-1">Ship to</p>
            <address className="not-italic">
              {order.shipping_address.full_name}<br />{order.shipping_address.line1}<br />
              {order.shipping_address.line2 && <>{order.shipping_address.line2}<br /></>}
              {[order.shipping_address.city, order.shipping_address.region, order.shipping_address.postal_code].filter(Boolean).join(" ")}<br />{order.shipping_address.country}
            </address>
          </div>
          {order.payment_provider && (
            <div>
              <p className="label mb-1">Payment</p>
              <p>{pay[order.payment_provider] ?? order.payment_provider}{order.status === "pending_payment" ? ", not yet received" : ""}</p>
            </div>
          )}
          <dl className="space-y-1.5 border-t border-ink pt-4">
            <div className="flex justify-between"><dt>Subtotal</dt><dd className="price">{money(order.subtotal_cents, order.currency)}</dd></div>
            {!!order.discount_cents && <div className="flex justify-between"><dt>Discount</dt><dd className="price">−{money(order.discount_cents, order.currency)}</dd></div>}
            <div className="flex justify-between"><dt>Shipping</dt><dd className="price">{money(order.shipping_cents, order.currency)}</dd></div>
            <div className="flex justify-between"><dt>Tax</dt><dd className="price">{money(order.tax_cents, order.currency)}</dd></div>
            <div className="flex justify-between border-t border-rule pt-2 font-semibold"><dt>Total</dt><dd className="price">{money(order.total_cents, order.currency)}</dd></div>
          </dl>
          {["pending_payment", "paid"].includes(order.status) && <CancelOrder orderId={order.id} />}
          <Link href="/help/returns" className="btn btn-line w-full">Return or report a problem</Link>
        </div>
      </div>
    </div>
  );
}
