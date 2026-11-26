"use client";
import { useRouter } from "next/navigation";
import { useLiveReload, type AppEventType } from "@/lib/live";

/**
 * Drop-in for server-rendered pages: re-renders the page when one of the given account events
 * arrives over the live socket, and every so often as a fallback. Shows a small live dot.
 */
export function LiveRefresh({ kinds, pollMs = 30000, label = true }: { kinds: AppEventType[]; pollMs?: number; label?: boolean }) {
  const router = useRouter();
  const live = useLiveReload(kinds, () => router.refresh(), pollMs);
  return label ? <LiveDot live={live} /> : null;
}

export function LiveDot({ live }: { live: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-maxcontrast" role="status">
      <span className={`inline-block h-2 w-2 rounded-full ${live ? "bg-element-success" : "bg-border-dark"}`} aria-hidden />
      {live ? "Live" : "Auto-refreshing"}
    </span>
  );
}
