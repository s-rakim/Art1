"use client";
import { createContext, useContext, type ReactNode } from "react";
import { EMPTY_SITE } from "@/lib/api";
import type { SiteInfo } from "@/lib/types";

const Site = createContext<SiteInfo>(EMPTY_SITE);

/** Hands the admin-set fees and contact (read once per request in the root layout) to client components. */
export function SiteProvider({ site, children }: { site: SiteInfo; children: ReactNode }) {
  return <Site.Provider value={site}>{children}</Site.Provider>;
}

export const useSite = () => useContext(Site);
