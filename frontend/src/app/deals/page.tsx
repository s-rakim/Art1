import type { Metadata } from "next";
import { Countdown } from "@/components/countdown";
import { Listing } from "@/components/listing";
import { api } from "@/lib/api";
import { parseQuery, type SP } from "@/lib/query";

export const metadata: Metadata = { title: "Today's deals" };

export default async function DealsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const query = parseQuery(sp, { on_sale: true });
  if (!query.sort) query.sort = "popular";
  const categories = await api.categories();
  return (
    <>
      <div className="border-b border-ink bg-signal text-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-end justify-between gap-4 px-4 py-10">
          <div>
            <p className="font-mono text-[12px] uppercase tracking-wider opacity-80">Prices reset at midnight UTC</p>
            <h1 className="display text-[64px] md:text-[96px]">Today&apos;s deals</h1>
          </div>
          <div className="bg-paper p-2 text-ink"><Countdown /></div>
        </div>
      </div>
      <div className="mx-auto max-w-[1400px] px-4 py-8">
        <Listing basePath="/deals" sp={sp} query={query} categories={categories} lockSale />
      </div>
    </>
  );
}
