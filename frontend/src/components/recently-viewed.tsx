"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRecent } from "@/store/cart";

export function TrackView({ slug }: { slug: string }) {
  const push = useRecent((s) => s.push);
  useEffect(() => push(slug), [slug, push]);
  return null;
}

export function RecentlyViewed({ titles }: { titles: Record<string, string> }) {
  const [h, setH] = useState(false);
  useEffect(() => setH(true), []);
  const slugs = useRecent((s) => s.slugs).filter((s) => titles[s]);
  if (!h || slugs.length === 0) return null;
  return (
    <section className="mx-auto mt-16 max-w-[1400px] px-4">
      <p className="label mb-3">Recently viewed</p>
      <ul className="flex flex-wrap gap-2">
        {slugs.slice(0, 10).map((s) => (
          <li key={s}>
            <Link href={`/p/${s}`} className="block border border-rule bg-card px-3 py-1.5 text-[13px] hover:border-ink">{titles[s]}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
