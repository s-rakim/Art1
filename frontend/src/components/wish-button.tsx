"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase/client";
import { useWishlist } from "@/store/cart";
import { Heart } from "./icons";

export function WishButton({ id, large = false }: { id: string; large?: boolean }) {
  const [hydrated, setH] = useState(false);
  useEffect(() => setH(true), []);
  const on = useWishlist((s) => s.ids.includes(id));
  const toggle = useWishlist((s) => s.toggle);
  const active = hydrated && on;
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        const was = on;
        toggle(id);
        // Signed in: keep the account's wishlist in step so it follows them to other devices.
        const token = (await supabase()?.auth.getSession())?.data.session?.access_token;
        if (token) (was ? api.wishRemove(token, id) : api.wishAdd(token, id)).catch(() => {});
      }}
      aria-pressed={active}
      aria-label={active ? "Remove from wishlist" : "Save to wishlist"}
      className={large
        ? `btn btn-line ${active ? "!bg-ink !text-paper" : ""}`
        : "relative z-10 flex h-8 w-8 items-center justify-center bg-card/90 text-ink hover:bg-card"}
    >
      <Heart size={large ? 18 : 16} filled={active} className={active ? "text-signal" : ""} />
      {large && (active ? "Saved" : "Save")}
    </button>
  );
}
