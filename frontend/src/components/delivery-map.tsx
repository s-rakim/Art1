"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MLMap, Marker, StyleSpecification } from "maplibre-gl";
import { MAP_ATTRIBUTION, MAP_CENTER, MAP_STYLE, MAP_STYLE_DARK, MAP_TILES } from "@/lib/config";
import type { LatLng } from "@/lib/types";

export type MapPin = LatLng & {
  id: string;
  kind: "rider" | "idle" | "pickup" | "dropoff";
  label: string;
  /** Degrees clockwise from north. When missing, riders face the way they last moved. */
  heading?: number | null;
  /** Lets the user drag this pin; the new spot is reported through onPick. */
  draggable?: boolean;
  /** Rider jobs: yellow waiting to be taken, red on the current run, green delivered. */
  tone?: "open" | "live" | "done";
  /** Faded and blurred: out of reach right now. */
  dim?: boolean;
};
/** A straight leg, or a whole route through `path` (drawn in order). */
export type MapLine = { id: string; from: LatLng; to: LatLng; done?: boolean; path?: LatLng[] };

// Material Design Icons paths (Apache 2.0), drawn inside the markers.
const GLYPH = {
  rider: "M19 15C19.55 15 20 15.45 20 16C20 16.55 19.55 17 19 17S18 16.55 18 16C18 15.45 18.45 15 19 15M19 13C17.34 13 16 14.34 16 16S17.34 19 19 19 22 17.66 22 16 20.66 13 19 13M10 6H5V8H10V6M17 5H14V7H17V9.65L13.5 14H10V9H6C3.79 9 2 10.79 2 13V16H4C4 17.66 5.34 19 7 19S10 17.66 10 16H14.5L19 10.35V7C19 5.9 18.11 5 17 5M7 17C6.45 17 6 16.55 6 16H8C8 16.55 7.55 17 7 17Z",
  pickup: "M12,18H6V14H12M21,14V12L20,7H4L3,12V14H4V20H14V14H18V20H20V14M20,4H4V6H20V4Z",
  dropoff: "M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z",
};
const LEGEND: Record<MapPin["kind"], string> = { rider: "Rider on a job", idle: "Free rider", pickup: "Shop", dropoff: "Drop-off" };
const TONE: Record<NonNullable<MapPin["tone"]>, string> = { open: "Waiting", live: "On your run", done: "Delivered" };

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const darkMode = () => {
  if (typeof document === "undefined") return false;
  const forced = document.documentElement.dataset.theme;
  if (forced) return forced === "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
};

function rasterStyle(): StyleSpecification {
  return {
    version: 8,
    sources: { osm: { type: "raster", tiles: [MAP_TILES], tileSize: 256, maxzoom: 19, attribution: MAP_ATTRIBUTION } },
    layers: [
      { id: "paper", type: "background", paint: { "background-color": "#eef1f4" } },
      { id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.6, "raster-opacity": 0.95 } },
    ],
  };
}

function svg(path: string, size: number) {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", String(size));
  s.setAttribute("height", String(size));
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", path);
  p.setAttribute("fill", "currentColor");
  s.appendChild(p);
  return s;
}

/** Builds a marker with DOM calls only. Labels go in as text, never as HTML. */
function pinLabel(pin: MapPin) {
  return `${pin.tone ? TONE[pin.tone] : LEGEND[pin.kind]}: ${pin.label}`;
}

function pinElement(pin: MapPin, clickable: boolean) {
  const el = document.createElement("div");
  el.className = `map-pin map-pin-${pin.kind}`;
  el.setAttribute("role", clickable ? "button" : "img");
  if (clickable) el.tabIndex = 0;
  el.setAttribute("aria-label", pinLabel(pin));
  el.title = pin.label;
  if (pin.kind === "rider" || pin.kind === "idle") {
    if (pin.kind === "rider") {
      const ring = document.createElement("span");
      ring.className = "map-pin-pulse";
      el.appendChild(ring);
    }
    const arrow = document.createElement("span");
    arrow.className = "map-pin-heading";
    el.appendChild(arrow);
    const face = document.createElement("span");
    face.className = "map-pin-face";
    face.appendChild(svg(GLYPH.rider, 18));
    el.appendChild(face);
  } else {
    const face = document.createElement("span");
    face.className = "map-pin-face";
    face.appendChild(svg(pin.kind === "pickup" ? GLYPH.pickup : GLYPH.dropoff, 16));
    el.appendChild(face);
  }
  return el;
}

