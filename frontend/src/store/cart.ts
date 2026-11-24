"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine } from "@/lib/types";

type CartState = {
  lines: CartLine[];
  saved: CartLine[];
  open: boolean;
  add: (line: Omit<CartLine, "id" | "quantity">, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  saveForLater: (id: string) => void;
  moveToCart: (id: string) => void;
  clear: () => void;
  setOpen: (open: boolean) => void;
};

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      saved: [],
      open: false,
      add: (line, qty = 1) =>
        set((s) => {
          const id = `${line.product_id}:${line.variant_id}`;
          const existing = s.lines.find((l) => l.id === id);
          const lines = existing
            ? s.lines.map((l) => (l.id === id ? { ...l, quantity: Math.min(l.quantity + qty, 999) } : l))
            : [...s.lines, { ...line, id, quantity: qty }];
          return { lines, open: true };
        }),
      setQty: (id, qty) =>
        set((s) => ({ lines: s.lines.map((l) => (l.id === id ? { ...l, quantity: Math.max(1, Math.min(qty, 999)) } : l)) })),
      remove: (id) => set((s) => ({ lines: s.lines.filter((l) => l.id !== id) })),
      saveForLater: (id) =>
        set((s) => {
          const line = s.lines.find((l) => l.id === id);
          return line ? { lines: s.lines.filter((l) => l.id !== id), saved: [...s.saved.filter((l) => l.id !== id), line] } : s;
        }),
      moveToCart: (id) =>
        set((s) => {
          const line = s.saved.find((l) => l.id === id);
          return line ? { saved: s.saved.filter((l) => l.id !== id), lines: [...s.lines, line] } : s;
        }),
      clear: () => set({ lines: [] }),
      setOpen: (open) => set({ open }),
    }),
    { name: "stallrow-cart", partialize: (s) => ({ lines: s.lines, saved: s.saved }) },
  ),
);

export const cartCount = (lines: CartLine[]) => lines.reduce((a, l) => a + l.quantity, 0);
export const cartSubtotal = (lines: CartLine[]) => lines.reduce((a, l) => a + l.unit_price_cents * l.quantity, 0);

type WishState = { ids: string[]; toggle: (id: string) => void; merge: (ids: string[]) => void };
export const useWishlist = create<WishState>()(
  persist(
    (set) => ({
      ids: [],
      toggle: (id) => set((s) => ({ ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id] })),
      merge: (more) => set((s) => ({ ids: Array.from(new Set([...s.ids, ...more])).slice(-500) })),
    }),
    { name: "stallrow-wishlist" },
  ),
);

type RecentState = { slugs: string[]; push: (slug: string) => void };
export const useRecent = create<RecentState>()(
  persist(
    (set) => ({
      slugs: [],
      push: (slug) => set((s) => ({ slugs: [slug, ...s.slugs.filter((x) => x !== slug)].slice(0, 12) })),
    }),
    { name: "stallrow-recent" },
  ),
);
