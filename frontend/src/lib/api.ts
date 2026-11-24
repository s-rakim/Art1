// One place that talks to the FastAPI backend (contract: backend/openapi.json, typed in
// openapi.ts). Responses are mapped into the view models in types.ts. Public reads fall
// back to bundled demo data when the API is unreachable; set NEXT_PUBLIC_DEMO_DATA=off
// to disable that. Signed-in calls and writes only fall back when Supabase isn't set up.
import { apiBase, AUTH_ENABLED, DEMO_DATA } from "./config";
import * as demo from "./mock/data";
import * as logi from "./mock/logistics";
import type { components } from "./openapi";
import type {
  AdminOrder, AdminStats, AdminStore, AvailableRider, BookedPlacement, Category, Delivery, DeliveryTrack, Income,
  InventoryRow, LiveRider, MapPoint, Order, OrderLine, OrderSummary, Paged, PlacementBooking, PlacementSlot, Plan,
  Product, ProductCard, Review, Rider, SellerOrder, SellerProductRow, SellerProfile, SellerStats, Settings, Store,
  Tracking,
} from "./types";

type S = components["schemas"];

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
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
      let message = res.statusText;
      let code: string | undefined;
      try {
        const j = JSON.parse(text);
        // FastAPI: {detail: "..."} or {detail: [{msg}]}; our API: {error: {code, message}}
        if (typeof j?.detail === "string") message = j.detail;
        else if (Array.isArray(j?.detail) && j.detail[0]?.msg) message = String(j.detail[0].msg);
        else if (j?.error?.message) message = String(j.error.message);
        code = j?.error?.code ?? j?.code;
      } catch {}
      throw new ApiError(res.status, message || "Request failed", code);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (err) {
    const writes = opts.method && opts.method !== "GET";
    const allowDemo = DEMO_DATA && (!(opts.authed || writes) || !AUTH_ENABLED);
    if (fallback && allowDemo && !(err instanceof ApiError)) return fallback();
    throw err;
  }
}

/** Fetch a backend shape, map it to a view model; demo fallback is already in view shape. */
async function get<B, V>(path: string, opts: Opts, map: (b: B) => V, fallback?: () => V): Promise<V> {
  let usedFallback = false;
  const raw = await request<B | V>(path, opts, fallback ? () => ((usedFallback = true), fallback()) : undefined);
  return usedFallback ? (raw as V) : map(raw as B);
}

function page<T>(items: T[], pageNo: number, size: number): Paged<T> {
  return { items: items.slice((pageNo - 1) * size, pageNo * size), total: items.length, page: pageNo, page_size: size };
}
const mapPage = <B, V>(p: { items: B[]; total: number; page: number; page_size: number }, f: (b: B) => V): Paged<V> => ({
  items: p.items.map(f), total: p.total, page: p.page, page_size: p.page_size,
});

function qs(params: Record<string, unknown>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "" && v !== false) s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : "";
}

const enc = encodeURIComponent;

// ---------- mappers: backend -> view ----------

const opt = (o: Record<string, string> | undefined, ...keys: string[]) => {
  if (!o) return undefined;
  for (const k of Object.keys(o)) if (keys.includes(k.toLowerCase())) return o[k];
  return undefined;
};

function toCard(c: S["ProductCard"]): ProductCard {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    price_cents: c.price_cents ?? 0,
    compare_at_cents: c.compare_at_cents,
    currency: c.currency,
    image_url: c.image_url,
    rating: c.rating,
    review_count: c.review_count,
    sold_count: c.sold_count,
    store: { id: c.store.slug, slug: c.store.slug, name: c.store.name },
    category_slug: c.category_slug ?? "",
    sponsored: c.sponsored ?? false,
  };
}

function toProduct(p: S["ProductDetail"]): Product {
  const variants = p.variants.map((v) => ({
    id: v.id,
    sku: v.sku,
    title: v.title,
    color: opt(v.options, "color", "colour"),
    color_hex: opt(v.options, "color_hex", "hex", "swatch"),
    size: opt(v.options, "size"),
    price_cents: v.price_cents,
    compare_at_cents: v.compare_at_cents,
    stock: v.in_stock ? v.stock : 0,
    min_order_qty: v.min_order_qty,
  }));
  const tiers = p.variants.find((v) => v.tier_prices.length)?.tier_prices;
  const first = p.variants[0];
  const specs: Record<string, string> = { "Sold by": p.store.name };
  if (p.brand) specs.Brand = p.brand;
  for (const [k, v] of Object.entries(p.attributes ?? {})) if (typeof v === "string" || typeof v === "number") specs[k] = String(v);
  if (first) specs.SKU = first.sku;
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    price_cents: p.price_cents ?? first?.price_cents ?? 0,
    compare_at_cents: first?.compare_at_cents ?? null,
    currency: p.currency,
    image_url: p.images[0]?.url ?? null,
    images: p.images.map((i) => i.url),
    rating: p.rating,
    review_count: p.review_count,
    sold_count: p.sold_count,
    store: { id: p.store.id, slug: p.store.slug, name: p.store.name, rating: p.store.rating },
    category_slug: p.category?.slug ?? "",
    variants,
    price_tiers: tiers?.length ? [{ min_qty: 1, price_cents: first.price_cents }, ...tiers.filter((t) => t.min_qty > 1)] : undefined,
    specs,
    badges: tiers?.length ? ["Bulk pricing"] : [],
  };
}

