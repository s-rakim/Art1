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
  const { token, ready } = useAuth();
  const [items, setItems] = useState<ProductCard[] | null>(null);

  useEffect(() => {
    if (!ready) return;
    api.wishlist(token, ids).then((r) => setItems(r.items)).catch(() => setItems([]));
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
