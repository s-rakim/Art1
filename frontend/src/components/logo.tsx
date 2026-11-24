import Link from "next/link";
import { STORE_NAME } from "@/lib/config";

export function Logo({ invert = false }: { invert?: boolean }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-2" aria-label={`${STORE_NAME} home`}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
        <rect width="28" height="28" fill={invert ? "#f4f0e6" : "#16130f"} />
        <path d="M4 11h20l-2-5H6z" fill="#d23a1f" />
        <path d="M4 11h5v2a2.5 2.5 0 0 1-5 0zM9 11h5v2a2.5 2.5 0 0 1-5 0zM14 11h5v2a2.5 2.5 0 0 1-5 0zM19 11h5v2a2.5 2.5 0 0 1-5 0z" fill={invert ? "#16130f" : "#f4f0e6"} />
        <rect x="11" y="17" width="6" height="7" fill={invert ? "#16130f" : "#f4f0e6"} />
      </svg>
      <span className={`display text-[26px] ${invert ? "text-paper" : "text-ink"}`}>{STORE_NAME}</span>
    </Link>
  );
}
