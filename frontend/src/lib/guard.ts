import "server-only";
import { notFound, redirect } from "next/navigation";
import { AUTH_ENABLED, DEMO_DATA } from "./config";
import { serverSupabase } from "./supabase/server";

export type Guarded = { demo: boolean; email: string | null; roles: string[] };

/**
 * Server-side gate for private sections. Without Supabase configured the app runs in demo
 * mode and these pages show sample data only (the API still rejects unauthenticated writes).
 * With Supabase on, the user is verified against Supabase on every request.
 */
export async function requireUser(nextPath: string, role?: "seller" | "admin" | "rider"): Promise<Guarded> {
  if (!AUTH_ENABLED) {
    // Demo mode only when demo data is on. A production build without Supabase keys
    // hides the private areas entirely instead of showing sample screens.
    if (!DEMO_DATA) notFound();
    return { demo: true, email: null, roles: [] };
  }
  const sb = await serverSupabase();
  const { data } = await sb!.auth.getUser();
  if (!data.user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const roles = (data.user.app_metadata?.roles as string[] | undefined) ?? [];
  if (role === "admin" && !roles.includes("admin")) notFound();
  if (role === "seller" && !roles.includes("seller") && !roles.includes("admin")) redirect("/sell/apply");
  if (role === "rider" && !roles.includes("rider")) redirect("/rider/apply");
  return { demo: false, email: data.user.email ?? null, roles };
}

/** Access token for server-side API calls, after requireUser has verified the user. */
export async function serverToken(): Promise<string | null> {
  if (!AUTH_ENABLED) return null;
  const sb = await serverSupabase();
  const { data } = await sb!.auth.getSession();
  return data.session?.access_token ?? null;
}
