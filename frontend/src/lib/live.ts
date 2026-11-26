"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PUBLIC_API_URL } from "./config";

export type LiveEvent =
  | { type: "location"; delivery_id: string; lat: number; lng: number; heading?: number | null; speed_kmh?: number | null; at: string }
  | { type: "status"; delivery_id: string; status: string; at?: string }
  | { type: "rider_location"; rider_id: string; lat: number; lng: number; at: string };

function socketUrl() {
  try {
    const u = new URL(`${PUBLIC_API_URL}/ws/tracking`);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.toString();
  } catch {
    return null;
  }
}

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

// Only accept the two message shapes we expect, with sane values. Anything else is dropped.
function parse(raw: unknown): LiveEvent | null {
  if (typeof raw !== "string" || raw.length > 4096) return null;
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== "object") return null;
  // Riders on shift with no job, sent only to the admin feed.
  if (m.type === "rider_location" && typeof m.rider_id === "string" && isNum(m.lat) && isNum(m.lng) && Math.abs(m.lat) <= 90 && Math.abs(m.lng) <= 180) {
    return { type: "rider_location", rider_id: m.rider_id, lat: m.lat, lng: m.lng, at: typeof m.at === "string" ? m.at : new Date().toISOString() };
  }
  if (typeof m.delivery_id !== "string") return null;
  if (m.type === "location" && isNum(m.lat) && isNum(m.lng) && Math.abs(m.lat) <= 90 && Math.abs(m.lng) <= 180) {
    return { type: "location", delivery_id: m.delivery_id, lat: m.lat, lng: m.lng, heading: isNum(m.heading) ? m.heading : null, speed_kmh: isNum(m.speed_kmh) && m.speed_kmh >= 0 && m.speed_kmh < 300 ? m.speed_kmh : null, at: typeof m.at === "string" ? m.at : new Date().toISOString() };
  }
  if (m.type === "status" && typeof m.status === "string" && m.status.length < 40) {
    return { type: "status", delivery_id: m.delivery_id, status: m.status, at: typeof m.at === "string" ? m.at : undefined };
  }
  return null;
}

/**
 * Subscribes to the API's tracking websocket. The token travels in the first message,
 * never in the URL, so it stays out of proxy logs. Reconnects with backoff. Callers keep
 * polling as a fallback; `live` tells them whether they can poll less often.
 *
 * Pass `admin: true` for the whole-market feed (admins only), or a list of delivery ids.
 */
export function useLiveTracking(
  token: string | null,
  target: { deliveryIds?: string[]; admin?: boolean },
  onEvent: (e: LiveEvent) => void,
) {
  const [live, setLive] = useState(false);
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });
  const ids = (target.deliveryIds ?? []).filter((x) => /^[0-9a-fA-F-]{8,64}$/.test(x)).slice(0, 20).sort().join(",");
  const admin = !!target.admin;

  useEffect(() => {
    const url = socketUrl();
    if (!token || !url || (!admin && !ids)) return;
    let ws: WebSocket | null = null;
    let stop = false;
    let tries = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const open = () => {
      if (stop) return;
      try {
        ws = new WebSocket(url);
      } catch {
        return;
      }
      ws.onopen = () => ws?.send(JSON.stringify({ type: "auth", token }));
      ws.onmessage = (msg) => {
        let head: { type?: unknown } | null = null;
        try {
          head = typeof msg.data === "string" && msg.data.length <= 4096 ? JSON.parse(msg.data) : null;
        } catch {
          head = null;
        }
        if (head?.type === "ready") {
          tries = 0;
          setLive(true);
          if (admin) ws?.send(JSON.stringify({ type: "subscribe", scope: "admin" }));
          else for (const id of ids.split(",")) ws?.send(JSON.stringify({ type: "subscribe", delivery_id: id }));
          return;
        }
        const e = parse(msg.data);
        if (e) handler.current(e);
      };
      ws.onclose = (ev) => {
        setLive(false);
        // 1008 means the server refused us (bad token, wrong origin). Don't hammer it.
        if (stop || ev.code === 1008) return;
        tries += 1;
        retry = setTimeout(open, Math.min(30000, 1000 * 2 ** Math.min(tries, 5)));
      };
      ws.onerror = () => ws?.close();
    };

    open();
    return () => {
      stop = true;
      clearTimeout(retry);
      ws?.close();
      setLive(false);
    };
  }, [token, ids, admin]);

  return live;
}

// ---------------------------------------------------------------------------------------
// Account-wide events: one shared socket per tab, subscribed to everything that concerns the
// signed-in user (scope "me"). Views treat these as "something changed, refresh" signals.

export type AppEvent =
  | { type: "order"; order_id: string; store_order_id: string | null; status: string; payment_status: string | null }
  | { type: "job"; delivery_id: string; status: string }
  | { type: "stock"; product_id: string; variant_id: string; stock: number }
  | { type: "application"; kind: "rider" | "vendor"; id: string; status: string }
  | { type: "catalog"; product_id: string; slug: string | null }
  /** The riders' job board: an order joined the pool ("open") or a rider took it ("taken"). */
  | { type: "jobs"; store_order_id: string; change: "open" | "taken" };
export type AppEventType = AppEvent["type"];

const str = (v: unknown, max = 64): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const optStr = (v: unknown, max = 64) => (str(v, max) ? v : null);

