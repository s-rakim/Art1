import createClient, { type Middleware } from 'openapi-fetch';

import { config } from '@/lib/config';
import { accessToken, supabase } from '@/lib/supabase';
import type { components, paths } from './schema';

export type Schemas = components['schemas'];
export type Page<T> = { items: T[]; total: number; page: number; page_size: number };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const auth: Middleware = {
  async onRequest({ request }) {
    const token = await accessToken();
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    return request;
  },
  async onResponse({ response }) {
    // A revoked or expired session: drop it so the app returns to the login screen.
    if (response.status === 401) await supabase.auth.signOut({ scope: 'local' });
    return response;
  },
};

export const api = createClient<paths>({ baseUrl: config.apiUrl });
api.use(auth);

function toError(status: number, body: unknown): ApiError {
  const err = (body as { error?: { code?: string; message?: string } } | undefined)?.error;
  return new ApiError(status, err?.code ?? 'http_error', err?.message ?? `Request failed (${status}).`);
}

/**
 * Unwraps an openapi-fetch result: returns data or throws ApiError with the
 * server's own message, which is written for people and safe to show.
 */
export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await p;
  if (error !== undefined || !response.ok) throw toError(response.status, error);
  return data as T;
}

/**
 * For routes the backend has agreed but not yet published in openapi.json
 * (see src/api/pending.ts). Same base URL, same auth, same error format.
 * Once the spec lands, move callers to `api` and delete this.
 */
export async function call<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${config.apiUrl}/api/v1${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  if (res.status === 401) await supabase.auth.signOut({ scope: 'local' });
  if (!res.ok) throw toError(res.status, json);
  return json as T;
}

/** Multipart upload (product photos and videos). */
export async function upload<T>(path: string, form: FormData): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${config.apiUrl}/api/v1${path}`, {
    method: path.endsWith('/video') ? 'PUT' : 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const json = await res.json().catch(() => undefined);
  if (!res.ok) throw toError(res.status, json);
  return json as T;
}

export const qs = (params: Record<string, string | number | boolean | null | undefined>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return s ? `?${s}` : '';
};
