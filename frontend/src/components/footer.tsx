import Link from "next/link";
import { STORE_NAME } from "@/lib/config";

const cols: Array<[string, Array<[string, string]>]> = [
  ["Shop", [["Today's deals", "/deals"], ["New in", "/search?sort=newest"], ["All stores", "/stores"], ["Wholesale", "/wholesale"]]],
  ["Work with us", [["Rent a stall", "/sell"], ["Plans and fees", "/sell#plans"], ["Vendor sign in", "/login?as=vendor"], ["Ride with us", "/signup?as=rider"], ["Rider sign in", "/login?as=rider"], ["Staff sign in", "/login?as=admin"]]],
  ["Help", [["Your orders", "/orders"], ["Returns", "/help/returns"], ["Shipping", "/help/shipping"], ["Buyer protection", "/help/protection"]]],
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border px-4 pt-8 pb-6 text-[14px] md:px-6">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <p className="font-semibold">{STORE_NAME}</p>
          <p className="mt-1 max-w-xs text-maxcontrast">
            A market of independent shops under one roof. Every store here rents its own stall, sets its own prices, and ships its own orders.
          </p>
        </div>
        {cols.map(([title, links]) => (
          <div key={title}>
            <p className="mb-1 font-semibold">{title}</p>
            <ul>
              {links.map(([label, href]) => (
                <li key={href}><Link href={href} className="text-maxcontrast hover:text-main-text hover:underline">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-8 text-[13px] text-maxcontrast">
        © {new Date().getFullYear()} {STORE_NAME}. Prices include the seller&apos;s fees; taxes are added at checkout.
      </p>
    </footer>
  );
}