function parseApp(raw: unknown): AppEvent | null {
  if (typeof raw !== "string" || raw.length > 4096) return null;
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== "object") return null;
  switch (m.type) {
    case "order":
      return str(m.order_id) && str(m.status, 40) ? { type: "order", order_id: m.order_id, store_order_id: optStr(m.store_order_id), status: m.status, payment_status: optStr(m.payment_status, 40) } : null;
    case "job":
      return str(m.delivery_id) && str(m.status, 40) ? { type: "job", delivery_id: m.delivery_id, status: m.status } : null;
    case "stock":
      return str(m.product_id) && str(m.variant_id) && isNum(m.stock) ? { type: "stock", product_id: m.product_id, variant_id: m.variant_id, stock: m.stock } : null;
    case "application":
      return (m.kind === "rider" || m.kind === "vendor") && str(m.id) && str(m.status, 40) ? { type: "application", kind: m.kind, id: m.id, status: m.status } : null;
    case "catalog":
      return str(m.product_id) ? { type: "catalog", product_id: m.product_id, slug: optStr(m.slug, 200) } : null;
    case "jobs":
      return str(m.store_order_id) && (m.change === "open" || m.change === "taken") ? { type: "jobs", store_order_id: m.store_order_id, change: m.change } : null;
    default:
      return null;
  }
}

const hub = {
  listeners: new Set<(e: AppEvent) => void>(),
  status: new Set<(live: boolean) => void>(),
  ws: null as WebSocket | null,
  connecting: false,
  live: false,
  tries: 0,
  refused: 0,
  retry: undefined as ReturnType<typeof setTimeout> | undefined,
};

function setHubLive(v: boolean) {
  hub.live = v;
  hub.status.forEach((f) => f(v));
}

async function connectHub() {
  const url = socketUrl();
  if (!url || hub.ws || hub.connecting || hub.listeners.size === 0) return;
  hub.connecting = true;
  let token: string | undefined;
  try {
    const { supabase } = await import("./supabase/client");
    // getSession refreshes an expired access token, so every reconnect carries a fresh one.
    token = (await supabase()?.auth.getSession())?.data.session?.access_token;
  } finally {
    hub.connecting = false;
  }
  if (!token || hub.ws || hub.listeners.size === 0) return;
  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch {
    return;
  }
  hub.ws = ws;
  ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
  ws.onmessage = (msg) => {
    if (typeof msg.data !== "string" || msg.data.length > 4096) return;
    if (msg.data.includes('"ready"')) {
      try {
        if (JSON.parse(msg.data)?.type === "ready") {
          hub.tries = 0;
          hub.refused = 0;
          ws.send(JSON.stringify({ type: "subscribe", scope: "me" }));
          setHubLive(true);
          return;
        }
      } catch {
        return;
      }
    }
    const e = parseApp(msg.data);
    if (e) hub.listeners.forEach((f) => f(e));
  };
  ws.onclose = (ev) => {
    if (hub.ws === ws) hub.ws = null;
    setHubLive(false);
    if (hub.listeners.size === 0) return;
    // The server closes the socket when the token expires; a policy close (1008) right after
    // connecting several times in a row means it won't accept us, so stop and rely on polling.
    if (ev.code === 1008 && ++hub.refused >= 3) return;
    hub.tries += 1;
    clearTimeout(hub.retry);
    hub.retry = setTimeout(connectHub, Math.min(30000, 1000 * 2 ** Math.min(hub.tries, 5)));
  };
  ws.onerror = () => ws.close();
}

/**
 * Listens for account events of the given kinds. Returns whether the socket is up, so callers
 * can poll less often while it is.
 */
const watchLive = (tell: () => void) => {
  hub.status.add(tell);
  return () => {
    hub.status.delete(tell);
  };
};

export function useLiveEvents(kinds: AppEventType[], onEvent: (e: AppEvent) => void): boolean {
  const live = useSyncExternalStore(watchLive, () => hub.live, () => false);
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });
  const key = [...kinds].sort().join(",");

  useEffect(() => {
    const wanted = new Set(key.split(","));
    const listener = (e: AppEvent) => wanted.has(e.type) && handler.current(e);
    hub.listeners.add(listener);
    connectHub();
    return () => {
      hub.listeners.delete(listener);
      if (hub.listeners.size === 0) {
        clearTimeout(hub.retry);
        hub.ws?.close();
        hub.ws = null;
      }
    };
  }, [key]);

  return live;
}

/**
 * Calls `reload` when a matching event arrives (bunched up so a burst triggers one reload),
 * and polls as a fallback: every `pollMs` while the socket is down, four times slower while up.
 */
export function useLiveReload(kinds: AppEventType[], reload: () => void, pollMs = 20000, filter?: (e: AppEvent) => boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(reload);
  const test = useRef(filter);
  useEffect(() => {
    latest.current = reload;
    test.current = filter;
  });
  const live = useLiveEvents(kinds, (e) => {
    if (test.current && !test.current(e)) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(), 300);
  });
  useEffect(() => {
    if (!pollMs) return;
    const t = setInterval(() => document.visibilityState === "visible" && latest.current(), live ? pollMs * 4 : pollMs);
    return () => clearInterval(t);
  }, [live, pollMs]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return live;
}
