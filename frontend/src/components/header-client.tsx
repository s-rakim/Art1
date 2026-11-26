"use client";
import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useHydrated } from "@/lib/hooks";
import { areasFor, RIDE_LINKS, SELL_LINKS, YOU_LINKS } from "@/lib/nav";
import { supabase } from "@/lib/supabase/client";
import { cartCount, useCart, useWishlist } from "@/store/cart";
import { Bag, Heart, Logout, Search, User, X } from "./icons";

/** Search field in the header, styled like Nextcloud's unified search on the blue bar. */
export function HeaderSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [found, setFound] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const listId = useId();
  const wrap = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const term = q.trim();
  // Under two letters there is nothing worth suggesting, so the old list is simply not shown.
  const suggestions = term.length < 2 ? [] : found;
  useEffect(() => {
    if (term.length < 2) return;
    const t = setTimeout(() => {
      api.suggest(term).then((s) => setFound(s.slice(0, 7))).catch(() => setFound([]));
    }, 180);
    return () => clearTimeout(t);
  }, [term]);

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

/**
 * Round avatar with the user's initial; opens Nextcloud's user menu. Base UI's menu does the
 * keyboard work: arrow keys and typing move between rows, Escape closes and focus goes back.
 */
export function AccountMenu() {
  const { email, roles, ready } = useAuth();
  const router = useRouter();
  const initial = email?.[0]?.toUpperCase();
  const items: Array<{ label: string; href: string; icon: ReactNode }> = email
    ? [
        ...YOU_LINKS.map((l) => ({ label: l.label, href: l.href, icon: l.icon })),
        ...areasFor(roles, false).map((a) => ({ label: a.title, href: a.href, icon: a.icon })),
      ]
    : [
        { label: "Log in", href: "/login", icon: <User /> },
        { label: "Create an account", href: "/signup", icon: <User /> },
        ...RIDE_LINKS.map((l) => ({ label: l.label, href: l.href, icon: l.icon })),
        { label: SELL_LINKS[0].label, href: SELL_LINKS[0].href, icon: SELL_LINKS[0].icon },
      ];

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        aria-label={email ? `Account menu for ${email}` : "Account menu"}
        className="group ml-1 flex h-[44px] w-[44px] items-center justify-center rounded-full outline-none"
      >
        <span className="flex h-[32px] w-[32px] items-center justify-center rounded-full bg-background-plain-text text-[15px] font-semibold text-background-plain group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-background-plain-text">
          {ready && initial ? initial : <User size={20} />}
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={2} className="z-50">
          <Menu.Popup className="menu w-64 origin-[var(--transform-origin)] text-main-text outline-none transition-[opacity,scale] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
            {email && (
              <div className="mb-1 border-b border-border px-2 pt-1 pb-2">
                <p className="truncate font-semibold">{email.split("@")[0]}</p>
                <p className="truncate text-[13px] text-maxcontrast">{email}</p>
              </div>
            )}
            {items.map((i) => (
              <Menu.LinkItem key={i.href} render={<Link href={i.href} />} closeOnClick className="menu-item outline-none">
                <span className="text-maxcontrast" aria-hidden>{i.icon}</span>
                {i.label}
              </Menu.LinkItem>
            ))}
            {email && (
              <Menu.Item
                className="menu-item cursor-pointer outline-none"
                onClick={async () => {
                  await supabase()?.auth.signOut();
                  router.replace("/");
                  router.refresh();
                }}
              >
                <span className="text-maxcontrast" aria-hidden><Logout /></span>
                Log out
              </Menu.Item>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
