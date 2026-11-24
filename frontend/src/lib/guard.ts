import "server-only";
import { notFound, redirect } from "next/navigation";
import { api } from "./api";
import { AUTH_ENABLED, DEMO_DATA } from "./config";
import { serverSupabase } from "./supabase/server";

export type Guarded = { demo: boolean; email: string | null; roles: string[] };
type Gate = "vendor" | "admin" | "rider";

// The API stores a vendor as "seller" in its profiles table and mirrors it into
// app_metadata as "vendor". Treat both spellings as the same role.
const norm = (r: string) => (r === "seller" ? "vendor" : r);

function allowed(roles: string[], gate: Gate) {
  if (gate === "vendor") return roles.includes("vendor") || roles.includes("admin");
  return roles.includes(gate);
}

/**
 * Server-side gate for private sections. Without Supabase configured the app runs in demo
 * mode and these pages show sample data only (the API still rejects unauthenticated writes).
 * With Supabase on, the user is verified against Supabase on every request.
 *
 * Roles come from app_metadata, which only the backend can write. If the role we need
 * isn't there yet (the mirror can lag a moment after approval), we ask the API, which
 * reads its own profiles table and is the real authority.
 */
export async function requireUser(nextPath: string, gate?: Gate): Promise<Guarded> {
  if (!AUTH_ENABLED) {
    // Demo mode only when demo data is on. A production build without Supabase keys
    // hides the private areas entirely instead of showing sample screens.
    if (!DEMO_DATA) notFound();
    return { demo: true, email: null, roles: [] };
  }
  const sb = await serverSupabase();
  const { data } = await sb!.auth.getUser();
  if (!data.user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);

  const meta = data.user.app_metadata ?? {};
  const raw = Array.isArray(meta.roles) ? meta.roles : typeof meta.role === "string" ? [meta.role] : [];
  let roles = raw.filter((r): r is string => typeof r === "string").map(norm);

  if (gate && !allowed(roles, gate)) {
    const token = await serverToken();
    const fresh = token ? await api.role(token).catch(() => null) : null;
    if (fresh) roles = Array.from(new Set([...roles, norm(fresh)]));
  }

  if (gate === "admin" && !allowed(roles, "admin")) notFound();
  if (gate === "vendor" && !allowed(roles, "vendor")) redirect("/sell/apply");
  if (gate === "rider" && !allowed(roles, "rider")) redirect("/rider/apply");
  return { demo: false, email: data.user.email ?? null, roles };
}

/** Access token for server-side API calls, after requireUser has verified the user. */
export async function serverToken(): Promise<string | null> {
  if (!AUTH_ENABLED) return null;
  const sb = await serverSupabase();
  const { data } = await sb!.auth.getSession();
  return data.session?.access_token ?? null;
}
