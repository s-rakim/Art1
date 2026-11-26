"use client";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { api, ApiError } from "./api";
import { safeNext } from "./safe";

export type Landing = { go: string } | { blocked: string };

const norm = (r: string) => (r === "seller" ? "vendor" : r);
const VEHICLES = ["on_foot", "bicycle", "motorbike", "car", "van"] as const;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * One login page for everybody. After the password (or emailed link) checks out, the account
 * decides where it goes: admins to the console, vendors to their dashboard (a stall still in
 * review included), hired riders to the rider app, shoppers back to the shop. Rider applicants
 * aren't let in until an admin hires them, so their session is closed again and they get a
 * status message instead.
 */
export async function landingFor(sb: SupabaseClient, session: Session, nextParam: string | null): Promise<Landing> {
  const token = session.access_token;
  const meta = session.user.app_metadata ?? {};
  const metaRoles = (Array.isArray(meta.roles) ? meta.roles : typeof meta.role === "string" ? [meta.role] : [])
    .filter((r): r is string => typeof r === "string")
    .map(norm);
  const requested = session.user.user_metadata?.requested_role;

  let role: string | null = null;
  let riderStatus: string | null | undefined;
  let stall: string | null = null;
  try {
    const me = await api.me(token);
    role = norm(me.role);
    riderStatus = me.rider_status;
    stall = me.store?.status ?? null;
  } catch {
    // The API being down shouldn't lock people out of the shop; fall back to the token's roles.
  }
  if (!role) {
    role = metaRoles.includes("admin") ? "admin" : metaRoles.includes("vendor") ? "vendor" : metaRoles.includes("rider") ? "rider" : "customer";
  }

  const applicant = role === "rider_applicant" || (requested === "rider" && role === "customer" && !metaRoles.includes("rider"));
  if (applicant) {
    const status = await ensureApplication(token, session.user.user_metadata?.rider_application, riderStatus);
    await sb.auth.signOut();
    return { blocked: blockedMessage(status) };
  }

  if (role === "admin") return { go: "/admin" };
  if (role === "vendor") return { go: nextParam && /^\/(seller|sell)(\/|$|\?)/.test(nextParam) ? safeNext(nextParam, "/seller") : "/seller" };
  if (role === "rider") return { go: "/rider" };
  // Someone who signed up to sell: straight to the form if they haven't applied, or to their
  // dashboard while the stall waits for review.
  if (stall === "pending") return { go: "/seller" };
  if (requested === "vendor" && !stall && !nextParam) return { go: "/sell/apply" };
  const next = nextParam ? safeNext(nextParam, "/") : "/";
  // Shoppers never land in someone else's area just because an old link said so.
  return { go: /^\/(seller|admin|rider)(\/|$|\?)/.test(next) ? "/" : next };
}

/** Makes sure a rider who signed up before confirming their email has an application on file. */
async function ensureApplication(token: string, saved: unknown, known: string | null | undefined): Promise<string | null> {
  if (known) return known;
  try {
    return (await api.riderStatus(token)).status;
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) return "applicant";
  }
  const a = (saved ?? {}) as Record<string, unknown>;
  const body = {
    full_name: text(a.full_name, 120),
    phone: text(a.phone, 32),
    city: text(a.city, 120),
    vehicle: VEHICLES.find((v) => v === a.vehicle) ?? "bicycle",
    licence_number: text(a.licence_number, 40) || null,
  };
  if (!body.full_name || !body.phone || !body.city) return null;
  try {
    return (await api.applyRider(token, body)).status;
  } catch {
    return null;
  }
}

function blockedMessage(status: string | null): string {
  if (status === "rejected") return "Your rider application wasn't approved this time. Reply to the email from the market team if you'd like them to look again.";
  if (status === "suspended" || status === "inactive") return "Your rider account is paused. Contact the market team to get back on the road.";
  if (!status) return "We couldn't find your rider application. Fill in the hiring form again and we'll take it from there.";
  return "Thanks for applying to ride. The market team is reviewing your application, and you'll be able to log in as soon as you're hired.";
}
