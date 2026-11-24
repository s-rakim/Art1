"use client";
import { GuestFrame } from "@/components/guest-frame";

// Generic on purpose: no stack traces or server messages reach the browser.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <GuestFrame>
      <h1 className="heading text-[20px]">Something went wrong</h1>
      <p className="mt-2 text-maxcontrast">It&apos;s on our side, not yours. Try again, and if it keeps happening come back in a few minutes.</p>
      <button onClick={reset} className="btn btn-primary mt-6">Try again</button>
    </GuestFrame>
  );
}
