import { create } from 'zustand';

export type Line = { cart_item_id: string; variant_id: string; product_id: string; quantity: number; title: string; line_total_cents: number };

/** The lines picked in the cart, handed to the checkout screen. In memory only. */
export const useCheckout = create<{ lines: Line[]; setLines: (l: Line[]) => void }>((set) => ({
  lines: [],
  setLines: (lines) => set({ lines }),
}));
