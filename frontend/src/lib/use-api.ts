"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth";

/** Loads an authenticated API resource once the session is known. */
export function useApi<T>(load: (token: string | null) => Promise<T>, deps: unknown[] = []) {
  const { token, ready } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    load(token)
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "Something went wrong"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ready, tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, setData, error, reload, token };
}
