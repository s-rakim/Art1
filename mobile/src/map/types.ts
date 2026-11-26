import { config } from '@/lib/config';
import { pin } from '@/theme';

export type PinTone = 'pending' | 'active' | 'done' | 'blocked' | 'shop' | 'rider';
export type MapPin = { id: string; lat: number; lng: number; tone: PinTone; label?: string; order?: number };

export type RouteMapProps = {
  pins: MapPin[];
  /** [lng, lat] pairs, in the order to travel. */
  line?: [number, number][];
  me?: { lat: number; lng: number; heading?: number | null } | null;
  onPinPress?: (id: string) => void;
  height?: number;
  /** Re-fit the camera when this changes (for example when a job is taken). */
  fitKey?: string;
};

export const toneColor: Record<PinTone, string> = {
  pending: pin.pending,
  active: pin.active,
  done: pin.done,
  blocked: pin.blocked,
  shop: pin.shop,
  rider: pin.rider,
};

export const toneLabel: Record<PinTone, string> = {
  pending: 'waiting',
  active: 'taken',
  done: 'delivered',
  blocked: 'not available on this run',
  shop: 'shop',
  rider: 'you',
};

/** OpenStreetMap raster style; each map casts it to its own library's style type. */
export const mapStyle = {
  version: 8 as const,
  sources: {
    osm: { type: 'raster' as const, tiles: [config.mapTiles], tileSize: 256, attribution: config.mapAttribution, maxzoom: 19 },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};

/** [west, south, east, north] around every point, padded a little. */
export function boundsOf(points: { lat: number; lng: number }[]): [number, number, number, number] | null {
  if (!points.length) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of points) {
    w = Math.min(w, p.lng); e = Math.max(e, p.lng);
    s = Math.min(s, p.lat); n = Math.max(n, p.lat);
  }
  const pad = 0.004;
  return [w - pad, s - pad, e + pad, n + pad];
}

export const NAIROBI = { lat: -1.2864, lng: 36.8172 };
