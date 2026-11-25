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
    <div className="px-4 py-5 md:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">Prices reset at midnight UTC</p>
          <h1 className="heading text-[22px]">Today&apos;s deals</h1>
        </div>
        <Countdown />
      </div>
      <Listing basePath="/deals" sp={sp} query={query} categories={categories} lockSale />
    </div>
  );
}
