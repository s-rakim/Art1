"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { hexToRgb, ShaderBackground } from "@/components/ui/poba-shade";

// The moving blue waves behind every page. The Nextcloud wallpaper image stays underneath as
// the fallback: it shows until the first frame is drawn, and for good if WebGL isn't there.
// While the shader runs, <html data-shader="on"> tells the CSS to swap backdrop blur (costly
// over a moving picture) for a nearly opaque surface.

const LIGHT = ["#063a5c", "#00679e", "#1a7fb5", "#3b95c6", "#00679e", "#00598a"].map(hexToRgb);
const DARK = ["#021725", "#06304b", "#0a4468", "#0d567f", "#06304b", "#04263c"].map(hexToRgb);

function media(query: string) {
  return (listener: () => void) => {
    const m = window.matchMedia(query);
    m.addEventListener("change", listener);
    return () => m.removeEventListener("change", listener);
  };
}
const useMedia = (query: string, server: boolean) =>
  useSyncExternalStore(media(query), () => window.matchMedia(query).matches, () => server);

export function SiteBackground() {
  const reduced = useMedia("(prefers-reduced-motion: reduce)", true);
  const dark = useMedia("(prefers-color-scheme: dark)", false);
  const coarse = useMedia("(pointer: coarse)", true);
  const saveData = useSyncExternalStore(
    () => () => {},
    () => Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData),
    () => false,
  );
  const [status, setStatus] = useState<"idle" | "running" | "failed">("idle");

  useEffect(() => {
    const root = document.documentElement;
    if (status === "running") root.dataset.shader = "on";
    else delete root.dataset.shader;
    return () => {
      delete root.dataset.shader;
    };
  }, [status]);

  if (status === "failed") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-[1]">
      <ShaderBackground
        colors={dark ? DARK : LIGHT}
        // Reduced motion or data saver: one still frame of the same waves, then nothing runs.
        still={reduced || saveData}
        cursor={!coarse}
        // Phones and tablets: no blur taps, fewer pixels, fewer frames. The waves are soft
        // enough that a quarter-resolution canvas scaled up looks the same.
        lite={coarse}
        maxPixels={coarse ? 260_000 : 900_000}
        maxFps={coarse ? 30 : 45}
        onStatus={setStatus}
        className={`transition-opacity duration-700 ease-out ${status === "running" ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
