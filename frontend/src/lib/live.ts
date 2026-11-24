"use client";
import { useEffect, useRef, useState } from "react";
import { PUBLIC_API_URL } from "./config";

export type LiveEvent =
  | { type: "location"; delivery_id: string; lat: number; lng: number; heading?: number | null; at: string }
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
    return { type: "location", delivery_id: m.delivery_id, lat: m.lat, lng: m.lng, heading: isNum(m.heading) ? m.heading : null, at: typeof m.at === "string" ? m.at : new Date().toISOString() };
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
