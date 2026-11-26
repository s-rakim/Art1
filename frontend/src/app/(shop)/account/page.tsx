import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminIcon, Bag, Bike, Chevron, Heart, Receipt, Store } from "@/components/icons";
import { SignOut } from "@/components/sign-out";
import { DemoNotice } from "@/components/ui";
import { requireUser } from "@/lib/guard";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

export default async function AccountPage() {
  const user = await requireUser("/account");
  const cards: Array<[string, string, string, ReactNode]> = [
    ["Orders", "/orders", "Track deliveries, return items, see receipts.", <Receipt key="o" />],
    ["Wishlist", "/wishlist", "Everything you've saved for later.", <Heart key="w" />],
    ["Bag", "/cart", "Pick up where you left off.", <Bag key="b" />],
  ];
  if (user.roles.includes("vendor") || user.demo) cards.push(["Vendor dashboard", "/seller", "Sales, stock, payments and dispatch.", <Store key="v" />]);
  else cards.push(["Rent a stall", "/sell", "Open your own shop in the market.", <Store key="v" />]);
  if (user.roles.includes("rider") || user.demo) cards.push(["Rider app", "/rider", "Your deliveries and shift.", <Bike key="r" />]);
  if (user.roles.includes("admin") || user.demo) cards.push(["Admin", "/admin", "Market operations.", <AdminIcon key="a" />]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 md:px-6">
      {user.demo && <DemoNotice what="the account area in demo mode" />}
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full bg-primary-element text-[18px] font-semibold text-primary-element-text" aria-hidden>
          {(user.email ?? "Y").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="heading text-[22px]">Your account</h1>
          <p className="truncate text-[14px] text-maxcontrast">Signed in{user.email ? ` as ${user.email}` : ""}</p>
        </div>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([title, href, body, icon]) => (
          <li key={href}>
            <Link href={href} className="card flex h-full items-center gap-3 p-4 hover:bg-background-hover">
              <span className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full bg-primary-element-light text-primary-element-light-text">{icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{title}</span>
                <span className="block text-[14px] text-maxcontrast">{body}</span>
              </span>
              <Chevron size={20} className="shrink-0 text-maxcontrast" />
            </Link>
          </li>
        ))}
      </ul>
      {!user.demo && <div className="mt-6"><SignOut /></div>}
    </div>
  );
}
