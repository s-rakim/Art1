import type { Metadata } from "next";
import { ProductGrid } from "@/components/product-card";
import { SectionHead } from "@/components/ui";
import { api } from "@/lib/api";

export const metadata: Metadata = { title: "Wholesale" };

export default async function WholesalePage() {
  const all = await api.products({ sort: "bestselling", page_size: 100 });
  const bulk = all.items.filter((p) => p.badges?.includes("Bulk pricing"));
  return (
    <>
      <div className="border-b border-ink bg-market text-paper">
        <div className="mx-auto max-w-[1400px] px-4 py-12">
          <p className="label !text-paper/60 mb-2">Tiered pricing, straight from the maker</p>
          <h1 className="display text-[64px] md:text-[96px]">Wholesale</h1>
          <ol className="mt-6 grid max-w-3xl gap-4 text-[14px] sm:grid-cols-3">
            {["Pick a listing with bulk pricing", "The unit price drops at each quantity break", "Need a custom run? Message the supplier from their store"].map((t, i) => (
              <li key={t} className="border-t border-paper/30 pt-3"><span className="font-mono text-tag">0{i + 1}</span><p className="mt-1">{t}</p></li>
            ))}
          </ol>
        </div>
      </div>
      <div className="mx-auto max-w-[1400px] px-4 py-10">
        <SectionHead title={`${bulk.length} listings with bulk pricing`} />
        <ProductGrid items={bulk} />
      </div>
    </>
  );
}
