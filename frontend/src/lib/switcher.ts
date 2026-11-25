import type { Store } from "./types";

// Plain module (no "use client"), so server pages can trim stores before handing them over.

export type SwitcherStore = Pick<Store, "id" | "slug" | "name" | "tagline" | "verified" | "rating" | "review_count" | "product_count" | "follower_count" | "banner_color">;

/** Only what a switcher card shows goes to the browser. */
export const forSwitcher = ({ id, slug, name, tagline, verified, rating, review_count, product_count, follower_count, banner_color }: Store): SwitcherStore => ({
  id, slug, name, tagline, verified, rating, review_count, product_count, follower_count, banner_color,
});
