export const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || "The Bazaar";
export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "USD";
export const DEMO_DATA = (process.env.NEXT_PUBLIC_DEMO_DATA ?? "on") !== "off";
export const PUBLIC_API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1").replace(/\/$/, "");
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const AUTH_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export function apiBase() {
  if (typeof window === "undefined" && process.env.API_URL_INTERNAL) {
    return process.env.API_URL_INTERNAL.replace(/\/$/, "");
  }
  return PUBLIC_API_URL;
}
/**
 * Vector basemap. OpenFreeMap serves OpenStreetMap data rebuilt every week, free and without
 * an API key, so streets and buildings stay current. Set NEXT_PUBLIC_MAP_STYLE to any MapLibre
 * style URL (MapTiler, Stadia, your own), or to "raster" to use the raster tiles below instead.
 */
export const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || "https://tiles.openfreemap.org/styles/positron";
export const MAP_STYLE_DARK = process.env.NEXT_PUBLIC_MAP_STYLE_DARK || (process.env.NEXT_PUBLIC_MAP_STYLE ? MAP_STYLE : "https://tiles.openfreemap.org/styles/dark");
/** Raster fallback, used when the vector style can't load. */
/**
 * An OSRM-compatible router for the rider's route line, e.g. a self-hosted osrm-backend. Empty
 * means the map joins the stops with straight lines in the right order instead of following roads.
 */
export const ROUTING_URL = (process.env.NEXT_PUBLIC_ROUTING_URL || "").replace(/\/$/, "");
export const MAP_TILES = process.env.NEXT_PUBLIC_MAP_TILES || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const MAP_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || "© OpenStreetMap contributors";

/** Default map centre before any pins load, as "lat,lng". */
export const MAP_CENTER = (() => {
  const [lat, lng] = (process.env.NEXT_PUBLIC_MAP_CENTER || "30.2672,-97.7431").split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : { lat: 30.2672, lng: -97.7431 };
})();
