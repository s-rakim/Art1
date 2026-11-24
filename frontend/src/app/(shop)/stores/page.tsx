import type { Metadata } from "next";
import Link from "next/link";
import { api } from "@/lib/api";
import { compact } from "@/lib/format";
import { safeColor } from "@/lib/safe";

export const metadata: Metadata = { title: "All stores" };

export default async function StoresPage() {
  const stores = await api.stores();
  return (
    <div className="px-4 py-5 md:px-6">
      <p className="label">The aisles</p>
      <h1 className="heading mb-5 text-[22px]">All stores</h1>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {stores.items.map((s) => (
          <li key={s.id}>
            <Link href={`/s/${s.slug}`} className="group card block overflow-hidden transition-shadow hover:shadow-menu">
              <div className="flex h-36 items-end p-4" style={{ background: safeColor(s.banner_color), color: safeColor(s.accent_color, "#ffffff") }}>
                <p className="text-[20px] font-semibold group-hover:underline">{s.name}</p>
              </div>
              <div className="flex items-center justify-between gap-3 bg-main-background p-4">
                <div className="min-w-0">
                  <p className="truncate text-[15px]">{s.tagline}</p>
                  <p className="mt-0.5 text-[13px] text-maxcontrast">★ {s.rating.toFixed(1)} · {s.product_count} items{s.follower_count != null ? ` · ${compact(s.follower_count)} followers` : ""}</p>
                </div>
                {s.verified && <span className="chip chip-success shrink-0">Verified</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