function toStore(s: S["Store"]): Store {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    tagline: s.tagline ?? "",
    description: s.description ?? "",
    banner_color: s.banner_color ?? "#00679e",
    accent_color: s.accent_color ?? "#ffffff",
    logo_url: s.logo_url,
    country: s.country ?? "",
    joined_at: s.created_at,
    rating: s.rating,
    review_count: s.review_count,
    product_count: s.product_count ?? 0,
    status: "active",
  };
}

function toPlan(p: S["Plan"], i: number, all: S["Plan"][]): Plan {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    monthly_price_cents: p.monthly_price_cents,
    commission_rate: p.commission_rate,
    per_item_fee_cents: p.per_item_fee_cents,
    product_limit: p.product_limit,
    featured_slots: p.featured_slots,
    features: p.features,
    highlighted: all.length === 3 ? i === 1 : false,
  };
}

function toSlot(s: S["PlacementSlot"]): PlacementSlot {
  return { id: s.id, code: s.code, name: s.name, location: s.location, description: s.description ?? "", daily_price_cents: s.daily_price_cents, capacity: s.capacity };
}

function toReview(r: S["Review"]): Review {
  return { id: r.id, author: r.author_name, rating: r.rating, title: r.title ?? "", body: r.body ?? "", created_at: r.created_at, verified_purchase: r.verified };
}

function addr(d: Record<string, unknown> | null | undefined) {
  const o = (d ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : undefined);
  return { full_name: str("full_name"), line1: str("line1"), line2: str("line2"), city: str("city"), region: str("region"), postal_code: str("postal_code"), country: str("country"), phone: str("phone") };
}

function toOrder(o: S["Order"]): Order {
  const lines: OrderLine[] = o.shipments.flatMap((sh) =>
    sh.items.map((it) => ({
      id: it.id,
      product_id: it.product_id,
      slug: it.product_slug,
      title: it.title,
      variant_label: it.variant_title ?? "",
      unit_price_cents: it.unit_price_cents,
      quantity: it.quantity,
      store_slug: sh.store.slug,
      store_name: sh.store.name,
      image_url: it.image_url,
    })),
  );
  const events: Order["events"] = [{ status: "pending_payment", at: o.created_at }];
  if (o.paid_at) events.push({ status: "paid", at: o.paid_at });
  const shipped = o.shipments.map((s) => s.shipped_at).filter(Boolean).sort()[0];
  if (shipped) events.push({ status: "shipped", at: shipped });
  const delivered = o.shipments.every((s) => s.delivered_at) ? o.shipments.map((s) => s.delivered_at!).sort().pop() : null;
  if (delivered) events.push({ status: "fulfilled", at: delivered });
  if (o.status === "canceled" || o.status === "refunded") events.push({ status: o.status, at: "" });
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    created_at: o.created_at,
    currency: o.currency,
    subtotal_cents: o.subtotal_cents,
    discount_cents: o.discount_cents,
    shipping_cents: o.shipping_cents,
    tax_cents: o.tax_cents,
    total_cents: o.total_cents,
    item_count: lines.reduce((a, l) => a + l.quantity, 0),
    lines,
    shipping_address: addr(o.shipping_address as Record<string, unknown>) as Order["shipping_address"],
    events,
    payment_provider: o.payment_provider,
  };
}

const point = (p: { lat: number; lng: number; label?: string | null } | null | undefined): MapPoint | null =>
  p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? { lat: p.lat, lng: p.lng, label: p.label ?? null } : null;
const position = (p: { lat: number; lng: number; at?: string | null } | null | undefined) =>
  p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? { lat: p.lat, lng: p.lng, at: p.at ?? null } : null;

function toTrack(t: S["DeliveryTrack"]): DeliveryTrack {
  return {
    delivery_id: t.delivery_id,
    store_name: t.store_name,
    status: t.status,
    eta_minutes: t.eta_minutes,
    rider: t.rider,
    rider_position: position(t.rider_position),
    pickup: point(t.pickup),
    dropoff: point(t.dropoff),
    handover_code: t.handover_code,
  };
}

function toTracking(t: S["Tracking"]): Tracking {
  return {
    order_status: t.order_status,
    delivery_id: t.delivery_id,
    store_name: t.deliveries.find((d) => d.delivery_id === t.delivery_id)?.store_name ?? "",
    status: t.status,
    eta_minutes: t.eta_minutes,
    rider: t.rider,
    rider_position: position(t.rider_position),
    pickup: point(t.pickup),
    dropoff: point(t.dropoff),
    handover_code: t.handover_code,
    deliveries: t.deliveries.map(toTrack),
  };
}

