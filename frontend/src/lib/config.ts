export const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || "Stallrow";
export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "USD";
export const DEMO_DATA = (process.env.NEXT_PUBLIC_DEMO_DATA ?? "on") !== "off";
export const PUBLIC_API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1").replace(/\/$/, "");
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const AUTH_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const FREE_SHIPPING_CENTS = 5000;

export function apiBase() {
  if (typeof window === "undefined" && process.env.API_URL_INTERNAL) {
    return process.env.API_URL_INTERNAL.replace(/\/$/, "");
  }
  return PUBLIC_API_URL;
}
export const MAP_TILES = process.env.NEXT_PUBLIC_MAP_TILES || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const MAP_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || "© OpenStreetMap contributors";

/** Default map centre before any pins load, as "lat,lng". */
export const MAP_CENTER = (() => {
  const [lat, lng] = (process.env.NEXT_PUBLIC_MAP_CENTER || "30.2672,-97.7431").split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : { lat: 30.2672, lng: -97.7431 };
})();
