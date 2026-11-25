"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { AUTH_ENABLED } from "@/lib/config";
import { useChanged } from "@/lib/hooks";
import { areasFor, isActive, RIDE_LINKS, SELL_LINKS, SHOP_LINKS, type Area, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Grid, Tag } from "./icons";
import {
  NavigationMenu,
  NavigationMenuArrow,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuPopup,
  NavigationMenuPositioner,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "./ui/navigation-menu-1";
import { RandomLetterSwap } from "./ui/random-letter-swap";

export type Department = { href: string; label: string };

const swap = (label: string) => <RandomLetterSwap label={label} staggerDuration={0.025} transition={{ duration: 0.6, type: "spring" }} />;

/**
 * The site's main menu, in the blue header. Shop and Sell for everyone; Vendor, Rider and Admin
 * once your account has that role. From 1024px up each one is its own trigger; below that they
 * fold into a single Menu button with the same links stacked.
 */
export function SiteNav({ departments }: { departments: Department[] }) {
  const path = usePathname();
  const { roles, ready } = useAuth();
  const areas = areasFor(roles, !AUTH_ENABLED);
  const vendor = areas.some((a) => a.key === "vendor");
  const rider = areas.some((a) => a.key === "rider");
  // Controlled so the panel shuts on navigation, including the browser's back button. The wide
  // and narrow menus each keep their own, or the hidden one would open its (portaled) panel too.
  const [wide, setWide] = useState<string | null>(null);
  const [narrow, setNarrow] = useState<string | null>(null);
  const moved = useChanged(path);
  if (moved && (wide !== null || narrow !== null)) {
    setWide(null);
    setNarrow(null);
  }
  const take = (set: (v: string | null) => void) => (v: unknown) => set(typeof v === "string" ? v : null);

  const inArea = (a: Area) => path === a.href || path.startsWith(`${a.href}/`);
  const shopping = !areas.some(inArea) && !/^\/(seller|admin|rider)(\/|$)/.test(path) && !path.startsWith("/sell");

  const shopPanel = <ShopPanel path={path} departments={departments} />;
  const sellPanel = !vendor ? <SellPanel path={path} rider={rider} /> : null;

  return (
    <>
      {/* Wide screens: one trigger per area. */}
      <NavigationMenu value={wide} onValueChange={take(setWide)} aria-label="Main" className="hidden h-full lg:flex">
        <NavigationMenuList>
          <NavigationMenuItem value="shop">
            <NavigationMenuTrigger data-current={shopping ? "" : undefined} className="data-[current]:bg-white/15">{swap("Shop")}</NavigationMenuTrigger>
            <NavigationMenuContent>{shopPanel}</NavigationMenuContent>
          </NavigationMenuItem>
          {sellPanel && (
            <NavigationMenuItem value="sell">
              <NavigationMenuTrigger data-current={path.startsWith("/sell") ? "" : undefined} className="data-[current]:bg-white/15">{swap("Sell")}</NavigationMenuTrigger>
              <NavigationMenuContent>{sellPanel}</NavigationMenuContent>
            </NavigationMenuItem>
          )}
          {ready &&
            areas.map((a) => {
              const links = a.sections.flatMap((s) => s.items);
              // One page behind it (the rider app): a plain link, not a panel with one row.
              if (links.length === 1)
                return (
                  <NavigationMenuItem key={a.key}>
                    <NavigationMenuLink
                      render={<Link href={a.href} />}
                      active={inArea(a)}
                      className={cn(navigationMenuTriggerStyle(), "p-0 px-3 data-[active]:bg-white/15 data-[active]:text-background-plain-text")}
                    >
                      {swap(a.label)}
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                );
              return (
                <NavigationMenuItem key={a.key} value={a.key}>
                  <NavigationMenuTrigger data-current={inArea(a) ? "" : undefined} className="data-[current]:bg-white/15">{swap(a.label)}</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <AreaPanel area={a} path={path} />
                  </NavigationMenuContent>
                </NavigationMenuItem>
              );
            })}
        </NavigationMenuList>
        <Popup />
      </NavigationMenu>

      {/* Narrow screens: one Menu button holding everything above, stacked. */}
      <NavigationMenu value={narrow} onValueChange={take(setNarrow)} aria-label="Main" className="h-full lg:hidden">
        <NavigationMenuList>
          <NavigationMenuItem value="all">
            <NavigationMenuTrigger aria-label="Menu" className="px-2.5 sm:px-3">
              <Grid size={20} />
              <span className="hidden sm:inline">{swap("Menu")}</span>
            </NavigationMenuTrigger>
            <NavigationMenuContent className="max-h-[calc(100dvh-70px)] overflow-y-auto overscroll-contain sm:w-[min(560px,calc(100vw-40px))]">
              {shopPanel}
              {sellPanel && <Divider>{sellPanel}</Divider>}
              {ready && areas.map((a) => <Divider key={a.key}><AreaPanel area={a} path={path} titled /></Divider>)}
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
        <Popup />
      </NavigationMenu>
    </>
  );
}

function Popup() {
  return (
    <NavigationMenuPositioner>
      <NavigationMenuPopup>
        <NavigationMenuArrow />
      </NavigationMenuPopup>
    </NavigationMenuPositioner>
  );
}

function Divider({ children }: { children: ReactNode }) {
  return <div className="mt-2 border-t border-border pt-2">{children}</div>;
}

function Caption({ children }: { children: ReactNode }) {
  return <p className="px-2 pt-1 pb-1.5 text-[13px] font-semibold text-primary-element">{children}</p>;
}

/** A row: the icon in a soft tile, the name, and one line on what's behind it. */
function Row({ item, path }: { item: NavItem; path: string }) {
  return (
    <li>
      <NavigationMenuLink render={<Link href={item.href} />} active={isActive(path, item)} closeOnClick>
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-element bg-primary-element-light text-primary-element-light-text" aria-hidden>
          {item.icon}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold leading-tight">{item.label}</span>
          {item.blurb && <span className="mt-0.5 block text-[13px] leading-snug text-maxcontrast">{item.blurb}</span>}
        </span>
      </NavigationMenuLink>
    </li>
  );
}

function ShopPanel({ path, departments }: { path: string; departments: Department[] }) {
  return (
    <div className="grid gap-2 sm:w-[560px] sm:grid-cols-[1fr_200px]">
      <div>
        <Caption>Browse</Caption>
        <ul>
          {SHOP_LINKS.filter((l) => l.href !== "/").map((l) => <Row key={l.href} item={l} path={path} />)}
        </ul>
      </div>
      {departments.length > 0 && (
        <div className="sm:border-l sm:border-border sm:pl-2">
          <Caption>Departments</Caption>
          <ul className="grid grid-cols-2 sm:grid-cols-1">
            {departments.map((d) => (
              <li key={d.href}>
                <NavigationMenuLink render={<Link href={d.href} />} active={isActive(path, d)} closeOnClick className="items-center py-1.5">
                  <Tag size={18} className="shrink-0 text-maxcontrast" />
                  <span className="truncate">{d.label}</span>
                </NavigationMenuLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SellPanel({ path, rider }: { path: string; rider: boolean }) {
  return (
    <div className="sm:w-[360px]">
      <Caption>Sell here</Caption>
      <ul>{SELL_LINKS.map((l) => <Row key={l.href} item={l} path={path} />)}</ul>
      {!rider && (
        <>
          <Caption>Ride with us</Caption>
          <ul>{RIDE_LINKS.map((l) => <Row key={l.href} item={l} path={path} />)}</ul>
        </>
      )}
    </div>
  );
}

function AreaPanel({ area, path, titled = false }: { area: Area; path: string; titled?: boolean }) {
  const many = area.sections.flatMap((s) => s.items).length > 4;
  return (
    <div className={cn(many && "sm:w-[560px]")}>
      {titled && <Caption>{area.label}</Caption>}
      <div className={cn("grid", many && "sm:grid-cols-2 sm:gap-x-2")}>
        {area.sections.map((s, i) => (
          <div key={i}>
            {s.caption && <p className="px-2 pt-1 pb-1 text-[13px] text-maxcontrast">{s.caption}</p>}
            <ul>{s.items.map((l) => <Row key={l.href} item={l} path={path} />)}</ul>
          </div>
        ))}
      </div>
    </div>
  );
}