function bearing(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180;
  const y = Math.sin((b[0] - a[0]) * r) * Math.cos(b[1] * r);
  const x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos((b[0] - a[0]) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

/** Rough metres between two points; good enough to decide whether to glide or jump. */
function metres(a: [number, number], b: [number, number]) {
  const k = 111320;
  const dx = (b[0] - a[0]) * k * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dy = (b[1] - a[1]) * k;
  return Math.hypot(dx, dy);
}

// Frames for the "marching" dashes on route lines, from the MapLibre examples.
const DASHES = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
];

type Glide = { from: [number, number]; to: [number, number]; start: number; dur: number };
type Entry = { marker: Marker; kind: MapPin["kind"]; el: HTMLElement; pos: [number, number]; glide?: Glide; heading: number | null };

/**
 * Live delivery map on a current OpenStreetMap vector basemap. Riders glide between position
 * updates instead of jumping, turn to face where they're heading and leave a short trail, and
 * route lines march toward the next stop. Callers just pass fresh pins; the map animates the rest.
 */
export function DeliveryMap({
  pins,
  lines = [],
  className = "h-[360px]",
  follow,
  onPick,
  onPinClick,
  trails = true,
}: {
  pins: MapPin[];
  lines?: MapLine[];
  className?: string;
  follow?: string;
  /** When set, clicking the map (or dragging a draggable pin) reports the spot. */
  onPick?: (p: LatLng) => void;
  /** Makes pins with a tone into buttons (click, Enter or Space), reporting the pin id. */
  onPinClick?: (id: string) => void;
  trails?: boolean;
}) {
  const pickRef = useRef(onPick);
  const pinClickRef = useRef(onPinClick);
  useEffect(() => {
    pickRef.current = onPick;
    pinClickRef.current = onPinClick;
  });
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const entries = useRef<Map<string, Entry>>(new Map());
  const history = useRef<Map<string, Array<[number, number]>>>(new Map());
  const fitted = useRef(false);
  const frame = useRef<number | null>(null);
  const dashStep = useRef(-1);
  const hasLines = useRef(false);
  const [styleTick, setStyleTick] = useState(0);
  const [failed, setFailed] = useState(false);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ml = await import("maplibre-gl");
        ml.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
        if (cancelled || !box.current) return;
        const first = pins[0] ?? MAP_CENTER;
        // Try the themed vector style, then the light one, then plain raster tiles.
        const chain: Array<string | StyleSpecification> =
          MAP_STYLE === "raster" ? [rasterStyle()] : [...new Set([darkMode() ? MAP_STYLE_DARK : MAP_STYLE, MAP_STYLE])];
        if (MAP_STYLE !== "raster") chain.push(rasterStyle());
        let at = 0;
        let loaded = false;
        const m = new ml.Map({
          container: box.current,
          center: [first.lng, first.lat],
          zoom: 13,
          maxPitch: 60,
          attributionControl: { compact: true },
          style: chain[0],
          fadeDuration: 200,
        });
        map.current = m;
        m.addControl(new ml.NavigationControl({ visualizePitch: true }), "top-right");
        m.addControl(new ml.FullscreenControl(), "top-right");
        const next = () => {
          if (cancelled || loaded || at >= chain.length - 1) return;
          at += 1;
          m.setStyle(chain[at]);
          clearTimeout(slow);
          slow = setTimeout(next, 8000);
        };
        let slow = setTimeout(next, 8000);
        m.on("style.load", () => {
          if (cancelled) return;
          loaded = true;
          clearTimeout(slow);
          setStyleTick((n) => n + 1);
        });
        // Nothing but the style itself is fetched before the first style.load, so an error
        // here means the style host is unreachable or broken: move down the chain.
        m.on("error", () => next());
        m.on("click", (e) => pickRef.current?.({ lat: Math.round(e.lngLat.lat * 1e6) / 1e6, lng: Math.round(e.lngLat.lng * 1e6) / 1e6 }));
        m.once("remove", () => clearTimeout(slow));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    const all = entries.current;
    return () => {
      cancelled = true;
      if (frame.current) cancelAnimationFrame(frame.current);
      all.forEach((e) => e.marker.remove());
      all.clear();
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One animation loop drives marker glides and the marching route dashes.
  function animate() {
    if (frame.current) return;
    const tick = (now: number) => {
      frame.current = null;
      let moving = false;
      for (const e of entries.current.values()) {
        const g = e.glide;
        if (!g) continue;
        const t = Math.min(1, (now - g.start) / g.dur);
        const k = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease in-out
        e.pos = [g.from[0] + (g.to[0] - g.from[0]) * k, g.from[1] + (g.to[1] - g.from[1]) * k];
        e.marker.setLngLat(e.pos);
        if (t >= 1) e.glide = undefined;
        else moving = true;
      }
      const m = map.current;
      const dashes = !!m?.getLayer("bz-routes") && hasLines.current && !reduceMotion() && document.visibilityState === "visible";
      if (m && dashes) {
        const step = Math.floor(now / 60) % DASHES.length;
        if (step !== dashStep.current) {
          dashStep.current = step;
          m.setPaintProperty("bz-routes", "line-dasharray", DASHES[step]);
        }
      }
      if (moving || dashes) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }

  // Sync markers, trails and lines whenever the props (or the style) change.
  useEffect(() => {
    const m = map.current;
    if (!m || !styleTick) return;
    let cancelled = false;
    (async () => {
      const ml = await import("maplibre-gl");
      if (cancelled || !map.current) return;
      const still = reduceMotion();
      const seen = new Set<string>();
      for (const pin of pins) {
        seen.add(pin.id);
        const to: [number, number] = [pin.lng, pin.lat];
        let e = entries.current.get(pin.id);
        if (e && e.kind !== pin.kind) {
          e.marker.remove();
          entries.current.delete(pin.id);
          e = undefined;
        }
        if (!e) {
          const clickable = !!pin.tone && !!pinClickRef.current;
          const el = pinElement(pin, clickable);
          if (clickable) {
            const fire = (ev: Event) => {
              ev.stopPropagation();
              pinClickRef.current?.(pin.id);
            };
            el.addEventListener("click", fire);
            el.addEventListener("keydown", (ev) => {
              if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                fire(ev);
              }
            });
          }
          const marker = new ml.Marker({ element: el, draggable: !!pin.draggable, anchor: pin.kind === "rider" || pin.kind === "idle" ? "center" : "bottom" }).setLngLat(to).addTo(m);
          if (pin.draggable) {
            marker.on("dragend", () => {
              const p = marker.getLngLat();
              pickRef.current?.({ lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 });
            });
          }
          e = { marker, kind: pin.kind, el, pos: to, heading: pin.heading ?? null };
          entries.current.set(pin.id, e);
        } else if (e.pos[0] !== to[0] || e.pos[1] !== to[1]) {
          const from: [number, number] = [...(e.glide ? e.pos : (e.marker.getLngLat().toArray() as [number, number]))];
          const far = metres(from, to);
          if (pin.kind === "rider" || pin.kind === "idle") e.heading = pin.heading ?? (far > 3 ? bearing(from, to) : e.heading);
          if (still || far > 3000 || pin.draggable) {
            e.glide = undefined;
            e.pos = to;
            e.marker.setLngLat(to);
          } else {
            e.glide = { from, to, start: performance.now(), dur: Math.min(1800, 600 + far * 4) };
            animate();
          }
        }
        if (pin.heading != null) e.heading = pin.heading;
        const arrow = e.el.querySelector<HTMLElement>(".map-pin-heading");
        if (arrow) {
          arrow.style.opacity = e.heading == null ? "0" : "1";
          arrow.style.transform = `rotate(${e.heading ?? 0}deg)`;
        }
        e.el.title = pin.label;
        e.el.setAttribute("aria-label", pinLabel(pin));
        if (pin.tone) e.el.dataset.tone = pin.tone;
        else delete e.el.dataset.tone;
        if (pin.dim) e.el.dataset.dim = "true";
        else delete e.el.dataset.dim;
        if (pin.kind === "rider" && trails) {
          const h = history.current.get(pin.id) ?? [];
          const last = h[h.length - 1];
          if (!last || last[0] !== to[0] || last[1] !== to[1]) h.push(to);
          history.current.set(pin.id, h.slice(-80));
        }
      }
      for (const [id, e] of entries.current) {
        if (!seen.has(id)) {
          e.marker.remove();
          entries.current.delete(id);
          history.current.delete(id);
        }
      }

      const routeData = {
        type: "FeatureCollection" as const,
        features: lines.map((l) => ({
          type: "Feature" as const,
          properties: { done: l.done ? 1 : 0 },
          geometry: {
            type: "LineString" as const,
            coordinates: l.path && l.path.length > 1 ? l.path.map((p) => [p.lng, p.lat]) : [[l.from.lng, l.from.lat], [l.to.lng, l.to.lat]],
          },
        })),
      };
      const trailData = {
        type: "FeatureCollection" as const,
        features: [...history.current.entries()]
          .filter(([id, h]) => seen.has(id) && h.length > 1)
          .map(([id, h]) => ({ type: "Feature" as const, properties: { id }, geometry: { type: "LineString" as const, coordinates: h } })),
      };
      const primary = getComputedStyle(document.documentElement).getPropertyValue("--color-primary-element").trim() || "#00679e";
      const success = getComputedStyle(document.documentElement).getPropertyValue("--color-element-success").trim() || "#2d7b41";

      const put = (id: string, data: typeof routeData | typeof trailData) => {
        const src = m.getSource(id) as GeoJSONSource | undefined;
        if (src) src.setData(data);
        else m.addSource(id, { type: "geojson", data });
      };
      put("bz-trails", trailData);
      put("bz-routes", routeData);
      if (!m.getLayer("bz-trails")) {
        m.addLayer({ id: "bz-trails", type: "line", source: "bz-trails", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": primary, "line-width": 4, "line-opacity": 0.35 } });
      }
      if (!m.getLayer("bz-routes-casing")) {
        m.addLayer({ id: "bz-routes-casing", type: "line", source: "bz-routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.85 } });
        m.addLayer({
          id: "bz-routes",
          type: "line",
          source: "bz-routes",
          layout: { "line-cap": "butt", "line-join": "round" },
          paint: { "line-color": ["case", ["==", ["get", "done"], 1], success, primary], "line-width": 4, "line-dasharray": DASHES[0] },
        });
      }
      hasLines.current = lines.length > 0;
      if (lines.length) animate();

      const target = follow ? pins.find((p) => p.id === follow) : null;
      if (target && fitted.current) {
        m.easeTo({ center: [target.lng, target.lat], duration: still ? 0 : 1200 });
      } else if (pins.length && !fitted.current) {
        const b = new ml.LngLatBounds();
        pins.forEach((p) => b.extend([p.lng, p.lat]));
        m.fitBounds(b, { padding: 70, maxZoom: 15.5, duration: 0 });
        fitted.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pins, lines, styleTick, follow, trails]);

  const kinds = (["rider", "idle", "pickup", "dropoff"] as const).filter((k) => pins.some((p) => p.kind === k && !p.tone));
  const tones = (["open", "live", "done"] as const).filter((t) => pins.some((p) => p.tone === t));

  return (
    <div className={`bz-map relative overflow-hidden rounded-container border border-border-dark bg-background-hover ${onPick ? "[&_canvas]:cursor-crosshair" : ""} ${className}`}>
      {/* Inline size: maplibre-gl.css is unlayered and would override a Tailwind utility here. */}
      <div ref={box} style={{ position: "absolute", inset: 0 }} />
      {failed && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-[13px] text-maxcontrast">The map couldn&apos;t load in this browser. Delivery status is still shown alongside.</p>}
      {kinds.length + tones.length > 0 && (
        <ul className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-1 text-[12px]">
          {kinds.map((k) => (
            <li key={k} className="flex items-center gap-1.5 rounded-pill bg-main-background/95 px-2 py-0.5 shadow-sm">
              <span className={`map-key map-key-${k}`} />
              {LEGEND[k]}
            </li>
          ))}
          {tones.map((t) => (
            <li key={t} className="flex items-center gap-1.5 rounded-pill bg-main-background/95 px-2 py-0.5 shadow-sm">
              <span className={`map-key map-key-tone-${t}`} />
              {TONE[t]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
