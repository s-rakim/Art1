import Link from "next/link";
import { GuestFrame } from "@/components/guest-frame";

export default function NotFound() {
  return (
    <GuestFrame>
      <h1 className="heading text-[20px]">Page not found</h1>
      <p className="mt-2 text-maxcontrast">The page moved, the product sold out, or it never existed.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/" className="btn btn-primary">Back to the shop</Link>
        <Link href="/search" className="btn">Search</Link>
      </div>
    </GuestFrame>
  );
}
