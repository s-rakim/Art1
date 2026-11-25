/**
 * Everything here is public by design: these values ship inside the app
 * bundle, so nothing secret may ever be added. The Supabase anon key is a
 * public key; row level security and the API's own role checks protect data.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    // Fail loudly in development; a release build without these is useless anyway.
    console.warn(`[config] ${name} is not set. Copy .env.example to .env and fill it in.`);
    return '';
  }
  return value;
}

// Each variable is read as process.env.EXPO_PUBLIC_NAME in full: Expo inlines
// them at build time only when written out like this.
const apiUrl = required('EXPO_PUBLIC_API_URL', process.env.EXPO_PUBLIC_API_URL).replace(/\/+$/, '');

// Release builds talk to the API over https only. Plain http is allowed for a
// server on this machine (local testing) and nothing else.
if (!__DEV__ && apiUrl && !apiUrl.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(apiUrl)) {
  throw new Error('EXPO_PUBLIC_API_URL must use https in release builds.');
}

export const config = {
  appName: 'The Bazaar',
  /** e.g. https://shop.example.com (the API lives under /api/v1 on the same domain). */
  apiUrl,
  supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  /** Raster tile template. OSM's own servers are fine for testing, not for a busy fleet. */
  mapTiles: process.env.EXPO_PUBLIC_MAP_TILES || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  mapAttribution: process.env.EXPO_PUBLIC_MAP_ATTRIBUTION || '© OpenStreetMap contributors',
  /** Optional OSRM-compatible router for road-following lines. Without it the map draws straight legs. */
  routingUrl: (process.env.EXPO_PUBLIC_ROUTING_URL || '').replace(/\/+$/, ''),
  /**
   * Comma separated base64 SHA-256 SPKI hashes for the API host. Two at least
   * (current key and a backup), or pinning stays off. See README.
   */
  apiPins: (process.env.EXPO_PUBLIC_API_PINS || '').split(',').map((s: string) => s.trim()).filter(Boolean),
} as const;

export const apiHost = (() => {
  try {
    return new URL(config.apiUrl).host;
  } catch {
    return '';
  }
})();
