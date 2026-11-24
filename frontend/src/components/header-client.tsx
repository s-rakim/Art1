"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { Category } from "@/lib/types";
import { cartCount, useCart, useWishlist } from "@/store/cart";
import { Bag, Heart, Menu, Store, User, X } from "./icons";
import { Logo } from "./logo";

function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => setH(true), []);
  return h;
}

export function HeaderActions() {
  const hydrated = useHydrated();
  const lines = useCart((s) => s.lines);
  const setOpen = useCart((s) => s.setOpen);
  const wish = useWishlist((s) => s.ids.length);
  const { email } = useAuth();
  const count = hydrated ? cartCount(lines) : 0;

  return (
    <div className="ml-auto flex items-center gap-1 md:ml-0">
      <Link href="/sell" className="btn btn-ghost btn-sm hidden lg:inline-flex">
        <Store size={18} /> Sell
      </Link>
      <Link href={email ? "/account" : "/login"} className="btn btn-ghost btn-sm hidden sm:inline-flex" aria-label="Account">
        <User size={18} />
        <span className="hidden max-w-28 truncate xl:inline">{email ? email.split("@")[0] : "Sign in"}</span>
      </Link>
      <Link href="/wishlist" className="btn btn-ghost btn-sm relative" aria-label={`Wishlist, ${hydrated ? wish : 0} items`}>
        <Heart size={18} />
        {hydrated && wish > 0 && <span className="absolute top-1 right-1 h-2 w-2 bg-signal" />}
      </Link>
      <button onClick={() => setOpen(true)} className="btn btn-ink btn-sm" aria-label={`Bag, ${count} items`}>
        <Bag size={18} />
        <span className="price text-[13px]">{count}</span>
      </button>
    </div>
  );
}

export function MobileMenu({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  return (
    <>
      <button className="btn btn-ghost btn-sm -ml-2 px-2 md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
        <Menu size={22} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 animate-fade bg-ink/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-paper">
            <div className="flex items-center justify-between border-b border-rule p-4">
              <Logo />
              <button className="btn btn-ghost btn-sm px-2" onClick={() => setOpen(false)} aria-label="Close menu"><X /></button>
            </div>
            <nav className="flex-1 overflow-y-auto p-4">
              <p className="label mb-2">Shop</p>
              <ul className="mb-6 divide-y divide-rule border-y border-rule">
                <li><Link className="block py-3 font-semibold text-signal" href="/deals">Today&apos;s deals</Link></li>
                <li><Link className="block py-3" href="/search?sort=newest">New in</Link></li>
                {categories.map((c) => (
                  <li key={c.id}><Link className="block py-3" href={`/c/${c.slug}`}>{c.name}</Link></li>
                ))}
                <li><Link className="block py-3" href="/stores">All stores</Link></li>
                <li><Link className="block py-3 text-market" href="/wholesale">Wholesale</Link></li>
              </ul>
              <p className="label mb-2">You</p>
              <ul className="divide-y divide-rule border-y border-rule">
                <li><Link className="block py-3" href="/account">Account</Link></li>
                <li><Link className="block py-3" href="/orders">Orders</Link></li>
                <li><Link className="block py-3" href="/sell">Rent a stall</Link></li>
              </ul>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
