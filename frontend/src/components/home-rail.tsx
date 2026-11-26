"use client";
import Link from "next/link";
import { useMemo } from "react";
import type { ProductCard } from "@/lib/types";
import { ClothingRailHero, type GarmentKind, type RailGarment } from "./ui/product-rail-gallery";

const HEX = /^#[0-9a-fA-F]{3,8}$/;

function kindOf(p: ProductCard): GarmentKind {
  const t = p.title.toLowerCase();
  if (/hood/.test(t)) return "hoodie";
  if (/coat|parka|trench|dress|gown|abaya|kaftan/.test(t) || p.art?.shape === "dress") return "coat";
  if (/jacket|vest|blazer|gilet/.test(t) || p.art?.shape === "jacket") return "jacket";
  if (/(^|[^t-])shirt|blouse|oxford|button/.test(t)) return "shirt";
  if (/knit|sweater|cardigan|sweatshirt|crew|jumper|henley|long sleeve/.test(t)) return "knit";
  return "tee";
}

/** Only plain http(s) or same-site image URLs make it onto the rail. */
function safeImage(src: string | null | undefined) {
  if (!src) return undefined;
  if (src.startsWith("/") && !src.startsWith("//")) return src;
  try {
    const u = new URL(src);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The home page's clothing rail: real pieces from the market's clothing shops. Photos are used
 * when a vendor has uploaded one; otherwise the rail draws the garment in the listing's colour.
 * Prices stay off the hang tags; the tag names the shop instead.
 */
export function HomeRail({ products }: { products: ProductCard[] }) {
  const items = useMemo<RailGarment[]>(
    () =>
      products.slice(0, 10).map((p) => {
        const color = [p.colors?.[0], p.art?.fg, p.art?.bg].find((c): c is string => !!c && HEX.test(c));
        return {
          id: p.id,
          name: p.title,
          description: `From ${p.store.name}`,
          kind: kindOf(p),
          color,
          image: safeImage(p.image_url),
          tag: p.store.name.length > 18 ? `${p.store.name.slice(0, 17)}…` : p.store.name,
          details: [p.store.name, ...(p.review_count ? [`★ ${p.rating.toFixed(1)}`] : []), ...(p.sold_count ? [`${p.sold_count.toLocaleString("en-US")} sold`] : [])],
          href: `/p/${encodeURIComponent(p.slug)}`,
        };
      }),
    [products],
  );
  if (items.length < 3) return null;
  return (
    <div className="mx-auto mb-6 max-w-[1400px] overflow-hidden rounded-large bg-main-background shadow-[0_0_10px_rgb(0_0_0/0.12)]">
      <ClothingRailHero
        items={items}
        hanger="wood"
        autoplay
        eyebrow="On the rail"
        heading="Fresh from the market's clothing shops"
        caption="Brush along the rail, or tap a piece to turn it around."
        labels={{ front: "Front", back: "Back", close: "Close", show: "Show", view: "See it in the shop" }}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/c/women" className="btn btn-primary">Shop women</Link>
            <Link href="/c/men" className="btn btn-secondary">Shop men</Link>
          </div>
        }
      />
    </div>
  );
}
