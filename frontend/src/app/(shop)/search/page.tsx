import type { Metadata } from "next";
import { Listing } from "@/components/listing";
import { Breadcrumbs } from "@/components/ui";
import { api } from "@/lib/api";
import { parseQuery, type SP } from "@/lib/query";

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const q = parseQuery(await searchParams).q;
  return { title: q ? `Results for ${q}` : "Search", robots: { index: false } };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const query = parseQuery(sp);
  const categories = await api.categories();
  return (
    <div className="px-4 py-5 md:px-6">
      <Breadcrumbs items={[["Home", "/"], ["Search"]]} />
      <h1 className="heading mb-4 text-[22px]">
        {query.q ? <>Results for “{query.q}”</> : query.sort === "newest" ? "New in" : "Everything"}
      </h1>
      <Listing basePath="/search" sp={sp} query={query} categories={categories} />
    </div>
  );
}
