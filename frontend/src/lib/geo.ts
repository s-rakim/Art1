import { ROUTING_URL } from "./config";
import type { LatLng } from "./types";

/** Straight-line distance in kilometres. */
export function km(a: LatLng, b: LatLng) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const okPoint = (p: unknown): p is [number, number] =>
  Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0] as number) <= 180 && Math.abs(p[1] as number) <= 90;

/**
 * The road route through `stops` in order, from an OSRM-compatible server (NEXT_PUBLIC_ROUTING_URL).
 * Returns null when no server is set or it can't answer, and the caller draws straight legs.
 */
export async function roadPath(stops: LatLng[], signal?: AbortSignal): Promise<LatLng[] | null> {
  if (!ROUTING_URL || stops.length < 2) return null;
  const coords = stops.slice(0, 25).map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  try {
    const res = await fetch(`${ROUTING_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson`, {
      signal: signal && "any" in AbortSignal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : (signal ?? AbortSignal.timeout(8000)),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { routes?: Array<{ geometry?: { coordinates?: unknown[] } }> };
    const line = body.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(line) || line.length < 2 || line.length > 20000 || !line.every(okPoint)) return null;
    return (line as [number, number][]).map(([lng, lat]) => ({ lat, lng }));
  } catch {
    return null;
  }
}
