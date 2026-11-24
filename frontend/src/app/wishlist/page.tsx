"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ProductGrid } from "@/components/product-card";
import { Empty } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ProductCard } from "@/lib/types";
import { useWishlist } from "@/store/cart";

export default function WishlistPage() {
  const ids = useWishlist((s) => s.ids);
  const merge = useWishlist((s) => s.merge);
  const { token, ready } = useAuth();
  const [items, setItems] = useState<ProductCard[] | null>(null);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    (async () => {
      try {
        let r = await api.wishlist(token, ids);
        // First visit after signing in: anything saved on this device goes up to the account,
        // and anything saved on other devices comes down.
        const firstSync = !!token && !synced;
        if (firstSync) {
          const have = new Set(r.items.map((p) => p.id));
          const missing = ids.filter((id) => !have.has(id)).slice(0, 50);
          if (missing.length) {
            await Promise.allSettled(missing.map((id) => api.wishAdd(token, id)));
            r = await api.wishlist(token, ids);
          }
          merge(r.items.map((p) => p.id));
          if (alive) setSynced(true);
        }
        // After that, the local list is the source of truth for what was just un-hearted.
        if (alive) setItems(token && !firstSync ? r.items.filter((p) => ids.includes(p.id)) : r.items);
      } catch {
        if (alive) setItems([]);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, token, ready]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10">
      <h1 className="display mb-8 text-[56px] md:text-[72px]">Wishlist</h1>
      {items === null ? (
        <div className="min-h-[40vh]" />
      ) : items.length === 0 ? (
        <Empty title="Nothing saved yet" body="Tap the heart on anything you like and it'll wait here." action={<Link href="/" className="btn btn-ink">Browse the market</Link>} />
      ) : (
        <ProductGrid items={items} />
      )}
    </div>
  );
}
