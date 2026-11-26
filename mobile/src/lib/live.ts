import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef } from 'react';

import { config } from './config';
import { accessToken } from './supabase';

export type LiveEvent = { type: string; [k: string]: unknown };
type Sub = { scope: 'me' | 'admin' } | { delivery_id: string };

/**
 * One websocket to /api/v1/ws/live. The token goes in the first message, not
 * the URL, so it never reaches proxy logs. Events only say "something
 * changed", so the handler usually just invalidates queries. Reconnects with
 * backoff and a fresh token (the server closes with 4001 when it expires).
 */
export function useLive(subs: Sub[], onEvent: (e: LiveEvent) => void, enabled = true) {
  const handler = useRef(onEvent);
  useLayoutEffect(() => {
    handler.current = onEvent;
  });
  const key = JSON.stringify(subs);

  useEffect(() => {
    if (!enabled || !config.apiUrl) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const url = config.apiUrl.replace(/^http/, 'ws') + '/api/v1/ws/live';

    const connect = async () => {
      const token = await accessToken();
      if (!token || closed) return;
      ws = new WebSocket(url);
      ws.onopen = () => ws?.send(JSON.stringify({ type: 'auth', token }));
      ws.onmessage = (m) => {
        let msg: LiveEvent;
        try {
          msg = JSON.parse(String(m.data));
        } catch {
          return;
        }
        if (msg.type === 'ready') {
          attempt = 0;
          for (const s of JSON.parse(key) as Sub[]) ws?.send(JSON.stringify({ type: 'subscribe', ...s }));
          return;
        }
        if (msg.type !== 'subscribed') handler.current(msg);
      };
      ws.onclose = () => {
        if (closed) return;
        attempt += 1;
        timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt));
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [key, enabled]);
}

/** Refetch everything under these query keys when any live event arrives. */
export function useLiveRefresh(subs: Sub[], keys: string[][], enabled = true) {
  const qc = useQueryClient();
  useLive(subs, () => keys.forEach((k) => qc.invalidateQueries({ queryKey: k })), enabled);
}