function toSellerOrder(o: S["StoreOrder"]): SellerOrder {
  return {
    id: o.id,
    order_id: o.order_id,
    number: o.order_number,
    status: o.status,
    paid: o.paid,
    payment_method: o.payment_method,
    payment_status: o.payment_status,
    total_cents: o.subtotal_cents + o.shipping_cents - o.discount_cents,
    payout_cents: o.payout_cents,
    currency: o.currency,
    ship_to: addr(o.ship_to as Record<string, unknown>),
    items: o.items.map((i) => ({ id: i.id, title: i.title, variant_label: i.variant_title ?? "", quantity: i.quantity, unit_price_cents: i.unit_price_cents })),
    delivery: o.delivery ? { id: o.delivery.id, status: o.delivery.status, rider_name: o.delivery.rider_name, rider_vehicle: o.delivery.rider_vehicle } : null,
    tracking_carrier: o.tracking_carrier,
    tracking_number: o.tracking_number,
    created_at: o.created_at,
  };
}

function toSellerProfile(m: S["SellerMe"], plans?: Plan[]): SellerProfile {
  const st = m.store;
  return {
    store: {
      id: st.id, slug: st.slug, name: st.name, tagline: st.tagline ?? "", description: st.description ?? "",
      banner_color: st.banner_color ?? "#00679e", accent_color: st.accent_color ?? "#ffffff", logo_url: st.logo_url,
      country: st.country ?? "", joined_at: st.created_at, rating: st.rating, review_count: st.review_count,
      product_count: st.product_count ?? 0, status: st.status, plan: m.plan.code,
      support_email: st.support_email, review_note: st.review_note,
      pickup: st.pickup_lat != null && st.pickup_lng != null
        ? {
            lat: st.pickup_lat, lng: st.pickup_lng,
            label: typeof st.pickup_address?.label === "string" ? (st.pickup_address.label as string) : null,
            city: typeof st.pickup_address?.city === "string" ? (st.pickup_address.city as string) : null,
          }
        : null,
    },
    subscription: m.subscription ? { status: m.subscription.status, current_period_end: m.subscription.current_period_end, cancel_at_period_end: m.subscription.cancel_at_period_end } : null,
    plan: plans?.find((p) => p.code === m.plan.code) ?? toPlan(m.plan, 0, [m.plan]),
    balance: m.balance,
    product_limit: m.product_limit,
    active_products: m.active_products,
  };
}

function toRider(r: S["AdminRider"] | S["RiderMe"]): Rider {
  const a = r as S["AdminRider"];
  return {
    id: r.id,
    full_name: r.full_name,
    phone: r.phone,
    email: a.email ?? null,
    vehicle: r.vehicle,
    city: r.city,
    status: r.status,
    on_shift: r.is_online,
    deliveries_completed: r.completed_deliveries,
    active_deliveries: r.active_deliveries,
    earnings_cents: (r as S["RiderMe"]).earnings_cents,
    unpaid_earnings_cents: (r as S["RiderMe"]).unpaid_earnings_cents,
    position: a.last_lat != null && a.last_lng != null ? { lat: a.last_lat, lng: a.last_lng, at: a.last_seen_at } : null,
    applied_at: a.created_at ?? r.last_seen_at ?? "",
    review_note: r.review_note,
    licence_number: a.licence_number ?? null,
  };
}

function toRiderDelivery(d: S["RiderDelivery"]): Delivery {
  const a = addr(d.dropoff_address as Record<string, unknown>);
  return {
    id: d.id,
    order_number: d.order_number,
    store_name: d.store.name,
    status: d.status,
    pickup: point(d.pickup),
    dropoff: point(d.dropoff),
    dropoff_address: [a.line1, a.line2, a.city].filter(Boolean).join(", ") || null,
    rider: null,
    rider_position: null,
    eta_minutes: null,
    fee_cents: d.fee_cents,
    cash_to_collect_cents: d.cash_to_collect_cents,
    customer_name: d.customer_name,
    customer_phone: d.customer_phone,
    items: d.items,
    created_at: d.assigned_at,
  };
}

function toLive(m: S["LiveMap"]): { deliveries: Delivery[]; riders: LiveRider[] } {
  return {
    deliveries: m.deliveries.map((d) => ({
      id: d.id,
      order_number: d.order_number,
      store_name: d.store_name,
      status: d.status,
      pickup: point(d.pickup),
      dropoff: point(d.dropoff),
      rider: { id: d.rider_id, name: d.rider_name, vehicle: "" },
      rider_position: position(d.rider_position),
      eta_minutes: null,
      created_at: d.assigned_at,
    })),
    riders: m.riders.map((r) => ({ id: r.id, name: r.name, vehicle: r.vehicle, lat: r.lat, lng: r.lng, busy: r.busy })),
  };
}

// ---------- demo search ----------

export type ProductQuery = {
  q?: string;
  category?: string;
  store?: string;
  sort?: "relevance" | "price_asc" | "price_desc" | "newest" | "rating" | "popular";
  min_price?: number;
  max_price?: number;
  min_rating?: number;
  on_sale?: boolean;
  page?: number;
  page_size?: number;
};

function childSlugs(slug: string) {
  const root = demo.categories.find((c) => c.slug === slug);
  if (!root) return [slug];
  return [slug, ...demo.categories.filter((c) => c.parent_id === root.id).map((c) => c.slug)];
}

