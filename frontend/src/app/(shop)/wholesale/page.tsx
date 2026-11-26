import type { Metadata } from "next";
import { ProductGrid } from "@/components/product-card";
import { SectionHead } from "@/components/ui";
import { api } from "@/lib/api";

export const metadata: Metadata = { title: "Wholesale" };

export default async function WholesalePage() {
  const all = await api.products({ sort: "popular", page_size: 100 });
  const bulk = all.items.filter((p) => p.badges?.includes("Bulk pricing"));
  return (
    <div className="px-4 py-5 md:px-6">
      <p className="label">Tiered pricing, straight from the maker</p>
      <h1 className="heading text-[22px]">Wholesale</h1>
      <ol className="mt-4 mb-8 grid gap-2 text-[15px] sm:grid-cols-3">
        {["Pick a listing with bulk pricing", "The unit price drops at each quantity break", "Need a custom run? Message the supplier from their store"].map((t, i) => (
          <li key={t} className="panel flex items-start gap-3 p-3">
            <span className="counter counter-highlighted shrink-0">{i + 1}</span>
            <p>{t}</p>
          </li>
        ))}
      </ol>
      <SectionHead title={`${bulk.length} listings with bulk pricing`} />
      <ProductGrid items={bulk} />
    </div>
  );
}
