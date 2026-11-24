import Link from "next/link";
import { STORE_NAME } from "@/lib/config";
import { Logo } from "./logo";

const cols: Array<[string, Array<[string, string]>]> = [
  ["Shop", [["Today's deals", "/deals"], ["New in", "/search?sort=newest"], ["All stores", "/stores"], ["Wholesale", "/wholesale"]]],
  ["Work with us", [["Rent a stall", "/sell"], ["Plans and fees", "/sell#plans"], ["Vendor sign in", "/login?as=vendor"], ["Ride with us", "/signup?as=rider"], ["Rider sign in", "/login?as=rider"], ["Staff sign in", "/login?as=admin"]]],
  ["Help", [["Your orders", "/orders"], ["Returns", "/help/returns"], ["Shipping", "/help/shipping"], ["Buyer protection", "/help/protection"]]],
];

export function Footer() {
  return (
    <footer className="mt-24 bg-ink text-paper">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo invert />
          <p className="mt-4 max-w-xs text-[14px] text-paper/70">
            A market of independent shops under one roof. Every store here rents its own stall, sets its own prices, and ships its own orders.
          </p>
        </div>
        {cols.map(([title, links]) => (
          <div key={title}>
            <p className="label mb-3 !text-paper/50">{title}</p>
            <ul className="space-y-2 text-[14px]">
              {links.map(([label, href]) => (
                <li key={href}><Link href={href} className="hover:text-tag">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-paper/15">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-[12px] text-paper/50">
          <p>© {new Date().getFullYear()} {STORE_NAME}. Prices include the seller&apos;s fees; taxes are added at checkout.</p>
          <p className="font-mono">Payments are processed securely. We never see your card number.</p>
        </div>
      </div>
    </footer>
  );
}
