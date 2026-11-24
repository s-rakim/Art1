"use client";
import { useEffect, useState } from "react";

// Counts down to the next midnight UTC, when the deals strip rotates.
export function Countdown() {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      setLeft(Math.max(0, end - now.getTime()));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  const parts = left === null ? ["--", "--", "--"] : [3600000, 60000, 1000].map((d, i) =>
    String(Math.floor((left % (i === 0 ? 86400000 : i === 1 ? 3600000 : 60000)) / d)).padStart(2, "0"));
  return (
    <span className="inline-flex items-center gap-1 text-[14px] font-semibold tabular-nums" aria-label="Time left on today's deals" suppressHydrationWarning>
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="rounded-small bg-error px-1.5 py-0.5 text-error-text tabular-nums">{p}</span>
          {i < 2 && <span>:</span>}
        </span>
      ))}
    </span>
  );
}
