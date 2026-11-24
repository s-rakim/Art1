"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AUTH_ENABLED } from "@/lib/config";
import { supabase } from "@/lib/supabase/client";
import { cartCount, useCart, useWishlist } from "@/store/cart";
import { AdminIcon, Bag, Bike, Heart, Logout, Receipt, Search, Shop, Store, User, X } from "./icons";

function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => setH(true), []);
  return h;
}

type App = { href: string; label: string; icon: ReactNode; match: (p: string) => boolean };

/** The row of app icons next to the logo. Each account area shows up here once you can open it. */
export function AppMenu() {
  const path = usePathname();
  const { roles } = useAuth();
  const all = !AUTH_ENABLED; // demo mode opens every area
  const area = (p: string) => /^\/(seller|admin|rider)(\/|$)/.test(p);
  const apps: App[] = [
    { href: "/", label: "Shop", icon: <Shop />, match: (p) => !area(p) && !p.startsWith("/sell") },
    roles.includes("vendor") || all
      ? { href: "/seller", label: "Vendor", icon: <Store />, match: (p) => p.startsWith("/seller") }
      : { href: "/sell", label: "Sell", icon: <Store />, match: (p) => p.startsWith("/sell") && !p.startsWith("/seller") },
    ...(roles.includes("rider") || all ? [{ href: "/rider", label: "Rider", icon: <Bike />, match: (p: string) => p.startsWith("/rider") }] : []),
    ...(roles.includes("admin") || all ? [{ href: "/admin", label: "Admin", icon: <AdminIcon />, match: (p: string) => p.startsWith("/admin") }] : []),
  ];
  return (
    <nav aria-label="Apps" className="hidden h-full sm:block">
      <ul className="flex h-full">
        {apps.map((a) => {
          const on = a.match(path);
          return (
            <li key={a.href} className="h-full">
              <Link
                href={a.href}
                aria-current={on ? "page" : undefined}
                className="group relative flex h-full w-[50px] flex-col items-center justify-center opacity-85 hover:opacity-100 aria-[current=page]:opacity-100 focus-visible:opacity-100"
              >
                {a.icon}
                <span className={`absolute bottom-[1px] max-w-full truncate text-[12px] leading-none transition-opacity ${on ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}>{a.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Search field in the header, styled like Nextcloud's unified search on the blue bar. */
export function HeaderSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const listId = useId();
  const wrap = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      api.suggest(term).then((s) => setSuggestions(s.slice(0, 7))).catch(() => setSuggestions([]));
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (mobile) input.current?.focus();
  }, [mobile]);

  function go(term: string) {
    const sp = new URLSearchParams();
    if (term.trim()) sp.set("q", term.trim().slice(0, 120));
    const category = params.get("category");
    if (category) sp.set("category", category);
    setOpen(false);
    setMobile(false);
    router.push(`/search?${sp.toString()}`);
  }

  return (
    <>
      <button type="button" className="btn btn-plain btn-icon md:hidden" onClick={() => setMobile(true)} aria-label="Search">
        <Search />
      </button>
      <form
        ref={wrap}
        role="search"
        className={`group ${mobile ? "absolute inset-x-1.5 top-[5px] z-10 flex" : "hidden"} md:relative md:inset-auto md:top-auto md:flex md:w-[clamp(220px,28vw,400px)]`}
        onSubmit={(e) => {
          e.preventDefault();
          go(active >= 0 ? suggestions[active] : q);
        }}
      >
        <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 opacity-80 group-focus-within:text-maxcontrast group-focus-within:opacity-100">
          <Search size={18} />
        </span>
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => !q && setMobile(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setMobile(false);
            }
            if (!open || !suggestions.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % suggestions.length); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1)); }
          }}
          maxLength={120}
          type="search"
          name="q"
          placeholder="Search products and stores"
          aria-label="Search"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          className="h-[34px] w-full rounded-pill border-none bg-white/20 pr-9 pl-9 text-[15px] text-background-plain-text outline-none placeholder:text-background-plain-text/80 focus:bg-main-background focus:text-main-text focus:placeholder:text-maxcontrast [&::-webkit-search-cancel-button]:hidden"
        />
        {mobile && (
          <button type="button" className="absolute top-0 right-0 flex h-[34px] w-[34px] items-center justify-center text-maxcontrast" onClick={() => { setQ(""); setMobile(false); }} aria-label="Close search">
            <X size={18} />
          </button>
        )}
        {open && suggestions.length > 0 && (
          <ul id={listId} role="listbox" className="menu absolute top-[calc(100%+6px)] right-0 left-0 z-50 text-main-text">
            {suggestions.map((s, i) => (
              <li
                key={s}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); setQ(s); go(s); }}
                onMouseEnter={() => setActive(i)}
                className="menu-item cursor-pointer text-[15px]"
              >
                <Search size={16} className="text-maxcontrast" />
                {s}
              </li>
            ))}
          </ul>
        )}
      </form>
    </>
  );
}

export function WishLink() {
  const hydrated = useHydrated();
  const wish = useWishlist((s) => s.ids.length);
  const n = hydrated ? wish : 0;
  return (
    <Link href="/wishlist" className="btn btn-plain btn-icon relative" aria-label={`Wishlist, ${n} items`}>
      <Heart />
      {n > 0 && <span className="absolute top-[5px] right-[5px] h-2 w-2 rounded-full bg-background-plain-text" aria-hidden />}
    </Link>
  );
}

export function BagButton() {
  const hydrated = useHydrated();
  const lines = useCart((s) => s.lines);
  const setOpen = useCart((s) => s.setOpen);
  const count = hydrated ? cartCount(lines) : 0;
  return (
    <button type="button" onClick={() => setOpen(true)} className="btn btn-plain relative gap-1.5 px-2" aria-label={`Bag, ${count} items`}>
      <Bag />
      {count > 0 && <span className="counter min-w-[20px] bg-background-plain-text px-1.5 text-background-plain" style={{ height: 20 }}>{count > 99 ? "99+" : count}</span>}
    </button>
  );
}

/** Round avatar with the user's initial; opens Nextcloud's user menu. */
export function AccountMenu() {
  const { email, roles, ready } = useAuth();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const initial = email?.[0]?.toUpperCase();
  const items: Array<[string, string, ReactNode]> = email
    ? [
        ["Account", "/account", <User key="u" />],
        ["Orders", "/orders", <Receipt key="r" />],
        ["Wishlist", "/wishlist", <Heart key="h" />],
        ...(roles.includes("vendor") ? [["Vendor dashboard", "/seller", <Store key="s" />] as [string, string, ReactNode]] : []),
        ...(roles.includes("rider") ? [["Rider app", "/rider", <Bike key="b" />] as [string, string, ReactNode]] : []),
        ...(roles.includes("admin") ? [["Admin console", "/admin", <AdminIcon key="a" />] as [string, string, ReactNode]] : []),
      ]
    : [
        ["Sign in", "/login", <User key="u" />],
        ["Create an account", "/signup", <User key="c" />],
        ["Orders", "/orders", <Receipt key="r" />],
        ["Vendor sign in", "/login?as=vendor", <Store key="s" />],
        ["Rider sign in", "/login?as=rider", <Bike key="b" />],
      ];

  return (
    <div ref={box} className="relative ml-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={email ? `Account menu for ${email}` : "Account menu"}
        className="flex h-[44px] w-[44px] items-center justify-center rounded-full"
      >
        <span className="flex h-[32px] w-[32px] items-center justify-center rounded-full bg-background-plain-text text-[15px] font-semibold text-background-plain">
          {ready && initial ? initial : <User size={20} />}
        </span>
      </button>
      {open && (
        <div role="menu" className="menu absolute top-[calc(100%-2px)] right-0 z-50 w-64 text-main-text">
          {email && (
            <div className="mb-1 border-b border-border px-2 pt-1 pb-2">
              <p className="truncate font-semibold">{email.split("@")[0]}</p>
              <p className="truncate text-[13px] text-maxcontrast">{email}</p>
            </div>
          )}
          {items.map(([label, href, icon]) => (
            <Link key={href} href={href} role="menuitem" className="menu-item">
              <span className="text-maxcontrast">{icon}</span>
              {label}
            </Link>
          ))}
          {email && (
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={async () => {
                await supabase()?.auth.signOut();
                router.replace("/");
                router.refresh();
              }}
            >
              <span className="text-maxcontrast"><Logout /></span>
              Log out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
