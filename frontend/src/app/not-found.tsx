import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <p className="label mb-3">404</p>
      <h1 className="display text-[64px] md:text-[96px]">This stall is empty.</h1>
      <p className="mt-4 text-ink-2">The page moved, sold out, or never existed.</p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/" className="btn btn-ink">Back to the market</Link>
        <Link href="/search" className="btn btn-line">Search</Link>
      </div>
    </div>
  );
}
