import Link from "next/link";
import { Suspense } from "react";
import { api } from "@/lib/api";
import { STORE_NAME } from "@/lib/config";
import { money } from "@/lib/format";
import { FREE_SHIPPING_CENTS } from "@/lib/config";
import { Logo } from "./logo";
import { SearchBox } from "./search-box";
import { HeaderActions, MobileMenu } from "./header-client";

export async function Header() {
  const categories = await api.categories().catch(() => []);
  const roots = categories.filter((c) => !c.parent_id);

  return (
    <header className="sticky top-0 z-40 bg-paper">
      <div className="bg-ink text-paper">
        <div className="mx-auto flex h-8 max-w-[1400px] items-center justify-between gap-4 px-4 text-[12px]">
          <p className="truncate">
            <span className="font-mono text-tag">FREE SHIPPING</span> on orders over {money(FREE_SHIPPING_CENTS)} from any one store
            <span className="mx-2 text-ink-3">/</span>30-day returns
          </p>
          <Link href="/sell" className="hidden shrink-0 hover:text-tag sm:block">
            Rent a stall on {STORE_NAME} →
          </Link>
        </div>
      </div>

      <div className="border-b border-rule">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 md:gap-6">
          <MobileMenu categories={roots} />
          <Logo />
          <div className="hidden flex-1 md:block">
            <Suspense fallback={<div className="h-11 border border-ink bg-card" />}>
              <SearchBox categories={categories} />
            </Suspense>
          </div>
          <HeaderActions />
        </div>
        <div className="px-4 pb-3 md:hidden">
          <Suspense fallback={<div className="h-11 border border-ink bg-card" />}>
            <SearchBox categories={categories} />
          </Suspense>
        </div>
      </div>

      <nav aria-label="Departments" className="hidden border-b border-rule md:block">
        <ul className="no-scrollbar mx-auto flex h-10 max-w-[1400px] items-center gap-6 overflow-x-auto px-4 text-[13px] font-medium">
          <li>
            <Link href="/deals" className="flex items-center gap-1.5 text-signal hover:underline">
              <span className="inline-block h-1.5 w-1.5 bg-signal" /> Today&apos;s deals
            </Link>
          </li>
          <li><Link href="/search?sort=newest" className="hover:underline">New in</Link></li>
          {roots.map((c) => (
            <li key={c.id}>
              <Link href={`/c/${c.slug}`} className="whitespace-nowrap hover:underline">{c.name}</Link>
            </li>
          ))}
          <li><Link href="/stores" className="whitespace-nowrap hover:underline">All stores</Link></li>
          <li className="ml-auto"><Link href="/wholesale" className="whitespace-nowrap text-market hover:underline">Wholesale</Link></li>
        </ul>
      </nav>
    </header>
  );
}
