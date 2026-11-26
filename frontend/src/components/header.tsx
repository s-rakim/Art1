import Link from "next/link";
import { Suspense } from "react";
import { api } from "@/lib/api";
import { STORE_NAME } from "@/lib/config";
import { LogoTile } from "./guest-frame";
import { NavToggle } from "./app-navigation";
import { AccountMenu, BagButton, HeaderSearch, WishLink } from "./header-client";
import { SiteNav } from "./site-nav";

/** Nextcloud's header: on the wallpaper, white glyphs, the main menu on the left, user menu on the right. */
export async function Header({ hasNav = false }: { hasNav?: boolean }) {
  const categories = await api.categories().catch(() => []);
  const departments = categories.filter((c) => !c.parent_id).map((c) => ({ href: `/c/${c.slug}`, label: c.name }));
  return (
    <header className="wallpaper sticky top-0 z-40 flex h-[44px] items-center gap-1 px-1.5 text-background-plain-text">
      {hasNav && <NavToggle />}
      <Link href="/" className="flex h-[44px] shrink-0 items-center gap-2 rounded-element px-2" aria-label={`${STORE_NAME} home`}>
        <LogoTile size={30} />
        <span className="hidden text-[16px] font-semibold sm:inline">{STORE_NAME}</span>
      </Link>
      <SiteNav departments={departments} />
      <div className="ml-auto flex items-center gap-0.5">
        <Suspense fallback={<div className="hidden h-[34px] w-64 rounded-pill bg-white/15 md:block" />}>
          <HeaderSearch />
        </Suspense>
        <WishLink />
        <BagButton />
        <AccountMenu />
      </div>
    </header>
  );
}
