"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase/client";
import { AUTH_ENABLED } from "./config";

export type AuthState = {
  ready: boolean;
  session: Session | null;
  token: string | null;
  email: string | null;
  // Roles come from Supabase app_metadata, set by the backend (never by the client).
  roles: string[];
};

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ ready: !AUTH_ENABLED, session: null, token: null, email: null, roles: [] });

  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    const apply = (session: Session | null) =>
      setState({
        ready: true,
        session,
        token: session?.access_token ?? null,
        email: session?.user.email ?? null,
        roles: ((session?.user.app_metadata?.roles as string[] | undefined) ?? []).map((r) => (r === "seller" ? "vendor" : r)),
      });
    sb.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, session) => apply(session));
    return () => data.subscription.unsubscribe();
  }, []);

  return state;
}
