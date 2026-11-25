import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { api, unwrap, type Schemas } from '@/api/client';
import { supabase } from './supabase';

export type Me = Schemas['Me'];
export type Area = 'customer' | 'vendor' | 'rider' | 'admin' | 'applicant';

/**
 * Which part of the app an account opens. This only picks screens: every
 * call is checked again on the server against the role in its own database,
 * so editing this on a rooted phone gains nothing.
 */
export function areaFor(me: Me | undefined): Area | null {
  if (!me) return null;
  switch (me.role) {
    case 'admin':
      return 'admin';
    case 'seller':
      return 'vendor';
    case 'rider':
      return me.rider_status === 'active' ? 'rider' : 'applicant';
    case 'rider_applicant':
      return 'applicant';
    default:
      return 'customer';
  }
}

type AuthState = {
  session: Session | null;
  ready: boolean;
  me: Me | undefined;
  meLoading: boolean;
  meError: Error | null;
  refetchMe: () => void;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) qc.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  const meQuery = useQuery({
    queryKey: ['me', session?.user.id],
    enabled: !!session,
    queryFn: () => unwrap(api.GET('/api/v1/me')),
    staleTime: 60_000,
  });

  const value: AuthState = {
    session,
    ready,
    me: meQuery.data,
    meLoading: meQuery.isLoading,
    meError: meQuery.error,
    refetchMe: () => void meQuery.refetch(),
    signOut: async () => {
      await supabase.auth.signOut();
      qc.clear();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
