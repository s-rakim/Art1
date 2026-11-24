"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function CancelOrder({ orderId }: { orderId: string }) {
  const { token } = useAuth();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!asking) {
    return <button type="button" className="btn btn-line w-full" onClick={() => setAsking(true)}>Cancel order</button>;
  }
  return (
    <div className="border border-ink p-3 text-[14px]">
      <p className="mb-3">Cancel the whole order? Stores that already shipped can&apos;t take it back, so this only works before dispatch.</p>
      {error && <p role="alert" className="mb-2 text-signal">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          className="btn btn-signal btn-sm flex-1"
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api.cancelOrder(token, orderId);
              router.refresh();
              setAsking(false);
            } catch (e) {
              setError(e instanceof ApiError ? e.message : "Couldn't cancel right now. Try again in a minute.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Cancelling…" : "Yes, cancel"}
        </button>
        <button type="button" className="btn btn-line btn-sm flex-1" onClick={() => setAsking(false)}>Keep it</button>
      </div>
    </div>
  );
}
