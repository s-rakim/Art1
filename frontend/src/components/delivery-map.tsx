"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MLMap, Marker } from "maplibre-gl";
import { MAP_ATTRIBUTION, MAP_CENTER, MAP_TILES } from "@/lib/config";
import type { LatLng } from "@/lib/types";

export type MapPin = LatLng & { id: string; kind: "rider" | "pickup" | "dropoff"; label: string };
export type MapLine = { id: string; from: LatLng; to: LatLng; done?: boolean };

const kindStyle: Record<MapPin["kind"], { bg: string; fg: string; glyph: string }> = {
  rider: { bg: "#d23a1f", fg: "#ffffff", glyph: "R" },
  pickup: { bg: "#16130f", fg: "#f4f0e6", glyph: "P" },
  dropoff: { bg: "#1e4d3b", fg: "#ffffff", glyph: "D" },
};

function pinElement(pin: MapPin) {
  const s = kindStyle[pin.kind];
  const el = document.createElement("div");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", `${pin.kind}: ${pin.label}`);
  el.title = pin.label; // textual, never HTML
  Object.assign(el.style, {
    width: pin.kind === "rider" ? "30px" : "24px",
    height: pin.kind === "rider" ? "30px" : "24px",
    background: s.bg,
    color: s.fg,
    border: "2px solid #f4f0e6",
    boxShadow: "2px 2px 0 #16130f",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    font: "600 12px 'IBM Plex Mono', monospace",
    transition: "transform 900ms linear",
  });
  el.textContent = s.glyph;
  return el;
}

/**
 * Delivery map on OpenStreetMap raster tiles (no API key). Pins and route lines are
 * replaced whenever props change, so callers can poll and pass fresh positions.
 */
export function DeliveryMap({ pins, lines = [], className = "h-[360px]", follow }: { pins: MapPin[]; lines?: MapLine[]; className?: string; follow?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ml = await import("maplibre-gl");
        ml.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
        if (cancelled || !box.current) return;
        const first = pins[0] ?? MAP_CENTER;
        map.current = new ml.Map({
          container: box.current,
          center: [first.lng, first.lat],
          zoom: 12,
          attributionControl: { compact: true },
          style: {
            version: 8,
            sources: { osm: { type: "raster", tiles: [MAP_TILES], tileSize: 256, maxzoom: 19, attribution: MAP_ATTRIBUTION } },
            layers: [
              { id: "paper", type: "background", paint: { "background-color": "#ebe5d7" } },
              { id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.75, "raster-contrast": -0.05, "raster-opacity": 0.9 } },
            ],
          },
        });
        map.current.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        map.current.on("load", () => !cancelled && setReady(true));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      markers.current.forEach((m) => m.remove());
      markers.current.clear();
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    let cancelled = false;
    (async () => {
      const ml = await import("maplibre-gl");
      if (cancelled) return;
      const seen = new Set<string>();
      for (const pin of pins) {
        seen.add(pin.id);
        const existing = markers.current.get(pin.id);
        if (existing) existing.setLngLat([pin.lng, pin.lat]);
        else markers.current.set(pin.id, new ml.Marker({ element: pinElement(pin) }).setLngLat([pin.lng, pin.lat]).addTo(m));
      }
      for (const [id, mk] of markers.current) {
        if (!seen.has(id)) {
          mk.remove();
          markers.current.delete(id);
        }
      }

      const data = {
        type: "FeatureCollection" as const,
        features: lines.map((l) => ({
          type: "Feature" as const,
          properties: { done: l.done ? 1 : 0 },
          geometry: { type: "LineString" as const, coordinates: [[l.from.lng, l.from.lat], [l.to.lng, l.to.lat]] },
        })),
      };
      const src = m.getSource("routes") as { setData?: (d: typeof data) => void } | undefined;
      if (src?.setData) src.setData(data);
      else {
        m.addSource("routes", { type: "geojson", data });
        m.addLayer({
          id: "routes",
          type: "line",
          source: "routes",
          paint: { "line-color": ["case", ["==", ["get", "done"], 1], "#1e4d3b", "#16130f"], "line-width": 2.5, "line-dasharray": [2, 1.5] },
        });
      }

      const target = follow ? pins.find((p) => p.id === follow) : null;
      if (target && fitted.current) {
        m.easeTo({ center: [target.lng, target.lat], duration: 800 });
      } else if (pins.length && !fitted.current) {
        const b = new ml.LngLatBounds();
        pins.forEach((p) => b.extend([p.lng, p.lat]));
        m.fitBounds(b, { padding: 60, maxZoom: 15, duration: 0 });
        fitted.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pins, lines, ready, follow]);

  return (
    <div className={`relative overflow-hidden border border-ink bg-paper-2 ${className}`}>
      {/* Inline size: maplibre-gl.css is unlayered and would override a Tailwind utility here. */}
      <div ref={box} style={{ position: "absolute", inset: 0 }} />
      {failed && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-[13px] text-ink-2">The map couldn&apos;t load in this browser. Delivery status is still shown alongside.</p>}
      <ul className="pointer-events-none absolute bottom-2 left-2 flex gap-1 font-mono text-[10px]">
        {(["rider", "pickup", "dropoff"] as const).map((k) => (
          <li key={k} className="flex items-center gap-1 bg-paper/90 px-1.5 py-0.5">
            <span className="inline-block h-2.5 w-2.5" style={{ background: kindStyle[k].bg }} />
            {k === "rider" ? "Rider" : k === "pickup" ? "Store" : "Drop-off"}
          </li>
        ))}
      </ul>
    </div>
  );
}
