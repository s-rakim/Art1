"use client";

import { useState } from "react";
import type { ProductArt as Art } from "@/lib/types";
import { safeImageUrl } from "@/lib/safe";
import { ProductArt } from "./product-art";

/**
 * A listing's photo, or the drawn placeholder when there is none. If the photo fails to load
 * (deleted from storage, blocked host, flaky network) the placeholder takes its place instead
 * of a broken-image icon.
 */
export function ProductImage({
  src, art, alt, className,
}: { src?: string | null; art?: Art; alt: string; className?: string }) {
  const url = safeImageUrl(src);
  const [failed, setFailed] = useState<string | null>(null);
  if (url && failed !== url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(url)} className={`h-full w-full object-cover ${className ?? ""}`} />;
  }
  return <ProductArt art={art} label={alt} className={`h-full w-full ${className ?? ""}`} />;
}
