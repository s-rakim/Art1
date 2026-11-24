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
    return <button type="button" className="btn btn-secondary w-full" onClick={() => setAsking(true)}>Cancel order</button>;
  }
  return (
    <div className="card p-3 text-[14px]">
      <p className="mb-3">Cancel the whole order? Stores that already shipped can&apos;t take it back, so this only works before dispatch.</p>
      {error && <p role="alert" className="note note-error mb-2"><span>{error}</span></p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          className="btn btn-error btn-sm flex-1"
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
        <button type="button" className="btn btn-secondary btn-sm flex-1" onClick={() => setAsking(false)}>Keep it</button>
      </div>
    </div>
  );
}