/** Rating and on-sale aren't API filters, so they're applied to the page we get back. */
function postFilter(items: ProductCard[], q: ProductQuery) {
  return items.filter((p) => (!q.min_rating || p.rating >= q.min_rating) && (!q.on_sale || (p.compare_at_cents ?? 0) > p.price_cents));
}

export function demoSearch(query: ProductQuery): Paged<ProductCard> {
  let items: ProductCard[] = demo.products;
  if (query.q) {
    const words = query.q.toLowerCase().split(/\s+/).filter(Boolean);
    items = items.filter((p) => words.every((w) => `${p.title} ${p.store.name} ${p.category_slug}`.toLowerCase().includes(w)));
  }
  if (query.category) {
    const slugs = childSlugs(query.category);
    items = items.filter((p) => slugs.includes(p.category_slug));
  }
  if (query.store) items = items.filter((p) => p.store.slug === query.store);
  if (query.min_price) items = items.filter((p) => p.price_cents >= query.min_price!);
  if (query.max_price) items = items.filter((p) => p.price_cents <= query.max_price!);
  items = postFilter(items, query);
  const sorted = [...items];
  switch (query.sort) {
    case "price_asc": sorted.sort((a, b) => a.price_cents - b.price_cents); break;
    case "price_desc": sorted.sort((a, b) => b.price_cents - a.price_cents); break;
    case "newest": sorted.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")); break;
    case "rating": sorted.sort((a, b) => b.rating - a.rating); break;
    case "popular": sorted.sort((a, b) => b.sold_count - a.sold_count); break;
  }
  return page(sorted, query.page ?? 1, query.page_size ?? 24);
}

const notFoundToNull = <T>(p: Promise<T>) =>
  p.catch((e) => {
    if (e instanceof ApiError && (e.status === 404 || e.status === 422)) return null;
    throw e;
  });

// ---------- the API ----------

