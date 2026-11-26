"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const part = (h: number) => (h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");

/** First word of a name, tidied up, and only if it looks like a name. */
function firstName(full: unknown): string | null {
  if (typeof full !== "string") return null;
  const first = full.trim().split(/\s+/)[0]?.slice(0, 40) ?? "";
  if (!first || /[<>@/\\]/.test(first)) return null;
  return first.charAt(0).toLocaleUpperCase() + first.slice(1);
}

/**
 * "Good morning, Malcolm", as on Nextcloud's dashboard: the visitor's own clock picks the part
 * of the day and the greeting moves on by itself as the day goes. Signed-in people get their
 * first name; guests just get the greeting.
 */
// The clock is checked once a minute; the server has no idea what time it is for the visitor.
const everyMinute = (tick: () => void) => {
  const t = setInterval(tick, 60_000);
  return () => clearInterval(t);
};

export function Greeting({ fallback }: { fallback: string }) {
  const { session, token } = useAuth();
  const hour = useSyncExternalStore(everyMinute, () => new Date().getHours(), () => null);
  // The name from sign-up rides along in the session; only older accounts need a trip to /me.
  const fromSession = firstName(session?.user.user_metadata?.full_name) ?? firstName(session?.user.user_metadata?.name);
  const [fetched, setFetched] = useState<{ token: string; name: string | null } | null>(null);
  const name = fromSession ?? (token && fetched?.token === token ? fetched.name : null);

  useEffect(() => {
    if (fromSession || !token) return;
    let alive = true;
    api.me(token).then((m) => alive && setFetched({ token, name: firstName(m.first_name) ?? firstName(m.full_name) })).catch(() => {});
    return () => {
      alive = false;
    };
  }, [fromSession, token]);

  if (hour === null) return <>{fallback}</>;
  return <>{name ? `${part(hour)}, ${name}` : part(hour)}</>;
}
