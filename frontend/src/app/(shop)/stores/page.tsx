import type { Metadata } from "next";
import Link from "next/link";
import { api } from "@/lib/api";
import { compact } from "@/lib/format";
import { CheckCircle } from "@/components/icons";
import { Avatar } from "@/components/widget";

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
            <Link href={`/s/${s.slug}`} className="card flex h-full items-center gap-4 p-4 hover:bg-background-hover">
              <Avatar name={s.name} size={56} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[17px] font-semibold">
                  <span className="truncate">{s.name}</span>
                  {s.verified && <CheckCircle size={18} className="shrink-0 text-primary-element" aria-label="Verified store" />}
                </p>
                <p className="truncate text-[15px]">{s.tagline}</p>
                <p className="mt-0.5 text-[13px] text-maxcontrast">★ {s.rating.toFixed(1)} · {s.product_count} items{s.follower_count != null ? ` · ${compact(s.follower_count)} followers` : ""}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