export const api = {
  // Catalogue
  products: (query: ProductQuery = {}) => {
    const { min_rating: _r, on_sale: _s, ...apiQuery } = query;
    return get<S["ProductPage"], Paged<ProductCard>>(
      `/products${qs(apiQuery)}`, {},
      (p) => {
        const m = mapPage(p, toCard);
        const items = postFilter(m.items, query);
        return { ...m, items, total: items.length === m.items.length ? m.total : items.length };
      },
      () => demoSearch(query),
    );
  },
  product: (slug: string) =>
    notFoundToNull(get<S["ProductDetail"], Product | null>(`/products/${enc(slug)}`, {}, toProduct, () => demo.products.find((p) => p.slug === slug) ?? null)),
  reviews: (slug: string) =>
    get<S["Page_Review_"], Paged<Review>>(`/products/${enc(slug)}/reviews`, {}, (p) => mapPage(p, toReview), () => {
      const p = demo.products.find((x) => x.slug === slug);
      return page(p ? demo.reviewsFor(p.id) : [], 1, 20);
    }),
  categories: () =>
    get<S["Category"][], Category[]>(`/categories`, { revalidate: 600 }, (list) => {
      const out: Category[] = [];
      const walk = (c: S["Category"]) => {
        out.push({ id: c.id, slug: c.slug, name: c.name, parent_id: c.parent_id, image_url: c.image_url });
        c.children?.forEach(walk);
      };
      list.forEach(walk);
      return out;
    }, () => demo.categories),
  suggest: (q: string) =>
    get<S["Suggestion"][], string[]>(`/search/suggest${qs({ q, limit: 7 })}`, {}, (s) => s.map((x) => x.text), () =>
      demo.products.filter((p) => p.title.toLowerCase().includes(q.toLowerCase())).slice(0, 6).map((p) => p.title)),
  stores: () =>
    get<S["Page_Store_"], Paged<Store>>(`/stores${qs({ page_size: 100 })}`, {}, (p) => mapPage(p, toStore), () => page(demo.stores.filter((s) => s.status === "active"), 1, 100)),
  store: (slug: string) =>
    notFoundToNull(get<S["Store"], Store | null>(`/stores/${enc(slug)}`, {}, toStore, () => demo.stores.find((s) => s.slug === slug) ?? null)),
  plans: () =>
    get<S["Plan"][], Plan[]>(`/plans`, { revalidate: 600 }, (list) => list.map(toPlan), () => demo.plans),
  placementSlots: () =>
    get<S["PlacementSlot"][], PlacementSlot[]>(`/placement-slots`, { revalidate: 120 }, (l) => l.map(toSlot), () => demo.placements),
  /** Live bookings shown on the storefront (homepage shelves, banners). */
  placements: () =>
    get<S["Placement"][], BookedPlacement[]>(`/placements`, { revalidate: 120 }, (l) =>
      l.map((p) => ({ id: p.id, slot_code: p.slot_code, location: p.location, headline: p.headline, store: p.store, product: p.product ? toCard(p.product) : null })),
      () => []),
  status: () =>
    get<S["SiteStatus"], { maintenance_mode: boolean; maintenance_message: string }>(`/status`, { revalidate: 15 },
      (s) => ({ maintenance_mode: s.maintenance_mode, maintenance_message: s.maintenance_message ?? "" }),
      () => ({ maintenance_mode: false, maintenance_message: "" })),

  // Shopper
  role: (token: string | null) => request<S["Me"]>(`/me`, { token, authed: true }).then((m) => m.role),
  wishlist: (token: string | null, ids: string[] = []) =>
    get<S["Page_ProductCard_"], Paged<ProductCard>>(`/wishlist${qs({ page_size: 100 })}`, { token, authed: true }, (p) => mapPage(p, toCard),
      () => page(demo.products.filter((p) => ids.includes(p.id)), 1, 200)),
  wishAdd: (token: string, productId: string) => request<unknown>(`/wishlist`, { token, method: "POST", body: { product_id: productId }, authed: true }),
  wishRemove: (token: string, productId: string) => request<unknown>(`/wishlist/${enc(productId)}`, { token, method: "DELETE", authed: true }),
  orders: (token: string | null) =>
    get<S["Page_OrderSummary_"], Paged<OrderSummary>>(`/orders`, { token, authed: true },
      (p) => mapPage(p, (o) => ({ id: o.id, number: o.number, status: o.status, created_at: o.created_at, total_cents: o.total_cents, currency: o.currency, item_count: o.item_count })),
      () => page(demo.demoOrders(), 1, 20)),
  order: (token: string | null, id: string) =>
    notFoundToNull(get<S["Order"], Order | null>(`/orders/${enc(id)}`, { token, authed: true }, toOrder, () => demo.demoOrders().find((o) => o.id === id) ?? null)),
  cancelOrder: (token: string | null, id: string) =>
    get<S["Order"], Order>(`/orders/${enc(id)}/cancel`, { token, method: "POST", body: {}, authed: true }, toOrder, () => ({ ...demo.demoOrders()[0], status: "canceled" })),
  tracking: (token: string | null, orderId: string) =>
    notFoundToNull(get<S["Tracking"], Tracking | null>(`/orders/${enc(orderId)}/tracking`, { token, authed: true }, toTracking, () => logi.trackingFor(orderId))),
  checkout: (token: string | null, body: S["CheckoutIn"]) =>
    request<S["CheckoutOut"]>(`/checkout`, { token, method: "POST", body, authed: true }, () => ({
      order_id: demo.demoOrders()[0].id, order_number: demo.demoOrders()[0].number, status: "pending_payment", total_cents: 0, currency: "USD", payment_url: null,
    })),

  // Vendor
  applySeller: (token: string | null, body: S["StoreApplicationIn"]) =>
    request<S["MyStoreRef"]>(`/seller/applications`, { token, method: "POST", body, authed: true }, () => ({ id: "app_demo", slug: body.slug ?? "demo", name: body.store_name, status: "pending" })),
  sellerMe: (token: string | null) =>
    get<S["SellerMe"], SellerProfile>(`/seller/me`, { token, authed: true }, (m) => toSellerProfile(m), () => ({
      store: { ...demo.stores[0], pickup: { lat: 30.2882, lng: -97.7621, label: "Northline Studio, E 6th St" } },
      plan: demo.plans.find((p) => p.code === demo.stores[0].plan) ?? null,
      balance: demo.sellerStats.balance,
      product_limit: 1000,
      active_products: demo.stores[0].product_count,
    })),
  updateStore: (token: string | null, body: S["StoreUpdate"]) =>
    get<S["SellerMe"], SellerProfile>(`/seller/me`, { token, method: "PATCH", body, authed: true }, (m) => toSellerProfile(m), () => ({
      store: { ...demo.stores[0], ...(body as object), pickup: body.pickup ?? null } as SellerProfile["store"],
      plan: null, balance: demo.sellerStats.balance, product_limit: null, active_products: 0,
    })),
  changePlan: (token: string | null, planCode: string) =>
    request<S["SellerMe"]>(`/seller/plan`, { token, method: "POST", body: { plan_code: planCode }, authed: true }, () => ({}) as S["SellerMe"]),
  sellerStats: (token: string | null) =>
    get<S["SellerStats"], SellerStats>(`/seller/stats`, { token, authed: true }, (s) => s, () => demo.sellerStats),
  sellerProducts: (token: string | null) =>
    get<S["Page_SellerProductRow_"], Paged<SellerProductRow>>(`/seller/products${qs({ page_size: 100 })}`, { token, authed: true },
      (p) => mapPage(p, (r) => ({ id: r.id, slug: r.slug, title: r.title, status: r.status, image_url: r.image_url, price_cents: r.price_cents, stock: r.stock, sold_count: r.sold_count })),
      () => {
        const items = demoSearch({ store: demo.stores[0].slug, page_size: 100 }).items;
        return page(items.map((p) => ({ id: p.id, slug: p.slug, title: p.title, status: "active", image_url: null, art: p.art, price_cents: p.price_cents, stock: 12, sold_count: p.sold_count })), 1, 100);
      }),
  createProduct: (token: string | null, body: S["ProductIn"]) =>
    request<S["SellerProduct"]>(`/seller/products`, { token, method: "POST", body, authed: true }, () => ({ id: "p_new", slug: "draft" }) as S["SellerProduct"]),
  /** Publish, hide (draft) or archive a listing. */
  updateProduct: (token: string | null, id: string, body: S["ProductUpdate"]) =>
    request<S["SellerProduct"]>(`/seller/products/${enc(id)}`, { token, method: "PATCH", body, authed: true }, () => ({ id, status: body.status ?? "active" }) as S["SellerProduct"]),
  /**
   * Uploads a product photo: the API hands out a one-time signed URL into the store's own
   * folder in Supabase Storage, the browser sends the file straight there, and we keep the
   * public URL. The API never sees the bytes and the client never picks the path.
   */
  uploadImage: async (token: string | null, file: File): Promise<string> => {
    const types = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
    const type = types.find((t) => t === file.type);
    if (!type) throw new ApiError(422, "Photos must be JPEG, PNG, WebP or AVIF.", "bad_type");
    if (file.size > 5 * 1024 * 1024) throw new ApiError(422, "Photos can be up to 5 MB.", "too_big");
    const name = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80) || "photo";
    const slot = await request<S["UploadOut"]>(`/seller/uploads`, { token, method: "POST", body: { filename: name, content_type: type }, authed: true });
    const target = new URL(slot.upload_url);
    const pub = new URL(slot.public_url);
    if (target.protocol !== "https:" || pub.protocol !== "https:") throw new ApiError(502, "The upload link wasn't secure, so we stopped.", "insecure");
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);
    const res = await fetch(target, { method: "PUT", body: form, headers: { "x-upsert": "false" }, credentials: "omit", referrerPolicy: "no-referrer" });
    if (!res.ok) throw new ApiError(res.status, "The photo didn't upload. Try again.", "upload_failed");
    return pub.toString();
  },
  sellerOrders: (token: string | null) =>
    get<S["Page_StoreOrder_"], Paged<SellerOrder>>(`/seller/orders${qs({ page_size: 100 })}`, { token, authed: true }, (p) => mapPage(p, toSellerOrder),
      () => page(demo.demoOrders().map((o, i): SellerOrder => ({
        id: `so${i}`, order_id: o.id, number: o.number,
        // Cash on delivery starts ready to dispatch; a bank transfer waits for the store to confirm it.
        status: ["processing", "processing", "pending", "delivered", "canceled"][i],
        paid: i === 1 || i === 3, payment_method: ["cod", "bank_transfer", "bank_transfer", "cod", "cod"][i], payment_status: i === 1 || i === 3 ? "paid" : "unpaid",
        total_cents: o.total_cents, payout_cents: Math.round(o.subtotal_cents * 0.92), currency: o.currency,
        ship_to: o.shipping_address, items: o.lines.map((l) => ({ id: l.id, title: l.title, variant_label: l.variant_label, quantity: l.quantity, unit_price_cents: l.unit_price_cents })),
        delivery: i === 3 ? { id: "d1", status: "delivered", rider_name: "Tomás Reyes", rider_vehicle: "motorbike" } : null, created_at: o.created_at,
      })), 1, 50)),
  confirmPayment: (token: string | null, storeOrderId: string) =>
    get<S["StoreOrder"], SellerOrder>(`/seller/orders/${enc(storeOrderId)}/confirm-payment`, { token, method: "POST", body: {}, authed: true }, toSellerOrder,
      () => ({ id: storeOrderId, paid: true, payment_status: "paid", status: "processing" }) as SellerOrder),
  /** Ship by courier instead of a rider (needs a tracking number), or mark a courier parcel delivered. */
  updateSellerOrder: (token: string | null, storeOrderId: string, body: S["StoreOrderUpdate"]) =>
    get<S["StoreOrder"], SellerOrder>(`/seller/orders/${enc(storeOrderId)}`, { token, method: "PATCH", body, authed: true }, toSellerOrder,
      () => ({ id: storeOrderId, status: body.status ?? "processing", tracking_carrier: body.tracking_carrier, tracking_number: body.tracking_number }) as SellerOrder),
  availableRiders: (token: string | null) =>
    get<S["AvailableRider"][], AvailableRider[]>(`/seller/riders/available`, { token, authed: true }, (l) => l, () => logi.availableRiders),
  dispatch: (token: string | null, storeOrderId: string, riderId: string, note?: string) =>
    get<S["StoreOrder"], SellerOrder>(`/seller/orders/${enc(storeOrderId)}/dispatch`, { token, method: "POST", body: { rider_id: riderId, note: note || null }, authed: true }, toSellerOrder,
      () => ({ id: storeOrderId, status: "processing", delivery: { id: "d4", status: "assigned", rider_name: "Rider", rider_vehicle: "" } }) as SellerOrder),
  sellerDeliveries: (token: string | null) =>
    get<S["Page_StoreDelivery_"], Paged<Delivery>>(`/seller/deliveries${qs({ page_size: 100 })}`, { token, authed: true },
      (p) => mapPage(p, (d): Delivery => ({
        id: d.id, order_number: d.order_number, store_name: "", status: d.status,
        pickup: point(d.pickup), dropoff: point(d.dropoff),
        rider: { id: "", name: d.rider_name, vehicle: d.rider_vehicle }, rider_position: position(d.rider_position),
        eta_minutes: null, created_at: d.assigned_at,
      })),
      () => page(logi.deliveries, 1, 100)),
  /** Pull a job back from a rider who hasn't collected it yet. */
  cancelDelivery: (token: string | null, deliveryId: string) =>
    request<unknown>(`/seller/deliveries/${enc(deliveryId)}/cancel`, { token, method: "POST", body: {}, authed: true }, () => ({ ok: true })),
  sellerInventory: (token: string | null) =>
    get<S["Page_InventoryRow_"], Paged<InventoryRow>>(`/seller/inventory${qs({ page_size: 100 })}`, { token, authed: true },
      (p) => mapPage(p, (r) => ({
        variant_id: r.variant_id, product_id: r.product_id, product_title: r.product_title, sku: r.sku,
        label: r.title || Object.values(r.options ?? {}).join(" / "), stock: r.stock, low_stock: r.low_stock,
        price_cents: r.price_cents, reserved: r.reserved, sold_30d: r.sold_30d,
      })),
      () => page(logi.inventory, 1, 500)),
  setStock: (token: string | null, variantId: string, stock: number) =>
    request<unknown>(`/seller/variants/${enc(variantId)}`, { token, method: "PATCH", body: { stock }, authed: true }, () => ({})).then(() => stock),
  bookPlacement: (token: string | null, body: S["PlacementBookingIn"]) =>
    get<S["PlacementBooking"], PlacementBooking>(`/seller/placements`, { token, method: "POST", body, authed: true }, (b) => b,
      () => {
        const slot = demo.placements.find((p) => p.code === body.slot_code);
        const days = Math.round((Date.parse(body.ends_on) - Date.parse(body.starts_on)) / 86400000) + 1;
        return { id: "bk_demo", slot_code: body.slot_code, slot_name: slot?.name ?? body.slot_code, starts_on: body.starts_on, ends_on: body.ends_on, amount_cents: (slot?.daily_price_cents ?? 0) * days, currency: "USD", status: "scheduled", headline: body.headline ?? null };
      }),
  myPlacements: (token: string | null) =>
    get<S["PlacementBooking"][], PlacementBooking[]>(`/seller/placements`, { token, authed: true }, (l) => l, () => []),

  // Rider
  applyRider: (token: string | null, body: S["RiderApplicationIn"]) =>
    get<S["RiderMe"], Rider>(`/rider/applications`, { token, method: "POST", body, authed: true }, toRider, () => ({ ...logi.riders[4], ...body, status: "applicant" }) as Rider),
  riderMe: (token: string | null) => get<S["RiderMe"], Rider>(`/rider/me`, { token, authed: true }, toRider, () => logi.riders[0]),
  riderShift: (token: string | null, online: boolean) =>
    get<S["RiderMe"], Rider>(`/rider/shift`, { token, method: "POST", body: { online }, authed: true }, toRider, () => ({ ...logi.riders[0], on_shift: online })),
  riderDeliveries: (token: string | null) =>
    get<S["Page_RiderDelivery_"], Paged<Delivery>>(`/rider/deliveries${qs({ page_size: 50 })}`, { token, authed: true }, (p) => mapPage(p, toRiderDelivery),
      () => page(logi.deliveries.filter((d) => d.rider?.id === "r1" || d.status === "assigned"), 1, 50)),
  riderAction: (token: string | null, id: string, action: S["DeliveryActionIn"]["action"], extra: { code?: string; note?: string } = {}) =>
    get<S["RiderDelivery"], Delivery>(`/rider/deliveries/${enc(id)}`, { token, method: "PATCH", body: { action, code: extra.code ?? null, note: extra.note ?? null }, authed: true }, toRiderDelivery, () => {
      const d = logi.deliveries.find((x) => x.id === id)!;
      const next = { accept: "accepted", decline: "declined", picked_up: "picked_up", delivered: "delivered", failed: "failed" } as const;
      return { ...d, status: next[action], dropoff: d.dropoff ?? { lat: 30.29, lng: -97.74, label: "2200 Guadalupe St" } };
    }),
  riderLocation: (token: string | null, body: S["LocationIn"]) =>
    request<unknown>(`/rider/location`, { token, method: "POST", body, authed: true }, () => undefined),

  // Admin
  adminStats: (token: string | null) => get<S["AdminStats"], AdminStats>(`/admin/stats`, { token, authed: true }, (s) => s, () => demo.adminStats),
  adminIncome: (token: string | null, period: "7d" | "30d" | "90d" | "365d" = "30d") =>
    get<S["Income"], Income>(`/admin/income${qs({ period })}`, { token, authed: true }, (i) => i, () => logi.incomeFor(Number.parseInt(period, 10))),
  adminStores: (token: string | null) =>
    get<S["Page_AdminStore_"], Paged<AdminStore>>(`/admin/stores${qs({ page_size: 100 })}`, { token, authed: true }, (p) => mapPage(p, (s) => ({ ...s, application: (s.application ?? {}) as Record<string, unknown> })),
      () => page(demo.stores.map((s) => ({
        id: s.id, slug: s.slug, name: s.name, status: s.status ?? "active", plan_code: s.plan ?? "stall", owner_email: `owner@${s.slug}.example`,
        country: s.country, support_email: `hello@${s.slug}.example`,
        application: { business: { legal_name: `${s.name} Ltd`, registration_number: s.status === "pending" ? "RC-204118" : null, website: `https://${s.slug}.example` }, message: "Seller type: company. Departments: Women, Bags & Accessories. Expected orders a month: 50-250" },
        review_note: null, product_count: s.product_count, created_at: s.joined_at,
      })), 1, 100)),
  adminUpdateStore: (token: string | null, id: string, body: S["AdminStoreUpdate"]) =>
    get<S["AdminStore"], Partial<AdminStore>>(`/admin/stores/${enc(id)}`, { token, method: "PATCH", body, authed: true }, (s) => ({ ...s, application: (s.application ?? {}) as Record<string, unknown> }), () => ({ id, ...body } as Partial<AdminStore>)),
  adminRiders: (token: string | null) =>
    get<S["Page_AdminRider_"], Paged<Rider>>(`/admin/riders${qs({ page_size: 100 })}`, { token, authed: true }, (p) => mapPage(p, toRider), () => page(logi.riders.filter((r) => r.status !== "applicant"), 1, 200)),
  adminRiderApplications: (token: string | null) =>
    get<S["Page_AdminRider_"], Paged<Rider>>(`/admin/rider-applications${qs({ page_size: 100 })}`, { token, authed: true }, (p) => mapPage(p, toRider), () => page(logi.riders.filter((r) => r.status === "applicant"), 1, 200)),
  adminUpdateRider: (token: string | null, id: string, status: S["AdminRiderUpdate"]["status"], review_note?: string) =>
    get<S["AdminRider"], Rider>(`/admin/riders/${enc(id)}`, { token, method: "PATCH", body: { status, review_note: review_note ?? null }, authed: true }, toRider, () => ({ ...logi.riders.find((r) => r.id === id)!, status })),
  /** Marks all of a rider's unpaid earnings as paid, after you've paid them outside the app. */
  adminSettleRider: (token: string | null, id: string) =>
    request<{ rider_id: string; paid_cents: number }>(`/admin/riders/${enc(id)}/settle`, { token, method: "POST", body: {}, authed: true }, () => ({ rider_id: id, paid_cents: 18450 })),
  adminLive: (token: string | null) =>
    get<S["LiveMap"], { deliveries: Delivery[]; riders: LiveRider[] }>(`/admin/deliveries`, { token, authed: true }, toLive, () => ({ deliveries: logi.deliveries, riders: logi.liveRiders })),
  adminSlots: (token: string | null) =>
    get<S["PlacementSlot"][], PlacementSlot[]>(`/admin/placement-slots`, { token, authed: true }, (l) => l.map(toSlot), () => demo.placements),
  adminUpdateSlot: (token: string | null, id: string, body: S["SlotUpdate"]) =>
    get<S["PlacementSlot"], PlacementSlot>(`/admin/placement-slots/${enc(id)}`, { token, method: "PATCH", body, authed: true }, toSlot, () => ({ ...demo.placements.find((p) => p.id === id)!, ...(body as object) }) as PlacementSlot),
  adminPlans: (token: string | null) =>
    get<S["Plan"][], Plan[]>(`/admin/plans`, { token, authed: true }, (l) => l.map(toPlan), () => demo.plans),
  adminUpdatePlan: (token: string | null, id: string, body: S["PlanUpdate"]) =>
    get<S["Plan"], Plan>(`/admin/plans/${enc(id)}`, { token, method: "PATCH", body, authed: true }, (p) => toPlan(p, -1, []), () => ({ ...demo.plans.find((p) => p.id === id)!, ...(body as object) }) as Plan),
  adminOrders: (token: string | null) =>
    get<S["Page_AdminOrder_"], Paged<AdminOrder>>(`/admin/orders${qs({ page_size: 100 })}`, { token, authed: true }, (p) => mapPage(p, (o) => o),
      () => page(demo.demoOrders().map((o) => ({ id: o.id, number: o.number, status: o.status, total_cents: o.total_cents, currency: o.currency, item_count: o.item_count, created_at: o.created_at, customer_email: o.customer_email ?? null, stores: new Set(o.lines.map((l) => l.store_slug)).size })), 1, 50)),
  adminMarkPaid: (token: string | null, id: string) =>
    request<S["Order"]>(`/admin/orders/${enc(id)}/mark-paid`, { token, method: "POST", body: {}, authed: true }, () => ({}) as S["Order"]),
  adminCancelOrder: (token: string | null, id: string) =>
    request<S["Order"]>(`/admin/orders/${enc(id)}/cancel`, { token, method: "POST", body: {}, authed: true }, () => ({}) as S["Order"]),
  adminSettings: (token: string | null) =>
    get<S["SiteSettings"], Settings>(`/admin/settings`, { token, authed: true }, (s) => ({ ...s, maintenance_message: s.maintenance_message ?? "" }), () => logi.settings),
  adminUpdateSettings: (token: string | null, body: S["SiteSettingsUpdate"]) =>
    get<S["SiteSettings"], Settings>(`/admin/settings`, { token, method: "PATCH", body, authed: true }, (s) => ({ ...s, maintenance_message: s.maintenance_message ?? "" }), () => ({ ...logi.settings, ...(body as object) }) as Settings),
};
