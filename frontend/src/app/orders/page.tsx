import type { Metadata } from "next";
import Link from "next/link";
import { ProductImage } from "@/components/product-art";
import { DemoNotice, Empty } from "@/components/ui";
import { api } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import { requireUser, serverToken } from "@/lib/guard";
import { StatusTag } from "@/components/status-tag";

export const metadata: Metadata = { title: "Your orders", robots: { index: false } };

export default async function OrdersPage() {
  const user = await requireUser("/orders");
  const orders = await api.orders(await serverToken());
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {user.demo && <DemoNotice what="sample orders" />}
      <h1 className="display mb-8 text-[56px] md:text-[72px]">Your orders</h1>
      {orders.items.length === 0 ? (
        <Empty title="No orders yet" action={<Link href="/" className="btn btn-ink">Start shopping</Link>} />
      ) : (
        <ul className="space-y-4">
          {orders.items.map((o) => (
            <li key={o.id} className="border border-ink">
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-ink bg-card px-4 py-3 text-[13px]">
                <div><p className="label">Placed</p><p>{shortDate(o.created_at)}</p></div>
                <div><p className="label">Total</p><p className="price">{money(o.total_cents, o.currency)}</p></div>
                <div><p className="label">Order</p><p className="font-mono">{o.number}</p></div>
                <div className="ml-auto"><StatusTag status={o.status} /></div>
              </div>
              <div className="flex flex-wrap items-center gap-4 p-4">
                {o.lines?.length ? (
                  <>
                    <div className="flex -space-x-3">
                      {o.lines.slice(0, 4).map((l) => (
                        <div key={l.id} className="h-16 w-14 overflow-hidden border-2 border-paper bg-paper-2">
                          <ProductImage src={l.image_url} art={l.art} alt={l.title} />
                        </div>
                      ))}
                    </div>
                    <p className="min-w-0 flex-1 truncate text-[14px]">{o.lines.map((l) => l.title).join(", ")}</p>
                  </>
                ) : (
                  <p className="min-w-0 flex-1 text-[14px]">{o.item_count} {o.item_count === 1 ? "item" : "items"}</p>
                )}
                <Link href={`/orders/${encodeURIComponent(o.id)}`} className="btn btn-line btn-sm">Track and manage</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
