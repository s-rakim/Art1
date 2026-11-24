// One place that talks to the FastAPI backend. Every read has a demo fallback so the
// storefront renders before the backend is deployed; set NEXT_PUBLIC_DEMO_DATA=off to disable it.
import { apiBase, AUTH_ENABLED, DEMO_DATA } from "./config";
import * as demo from "./mock/data";
import * as logi from "./mock/logistics";
import type {
  AdminStats, Category, Delivery, Income, InventoryRow, Order, Paged, Placement, Plan, Product, ProductCard, Review,
  Rider, SellerStats, Settings, Store, Tracking,
} from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Opts = { token?: string | null; method?: string; body?: unknown; revalidate?: number; authed?: boolean };

async function request<T>(path: string, opts: Opts = {}, fallback?: () => T): Promise<T> {
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      ...(opts.method && opts.method !== "GET"
        ? { cache: "no-store" as const }
        : opts.token
          ? { cache: "no-store" as const }
          : { next: { revalidate: opts.revalidate ?? 60 } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let detail = text;
      try {
        detail = JSON.parse(text).detail ?? text;
      } catch {}
      throw new ApiError(res.status, typeof detail === "string" ? detail : res.statusText);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (err) {
    // Only fall back when the backend is unreachable; real 4xx/5xx answers are surfaced.
    // Anything that needs a signed-in user, and every write, only gets demo answers when
    // Supabase isn't configured at all. With auth on, a dead API is an error, never a fake success.
    const writes = opts.method && opts.method !== "GET";
    const allowDemo = DEMO_DATA && (!(opts.authed || writes) || !AUTH_ENABLED);
    if (fallback && allowDemo && !(err instanceof ApiError)) return fallback();
    throw err;
  }
}

function page<T>(items: T[], pageNo: number, size: number): Paged<T> {
  return { items: items.slice((pageNo - 1) * size, pageNo * size), total: items.length, page: pageNo, page_size: size };
}

export type ProductQuery = {
  q?: string;
  category?: string;
  store?: string;
  sort?: "relevance" | "price_asc" | "price_desc" | "newest" | "rating" | "bestselling";
  min_price?: number;
  max_price?: number;
  min_rating?: number;
  on_sale?: boolean;
  page?: number;
  page_size?: number;
};

function qs(params: Record<string, unknown>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "" && v !== false) s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : "";
}

function childSlugs(slug: string) {
  const root = demo.categories.find((c) => c.slug === slug);
  if (!root) return [slug];
  return [slug, ...demo.categories.filter((c) => c.parent_id === root.id).map((c) => c.slug)];
}

export function demoSearch(query: ProductQuery): Paged<ProductCard> {
  let items: ProductCard[] = demo.products;
  if (query.q) {
    const words = query.q.toLowerCase().split(/\s+/).filter(Boolean);
    items = items.filter((p) => {
      const hay = `${p.title} ${p.store.name} ${p.category_slug}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }
  if (query.category) {
    const slugs = childSlugs(query.category);
    items = items.filter((p) => slugs.includes(p.category_slug));
  }
  if (query.store) items = items.filter((p) => p.store.slug === query.store);
  if (query.min_price) items = items.filter((p) => p.price_cents >= query.min_price!);
  if (query.max_price) items = items.filter((p) => p.price_cents <= query.max_price!);
  if (query.min_rating) items = items.filter((p) => p.rating >= query.min_rating!);
  if (query.on_sale) items = items.filter((p) => p.compare_at_cents);
  const sorted = [...items];
  switch (query.sort) {
    case "price_asc": sorted.sort((a, b) => a.price_cents - b.price_cents); break;
    case "price_desc": sorted.sort((a, b) => b.price_cents - a.price_cents); break;
    case "newest": sorted.sort((a, b) => b.created_at.localeCompare(a.created_at)); break;
    case "rating": sorted.sort((a, b) => b.rating - a.rating); break;
    case "bestselling": sorted.sort((a, b) => b.sold_count - a.sold_count); break;
  }
  return page(sorted, query.page ?? 1, query.page_size ?? 24);
}

export const api = {
  products: (query: ProductQuery = {}) =>
    request<Paged<ProductCard>>(`/products${qs(query)}`, {}, () => demoSearch(query)),

  product: (slug: string) =>
    request<Product | null>(`/products/${encodeURIComponent(slug)}`, {}, () => demo.products.find((p) => p.slug === slug) ?? null)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),

  reviews: (slug: string) =>
    request<Paged<Review>>(`/products/${encodeURIComponent(slug)}/reviews`, {}, () => {
      const p = demo.products.find((x) => x.slug === slug);
      return page(p ? demo.reviewsFor(p.id) : [], 1, 20);
    }),

  categories: () => request<Category[]>(`/categories`, { revalidate: 600 }, () => demo.categories),

  suggest: (q: string) =>
    request<string[]>(`/search/suggest${qs({ q })}`, {}, () =>
      demo.products.filter((p) => p.title.toLowerCase().includes(q.toLowerCase())).slice(0, 6).map((p) => p.title)),

  stores: () => request<Paged<Store>>(`/stores`, {}, () => page(demo.stores.filter((s) => s.status === "active"), 1, 50)),

  store: (slug: string) =>
    request<Store | null>(`/stores/${encodeURIComponent(slug)}`, {}, () => demo.stores.find((s) => s.slug === slug) ?? null)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),

  plans: () => request<Plan[]>(`/plans`, { revalidate: 600 }, () => demo.plans),
  placements: () => request<Placement[]>(`/placements`, {}, () => demo.placements),

  // Authenticated calls. Token is the Supabase access token.
  wishlist: (token: string | null, ids: string[] = []) =>
    request<Paged<ProductCard>>(`/wishlist`, { token, authed: true }, () => page(demo.products.filter((p) => ids.includes(p.id)), 1, 200)),
  orders: (token: string | null) => request<Paged<Order>>(`/orders`, { token, authed: true }, () => page(demo.demoOrders(), 1, 20)),
  order: (token: string | null, id: string) =>
    request<Order | null>(`/orders/${encodeURIComponent(id)}`, { token, authed: true }, () => demo.demoOrders().find((o) => o.id === id) ?? null),

  checkout: (token: string | null, body: unknown) =>
    request<{ order_id: string; payment_url?: string | null; client_secret?: string | null }>(
      `/checkout`, { token, method: "POST", body, authed: true }, () => ({ order_id: demo.demoOrders()[0].id, payment_url: null })),

  applySeller: (token: string | null, body: unknown) =>
    request<{ id: string; status: string }>(`/seller/applications`, { token, method: "POST", body, authed: true }, () => ({ id: "app_demo", status: "pending" })),

  sellerMe: (token: string | null) => request<Store>(`/seller/me`, { token, authed: true }, () => demo.stores[0]),
  sellerStats: (token: string | null) => request<SellerStats>(`/seller/stats`, { token, authed: true }, () => demo.sellerStats),
  sellerProducts: (token: string | null) =>
    request<Paged<ProductCard>>(`/seller/products`, { token, authed: true }, () => demoSearch({ store: demo.stores[0].slug, page_size: 100 })),
  sellerOrders: (token: string | null) => request<Paged<Order>>(`/seller/orders`, { token, authed: true }, () => page(demo.demoOrders(), 1, 20)),
  createProduct: (token: string | null, body: unknown) =>
    request<{ id: string; slug: string }>(`/seller/products`, { token, method: "POST", body, authed: true }, () => ({ id: "p_new", slug: "draft" })),
  updateStore: (token: string | null, body: unknown) =>
    request<Store>(`/seller/me`, { token, method: "PATCH", body, authed: true }, () => ({ ...demo.stores[0], ...(body as object) })),
  bookPlacement: (token: string | null, body: unknown) =>
    request<{ id: string }>(`/seller/placements`, { token, method: "POST", body, authed: true }, () => ({ id: "bk_demo" })),

  adminStats: (token: string | null) => request<AdminStats>(`/admin/stats`, { token, authed: true }, () => demo.adminStats),
  adminStores: (token: string | null) => request<Paged<Store>>(`/admin/stores`, { token, authed: true }, () => page(demo.stores, 1, 100)),
  adminUpdateStore: (token: string | null, id: string, body: { status?: Store["status"]; verified?: boolean }) =>
    request<Store>(`/admin/stores/${id}`, { token, method: "PATCH", body, authed: true }, () => ({ ...demo.stores.find((s) => s.id === id)!, ...body })),
  // Delivery and dispatch
  tracking: (token: string | null, orderId: string) =>
    request<Tracking | null>(`/orders/${encodeURIComponent(orderId)}/tracking`, { token, authed: true }, () => logi.trackingFor(orderId)),
  sellerInventory: (token: string | null) => request<Paged<InventoryRow>>(`/seller/inventory`, { token, authed: true }, () => page(logi.inventory, 1, 500)),
  setStock: (token: string | null, variantId: string, stock: number) =>
    request<InventoryRow>(`/seller/variants/${encodeURIComponent(variantId)}`, { token, method: "PATCH", body: { stock }, authed: true }, () => ({ ...logi.inventory.find((r) => r.variant_id === variantId)!, stock })),
  confirmPayment: (token: string | null, orderId: string) =>
    request<Order>(`/seller/orders/${encodeURIComponent(orderId)}/confirm-payment`, { token, method: "POST", body: {}, authed: true }, () => ({ ...demo.demoOrders()[0], id: orderId, status: "paid" })),
  availableRiders: (token: string | null) => request<Rider[]>(`/seller/riders/available`, { token, authed: true }, () => logi.riders.filter((r) => r.status === "active" && r.on_shift)),
  dispatch: (token: string | null, orderId: string, riderId: string) =>
    request<Delivery>(`/seller/orders/${encodeURIComponent(orderId)}/dispatch`, { token, method: "POST", body: { rider_id: riderId }, authed: true }, () => ({ ...logi.deliveries[3], order_id: orderId })),
  sellerDeliveries: (token: string | null) => request<Paged<Delivery>>(`/seller/deliveries`, { token, authed: true }, () => page(logi.deliveries, 1, 100)),

  applyRider: (token: string | null, body: unknown) =>
    request<{ id: string; status: string }>(`/rider/applications`, { token, method: "POST", body, authed: true }, () => ({ id: "ra_demo", status: "applied" })),
  riderMe: (token: string | null) => request<Rider>(`/rider/me`, { token, authed: true }, () => logi.riders[0]),
  riderDeliveries: (token: string | null) =>
    request<Paged<Delivery>>(`/rider/deliveries`, { token, authed: true }, () => page(logi.deliveries.filter((d) => d.rider?.id === "r1" || d.status === "assigned"), 1, 50)),
  riderAction: (token: string | null, id: string, action: "accept" | "decline" | "picked_up" | "delivered") =>
    request<Delivery>(`/rider/deliveries/${encodeURIComponent(id)}`, { token, method: "PATCH", body: { action }, authed: true }, () => {
      const d = logi.deliveries.find((x) => x.id === id)!;
      const next = { accept: "accepted", decline: "awaiting_rider", picked_up: "picked_up", delivered: "delivered" } as const;
      return { ...d, status: next[action] };
    }),
  riderLocation: (token: string | null, body: { lat: number; lng: number; accuracy_m: number; heading?: number | null }) =>
    request<void>(`/rider/location`, { token, method: "POST", body, authed: true }, () => undefined),

  status: () => request<{ maintenance_mode: boolean; maintenance_message: string }>(`/status`, { revalidate: 15 }, () => ({ maintenance_mode: false, maintenance_message: "" })),
  adminSettings: (token: string | null) => request<Settings>(`/admin/settings`, { token, authed: true }, () => logi.settings),
  adminUpdateSettings: (token: string | null, body: Partial<Settings>) =>
    request<Settings>(`/admin/settings`, { token, method: "PATCH", body, authed: true }, () => ({ ...logi.settings, ...body })),
  adminRiders: (token: string | null) => request<Paged<Rider>>(`/admin/riders`, { token, authed: true }, () => page(logi.riders, 1, 200)),
  adminUpdateRider: (token: string | null, id: string, status: Rider["status"]) =>
    request<Rider>(`/admin/riders/${encodeURIComponent(id)}`, { token, method: "PATCH", body: { status }, authed: true }, () => ({ ...logi.riders.find((r) => r.id === id)!, status })),
  adminDeliveries: (token: string | null) => request<Paged<Delivery>>(`/admin/deliveries`, { token, authed: true }, () => page(logi.deliveries, 1, 200)),
  adminIncome: (token: string | null) => request<Income>(`/admin/income?period=30d`, { token, authed: true }, () => logi.income),
  adminPlacements: (token: string | null) => request<Placement[]>(`/admin/placements`, { token, authed: true }, () => demo.placements),
  adminUpdatePlacement: (token: string | null, id: string, body: Partial<Pick<Placement, "weekly_price_cents" | "slots_total">>) =>
    request<Placement>(`/admin/placements/${encodeURIComponent(id)}`, { token, method: "PATCH", body, authed: true }, () => ({ ...demo.placements.find((p) => p.id === id)!, ...body })),
  adminUpdatePlan: (token: string | null, id: string, body: Partial<Pick<Plan, "monthly_price_cents" | "commission_rate">>) =>
    request<Plan>(`/admin/plans/${encodeURIComponent(id)}`, { token, method: "PATCH", body, authed: true }, () => ({ ...demo.plans.find((p) => p.id === id)!, ...body })),
  adminOrders: (token: string | null) => request<Paged<Order>>(`/admin/orders`, { token, authed: true }, () => page(demo.demoOrders(), 1, 50)),
};
