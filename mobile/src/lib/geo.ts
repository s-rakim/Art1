import { config } from './config';

export type Pt = { lat: number; lng: number };

export function distanceKm(a: Pt, b: Pt): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * The line to draw through the stops. With a routing server configured it
 * follows roads (OSRM /route API); otherwise straight legs, which still show
 * the order of stops. Turn by turn is handed to Google or Apple Maps.
 */
export async function routeLine(points: Pt[]): Promise<[number, number][]> {
  const straight = points.map((p) => [p.lng, p.lat] as [number, number]);
  if (!config.routingUrl || points.length < 2) return straight;
  try {
    const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const res = await fetch(`${config.routingUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson`);
    const json = await res.json();
    const line = json?.routes?.[0]?.geometry?.coordinates;
    return Array.isArray(line) && line.length > 1 ? line : straight;
  } catch {
    return straight;
  }
}

/** Google Maps directions through every stop, which opens the Maps app on both platforms. */
export function directionsUrl(stops: Pt[], origin?: Pt | null): string {
  if (!stops.length) return '';
  const fmt = (p: Pt) => `${p.lat},${p.lng}`;
  const dest = stops[stops.length - 1];
  const via = stops.slice(0, -1).map(fmt).join('|');
  const params = new URLSearchParams({ api: '1', destination: fmt(dest), travelmode: 'driving' });
  if (origin) params.set('origin', fmt(origin));
  if (via) params.set('waypoints', via);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
