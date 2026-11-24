"use client";

// Generic on purpose: no stack traces or server messages reach the browser.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <p className="label mb-3">Something broke</p>
      <h1 className="display text-[56px] md:text-[80px]">We dropped something.</h1>
      <p className="mt-4 text-ink-2">It&apos;s on our side, not yours. Try again, and if it keeps happening come back in a few minutes.</p>
      <button onClick={reset} className="btn btn-ink mt-8">Try again</button>
    </div>
  );
}
