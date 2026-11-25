"use client";
import { useState, useSyncExternalStore } from "react";

const never = () => () => {};

/**
 * False on the server and during hydration, true afterwards. For anything that only the browser
 * knows (the saved bag, the wishlist), so the first client render matches the server's markup.
 */
export function useHydrated() {
  return useSyncExternalStore(never, () => true, () => false);
}

/** A fixed fact about the browser (is there geolocation?), with the server's guess until hydration. */
export function useBrowserFact<T extends string | number | boolean>(read: () => T, server: T) {
  return useSyncExternalStore(never, read, () => server);
}

/**
 * True on the render where `value` differs from the one before. This is React's "adjust state
 * when a prop changes" pattern: the caller sets state right there in render, no effect needed.
 */
export function useChanged<T>(value: T) {
  const [prev, setPrev] = useState(value);
  if (Object.is(prev, value)) return false;
  setPrev(value);
  return true;
}

/** An editable copy of loaded data. It is seeded again whenever a fresh copy of the data arrives. */
export function useDraft<T, D>(data: T | null | undefined, seed: (data: T) => D) {
  const [draft, setDraft] = useState<D | null>(() => (data ? seed(data) : null));
  const fresh = useChanged(data);
  if (fresh && data) setDraft(seed(data));
  return [draft, setDraft] as const;
}
