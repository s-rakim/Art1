"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const options: Array<[string, string]> = [
  ["relevance", "Best match"],
  ["popular", "Most popular"],
  ["newest", "Newest"],
  ["price_asc", "Price, low to high"],
  ["price_desc", "Price, high to low"],
  ["rating", "Top rated"],
];

export function SortSelect() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-[14px]">
      <span className="text-maxcontrast">Sort</span>
      <select
        className="field !w-auto"
        value={params.get("sort") ?? "relevance"}
        onChange={(e) => {
          const sp = new URLSearchParams(params.toString());
          if (e.target.value === "relevance") sp.delete("sort");
          else sp.set("sort", e.target.value);
          sp.delete("page");
          router.push(`${path}?${sp.toString()}`);
        }}
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
