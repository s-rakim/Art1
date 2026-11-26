"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { compact } from "@/lib/format";
import { safeColor } from "@/lib/safe";
import type { SwitcherStore } from "@/lib/switcher";
import { CheckCircle } from "./icons";
import { Coverflow } from "./ui/coverflow-carousel";

/**
 * Swing through the market's stalls. On the stores page it just browses; on a store's own page
 * (`current` set) it is a switcher: once the row settles on another stall, that stall opens.
 */
export function StoreSwitcher({ stores, current, compactCards = false }: { stores: SwitcherStore[]; current?: string; compactCards?: boolean }) {
  const router = useRouter();
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const start = current ? Math.max(0, stores.findIndex((s) => s.slug === current)) : Math.floor((stores.length - 1) / 2);

  return (
    <Coverflow
      items={stores}
      initial={start}
      label={current ? "Switch to another stall" : "Stalls in the market"}
      itemKey={(s) => s.id}
      itemLabel={(s) => s.name}
      itemHref={(s) => `/s/${s.slug}`}
      cardWidth={compactCards ? 220 : 260}
      cardHeight={compactCards ? 150 : 196}
      onChange={(s) => {
        if (!current) return;
        router.prefetch(`/s/${s.slug}`);
        // Wait for the swing to finish, and for the visitor to stop pressing arrows, then go.
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => router.push(`/s/${s.slug}`, { scroll: false }), 650);
      }}
      renderItem={(s, front) => <StoreCard s={s} front={front} small={compactCards} here={s.slug === current} />}
    />
  );
}

function StoreCard({ s, front, small, here }: { s: SwitcherStore; front: boolean; small: boolean; here: boolean }) {
  const band = safeColor(s.banner_color, "#00679e");
  return (
    <div className="flex h-full flex-col">
      {/* The stall's own colour as a band, Nextcloud-profile style; the text stays on white. */}
      <div className={small ? "h-10 shrink-0" : "h-16 shrink-0"} style={{ background: band }} aria-hidden />
      <div className="relative flex min-h-0 flex-1 flex-col px-3 pb-3">
        <span
          aria-hidden
          className={`-mt-6 mb-1.5 flex shrink-0 items-center justify-center rounded-full border-[3px] border-main-background bg-primary-element font-semibold text-primary-element-text ${small ? "h-11 w-11 text-[18px]" : "h-12 w-12 text-[20px]"}`}
        >
          {s.name.trim().slice(0, 1).toUpperCase()}
        </span>
        <p className="flex items-center gap-1 font-semibold leading-tight">
          <span className="truncate">{s.name}</span>
          {s.verified && <CheckCircle size={16} className="shrink-0 text-primary-element" aria-label="Verified store" />}
        </p>
        {!small && <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-maxcontrast">{s.tagline}</p>}
        <p className="mt-auto pt-1 text-[12px] text-maxcontrast">
          {here ? "You're here" : front ? "Open stall" : null}
          {(here || front) && " · "}
          {s.review_count ? `★ ${s.rating.toFixed(1)} · ` : "New · "}
          {s.product_count} items{!small && s.follower_count != null ? ` · ${compact(s.follower_count)} followers` : ""}
        </p>
      </div>
    </div>
  );
}
