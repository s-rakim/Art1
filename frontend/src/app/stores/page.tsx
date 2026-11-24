import type { Metadata } from "next";
import Link from "next/link";
import { api } from "@/lib/api";
import { compact } from "@/lib/format";
import { safeColor } from "@/lib/safe";

export const metadata: Metadata = { title: "All stores" };

export default async function StoresPage() {
  const stores = await api.stores();
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10">
      <p className="label mb-2">The aisles</p>
      <h1 className="display mb-8 text-[64px] md:text-[96px]">All stores</h1>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stores.items.map((s) => (
          <li key={s.id}>
            <Link href={`/s/${s.slug}`} className="group block border border-ink">
              <div className="flex h-36 items-end p-4" style={{ background: safeColor(s.banner_color), color: safeColor(s.accent_color, "#f4f0e6") }}>
                <p className="display text-[36px] group-hover:underline">{s.name}</p>
              </div>
              <div className="flex items-center justify-between gap-3 bg-card p-4">
                <div className="min-w-0">
                  <p className="truncate text-[14px]">{s.tagline}</p>
                  <p className="mt-1 font-mono text-[11px] text-ink-3">★ {s.rating.toFixed(1)} · {s.product_count} items{s.follower_count != null ? ` · ${compact(s.follower_count)} followers` : ""}</p>
                </div>
                {s.verified && <span className="ticket ticket-market shrink-0">VERIFIED</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
