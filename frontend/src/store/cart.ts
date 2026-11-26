"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine } from "@/lib/types";

// The wishlist comes first: the bag's "Save for later" moves a line into it.
type WishState = { ids: string[]; toggle: (id: string) => void; merge: (ids: string[]) => void };
export const useWishlist = create<WishState>()(
  persist(
    (set) => ({
      ids: [],
      toggle: (id) => set((s) => ({ ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id] })),
      merge: (more) => set((s) => ({ ids: Array.from(new Set([...s.ids, ...more])).slice(-500) })),
    }),
    { name: "bazaar-wishlist" },
  ),
);

type CartState = {
  lines: CartLine[];
  /** Lines the shopper unticked: they stay in the bag but aren't bought at checkout. New lines start ticked. */
  unticked: string[];
  open: boolean;
  add: (line: Omit<CartLine, "id" | "quantity">, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  /** Takes the line out of the bag and hearts the product, so it waits in the wishlist. */
  saveForLater: (id: string) => void;
  tick: (ids: string[], on: boolean) => void;
  /** After an order: only the lines that were bought leave the bag. */
  removeMany: (ids: string[]) => void;
  setOpen: (open: boolean) => void;
};

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      unticked: [],
      open: false,
      add: (line, qty = 1) =>
        set((s) => {
          const id = `${line.product_id}:${line.variant_id}`;
          const existing = s.lines.find((l) => l.id === id);
          const lines = existing
            ? s.lines.map((l) => (l.id === id ? { ...l, quantity: Math.min(l.quantity + qty, 999) } : l))
            : [...s.lines, { ...line, id, quantity: qty }];
          return { lines, unticked: s.unticked.filter((x) => x !== id), open: true };
        }),
      setQty: (id, qty) =>
        set((s) => ({ lines: s.lines.map((l) => (l.id === id ? { ...l, quantity: Math.max(1, Math.min(qty, 999)) } : l)) })),
      remove: (id) => set((s) => ({ lines: s.lines.filter((l) => l.id !== id), unticked: s.unticked.filter((x) => x !== id) })),
      saveForLater: (id) =>
        set((s) => {
          const line = s.lines.find((l) => l.id === id);
          if (!line) return s;
          useWishlist.getState().merge([line.product_id]);
          return { lines: s.lines.filter((l) => l.id !== id), unticked: s.unticked.filter((x) => x !== id) };
        }),
      tick: (ids, on) =>
        set((s) => ({ unticked: on ? s.unticked.filter((x) => !ids.includes(x)) : Array.from(new Set([...s.unticked, ...ids])) })),
      removeMany: (ids) => set((s) => ({ lines: s.lines.filter((l) => !ids.includes(l.id)), unticked: s.unticked.filter((x) => !ids.includes(x)) })),
      setOpen: (open) => set({ open }),
    }),
    {
      name: "bazaar-cart",
      version: 1,
      partialize: (s) => ({ lines: s.lines, unticked: s.unticked }),
      // Version 0 kept a separate "saved for later" list in the bag. Those now go to the wishlist.
      migrate: (old, version) => {
        const o = (old ?? {}) as { lines?: CartLine[]; saved?: CartLine[]; unticked?: string[] };
        if (version < 1 && Array.isArray(o.saved)) useWishlist.getState().merge(o.saved.map((l) => l.product_id).filter((x) => typeof x === "string"));
        return { lines: Array.isArray(o.lines) ? o.lines : [], unticked: Array.isArray(o.unticked) ? o.unticked : [] };
      },
    },
  ),
);

export const cartCount = (lines: CartLine[]) => lines.reduce((a, l) => a + l.quantity, 0);
export const cartSubtotal = (lines: CartLine[]) => lines.reduce((a, l) => a + l.unit_price_cents * l.quantity, 0);
/** The lines that will be bought at checkout. */
export const ticked = (lines: CartLine[], unticked: string[]) => lines.filter((l) => !unticked.includes(l.id));

type RecentState = { slugs: string[]; push: (slug: string) => void };
export const useRecent = create<RecentState>()(
  persist(
    (set) => ({
      slugs: [],
      push: (slug) => set((s) => ({ slugs: [slug, ...s.slugs.filter((x) => x !== slug)].slice(0, 12) })),
    }),
    { name: "bazaar-recent" },
  ),
);
