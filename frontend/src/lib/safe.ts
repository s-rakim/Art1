// Small guards for values that come from sellers or the URL and end up in markup.

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Only #rrggbb gets into inline styles; anything else falls back. Blocks CSS injection via store colours. */
export function safeColor(value: unknown, fallback = "#222222"): string {
  return typeof value === "string" && HEX.test(value) ? value : fallback;
}

/** Only https (or same-origin relative) image URLs are rendered. */
export function safeImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Post-login redirect target. Only local paths, never protocol-relative or absolute URLs. */
export function safeNext(value: unknown, fallback = "/account"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\r\n\t]/.test(value)) return fallback;
  return value;
}

/** Route params are user-controlled; keep slugs to a boring alphabet before they hit the API. */
export function safeSlug(value: string): string | null {
  return /^[a-z0-9][a-z0-9-]{0,120}$/.test(value) ? value : null;
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "string" ? parseInt(value, 10) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
