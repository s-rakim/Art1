import type { Metadata } from "next";
import Link from "next/link";
import { SignOut } from "@/components/sign-out";
import { DemoNotice } from "@/components/ui";
import { requireUser } from "@/lib/guard";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

export default async function AccountPage() {
  const user = await requireUser("/account");
  const cards: Array<[string, string, string]> = [
    ["Orders", "/orders", "Track deliveries, return items, see receipts."],
    ["Wishlist", "/wishlist", "Everything you've saved for later."],
    ["Bag", "/cart", "Pick up where you left off."],
  ];
  if (user.roles.includes("vendor") || user.demo) cards.push(["Vendor dashboard", "/seller", "Sales, stock, payments and dispatch."]);
  else cards.push(["Rent a stall", "/sell", "Open your own shop in the market."]);
  if (user.roles.includes("rider") || user.demo) cards.push(["Rider app", "/rider", "Your deliveries and shift."]);
  if (user.roles.includes("admin") || user.demo) cards.push(["Admin", "/admin", "Market operations."]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {user.demo && <DemoNotice what="the account area in demo mode" />}
      <p className="label mb-1">Signed in{user.email ? ` as ${user.email}` : ""}</p>
      <h1 className="display mb-8 text-[56px] md:text-[72px]">Your account</h1>
      <ul className="grid gap-px border border-ink bg-ink sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([title, href, body]) => (
          <li key={href} className="bg-paper">
            <Link href={href} className="block h-full p-6 hover:bg-card">
              <p className="display text-[28px]">{title}</p>
              <p className="mt-1 text-[14px] text-ink-2">{body}</p>
            </Link>
          </li>
        ))}
      </ul>
      {!user.demo && <div className="mt-8"><SignOut /></div>}
    </div>
  );
}
