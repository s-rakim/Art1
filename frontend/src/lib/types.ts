// View models the UI renders. Backend responses (see openapi.ts, generated from
// backend/openapi.json) are mapped into these in api.ts, and the demo data in
// lib/mock is written in these shapes directly. Money is integer cents.

export type Paged<T> = { items: T[]; total: number; page: number; page_size: number };

export type Category = { id: string; slug: string; name: string; parent_id: string | null; image_url?: string | null };

export type PriceTier = { min_qty: number; price_cents: number };

export type Variant = {
  id: string;
  sku: string;
  title?: string;
  color?: string;
  color_hex?: string;
  size?: string;
  price_cents: number;
  compare_at_cents?: number | null;
  stock: number;
  min_order_qty?: number;
};

export type StoreSummary = {
  id: string;
  slug: string;
  name: string;
  verified?: boolean;
  rating?: number;
  plan?: string;
};

export type ProductCard = {
  id: string;
  slug: string;
  title: string;
  price_cents: number;
  compare_at_cents?: number | null;
  currency: string;
  image_url?: string | null;
  art?: ProductArt;
  rating: number;
  review_count: number;
  sold_count: number;
  store: StoreSummary;
  category_slug: string;
  badges?: string[];
  colors?: string[];
  created_at?: string;
  sponsored?: boolean;
};

/** One clip per product, shown next to the photos. Played only when the shopper taps play. */
export type ProductVideo = {
  id: string;
  url: string;
  poster_url: string | null;
  content_type: string;
  duration_s: number | null;
  caption: string | null;
};

export type Product = ProductCard & {
  description: string;
  images: string[];
  image_alts?: (string | null)[];
  video?: ProductVideo | null;
  variants: Variant[];
  price_tiers?: PriceTier[];
  specs?: Record<string, string>;
  ships_from?: string;
  delivery_days?: [number, number];
  rating_breakdown?: Record<1 | 2 | 3 | 4 | 5, number>;
};

export type Review = {
  id: string;
  author: string;
  rating: number;
  title: string;
  body: string;
  created_at: string;
  verified_purchase: boolean;
};

export type Store = StoreSummary & {
  tagline: string;
  description: string;
  banner_color: string;
  accent_color: string;
  logo_url?: string | null;
  country: string;
  joined_at: string;
  rating: number;
  review_count?: number;
  product_count: number;
  response_rate?: number;
  on_time_rate?: number;
  follower_count?: number;
  status?: string;
};

/**
 * A stall plan. The public list (GET /plans) carries no prices: rent and commission are agreed
 * with the market team, so those fields are null there. Admin and seller reads include them.
 */
export type Plan = {
  id: string; // backend row id, used for admin edits
  code: string; // stable code, used in URLs and applications
  name: string;
  description?: string | null;
  monthly_price_cents: number | null;
  commission_rate: number | null; // 0.08 = 8%
  per_item_fee_cents?: number | null;
  product_limit: number | null;
  featured_slots?: number;
  features: string[];
  highlighted?: boolean;
  price_on_request?: boolean;
};

/** A kind of rentable space (homepage shelf, category banner…), sold by the day. */
export type PlacementSlot = {
  id: string;
  code: string;
  name: string;
  location: string;
  description: string;
  daily_price_cents: number;
  capacity: number;
  booked?: number;
  is_active?: boolean;
};

/** A live booking shown on the storefront. */
export type BookedPlacement = {
  id: string;
  slot_code: string;
  location: string;
  headline: string | null;
  store: { slug: string; name: string };
  product: ProductCard | null;
};

export type PlacementBooking = {
  id: string;
  slot_code: string;
  slot_name: string;
  starts_on: string;
  ends_on: string;
  amount_cents: number;
  credits_used?: number;
  currency?: string;
  status: string;
  product_id?: string | null;
  headline: string | null;
};

export type CartLine = {
  id: string; // product_id:variant_id
  product_id: string;
  variant_id: string;
  slug: string;
  title: string;
  variant_label: string;
  unit_price_cents: number;
  quantity: number;
  store_slug: string;
  store_name: string;
  image_url?: string | null;
  art?: ProductArt;
};

export type OrderLine = {
  id: string;
  product_id?: string | null;
  slug?: string | null;
  title: string;
  variant_label: string;
  unit_price_cents: number;
  quantity: number;
  store_slug: string;
  store_name: string;
  image_url?: string | null;
  art?: ProductArt;
};

export type OrderSummary = {
  id: string;
  number: string;
  status: string;
  created_at: string;
  total_cents: number;
  currency: string;
  item_count: number;
  lines?: OrderLine[];
};

export type Order = OrderSummary & {
  subtotal_cents: number;
  discount_cents?: number;
  shipping_cents: number;
  tax_cents: number;
  lines: OrderLine[];
  shipping_address: Partial<Address>;
  events: Array<{ status: string; at: string }>;
  payment_provider?: string | null;
  customer_email?: string | null;
};

export type Address = {
  full_name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  phone?: string;
  lat?: number | null;
  lng?: number | null;
};

export type Balance = { balance_cents: number; available_cents: number; pending_cents: number };

export type SellerProfile = {
  store: Store & {
    pickup: (LatLng & { label?: string | null; city?: string | null }) | null;
    support_email?: string | null;
    review_note?: string | null;
  };
  plan: Plan | null;
  subscription?: { status: string; current_period_end: string; cancel_at_period_end: boolean } | null;
  balance: Balance;
  product_limit: number | null;
  active_products: number;
};

export type SellerStats = {
  sales_cents_30d: number;
  orders_30d: number;
  units_30d: number;
  average_order_cents: number;
  to_ship: number;
  active_products: number;
  rating: number;
  review_count: number;
  balance: Balance;
  daily: Array<{ date: string; sales_cents: number; orders: number }>;
  top_products: Array<{ id: string; slug: string; title: string; units: number; sales_cents: number }>;
};

/** One store's share of a customer order. Payment confirmation and dispatch act on this id. */
export type SellerOrder = {
  id: string;
  order_id: string;
  number: string;
  status: string;
  paid: boolean;
  payment_method: string;
  payment_status: string;
  total_cents: number;
  payout_cents: number;
  currency: string;
  ship_to: Partial<Address>;
  items: Array<{ id: string; title: string; variant_label: string; quantity: number; unit_price_cents: number }>;
  delivery: { id: string; status: string; rider_name: string; rider_vehicle: string } | null;
  tracking_carrier?: string | null;
  tracking_number?: string | null;
  created_at: string;
};

export type SellerProductRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  image_url: string | null;
  art?: ProductArt;
  price_cents: number | null;
  stock: number;
  sold_count: number;
};

export type InventoryRow = {
  variant_id: string;
  product_id: string;
  product_title: string;
  sku: string;
  label: string;
  stock: number;
  low_stock: boolean;
  price_cents: number;
  reserved?: number;
  sold_30d?: number;
};

export type AvailableRider = {
  id: string;
  name: string;
  vehicle: string;
  distance_km: number | null;
  eta_to_store_minutes: number | null;
  active_deliveries: number;
};

export type Role = "customer" | "vendor" | "rider" | "admin";

export type LatLng = { lat: number; lng: number };
export type MapPoint = LatLng & { label?: string | null };

export type Rider = {
  id: string;
  full_name: string;
  phone: string;
  email?: string | null;
  vehicle: string;
  city: string;
  status: "applicant" | "active" | "suspended" | "rejected" | string;
  on_shift: boolean;
  deliveries_completed: number;
  active_deliveries: number;
  earnings_cents?: number;
  unpaid_earnings_cents?: number;
  position: (LatLng & { at: string | null; heading?: number | null }) | null;
  applied_at: string;
  /** Vendor view: how far the rider is from the shop right now. */
  distance_km?: number | null;
  eta_to_store_minutes?: number | null;
  review_note?: string | null;
  licence_number?: string | null;
  /** Vendor view: why this rider is listed (carrying an order now, delivered lately, or just near). */
  relation?: "on_job" | "recent" | "nearby";
  /** Vendor view: this rider's latest jobs for the store. */
  jobs?: { delivery_id: string; order_number: string; status: string; assigned_at: string; delivered_at: string | null }[];
};

export type DeliveryStatus = "awaiting_rider" | "assigned" | "accepted" | "declined" | "picked_up" | "delivered" | "failed" | "canceled";

export type Delivery = {
  id: string;
  order_id?: string;
  order_number: string;
  store_name: string;
  status: DeliveryStatus | string;
  pickup: MapPoint | null;
  dropoff: MapPoint | null;
  dropoff_address?: string | null;
  rider: { id: string; name: string; vehicle: string } | null;
  rider_position: (LatLng & { at: string | null; heading?: number | null; speed_kmh?: number | null }) | null;
  eta_minutes: number | null;
  fee_cents?: number;
  cash_to_collect_cents?: number;
  customer_name?: string | null;
  customer_phone?: string | null;
  items?: number;
  created_at: string;
};

export type LiveRider = { id: string; name: string; vehicle: string; lat: number | null; lng: number | null; busy: boolean; heading?: number | null };

export type DeliveryTrack = {
  delivery_id: string | null;
  store_name: string;
  status: string;
  eta_minutes: number | null;
  rider: { name: string; phone_masked: string | null; vehicle: string } | null;
  rider_position: (LatLng & { at: string | null; heading?: number | null; speed_kmh?: number | null }) | null;
  pickup: MapPoint | null;
  dropoff: MapPoint | null;
  handover_code: string | null;
};

export type Tracking = DeliveryTrack & { order_status: string; deliveries: DeliveryTrack[] };

export type AdminStats = {
  gmv_cents_30d: number;
  orders_30d: number;
  commission_cents_30d: number;
  fees_cents_30d: number;
  rent_cents_30d: number;
  placement_cents_30d: number;
  rent_mrr_cents: number;
  active_stores: number;
  pending_stores: number;
  customers: number;
  active_products: number;
  payouts_requested_cents: number;
};

export type Income = {
  period_days: number;
  rent_cents: number;
  commission_cents: number;
  fee_cents: number;
  placement_cents: number;
  delivery_fee_cents: number;
  rider_cost_cents: number;
  total_cents: number;
  daily: Array<{ date: string; rent_cents: number; commission_cents: number; fee_cents: number; placement_cents: number; delivery_fee_cents: number }>;
};

export type AdminStore = {
  id: string;
  slug: string;
  name: string;
  status: string;
  plan_code: string;
  owner_email: string | null;
  country: string | null;
  support_email?: string | null;
  application: Record<string, unknown>;
  review_note: string | null;
  product_count: number;
  created_at: string;
  approved_at?: string | null;
};

export type AdminOrder = {
  id: string;
  number: string;
  status: string;
  total_cents: number;
  currency: string;
  item_count: number;
  created_at: string;
  customer_email: string | null;
  stores: number;
};

/** Delivery fees, all set by the admin. Null means "not set", and the app shows no amount. */
export type Fees = {
  currency: string;
  standard_shipping_cents: number | null;
  express_shipping_cents: number | null;
  /** A store's items above this ship free with standard delivery. Null: never free. */
  free_shipping_over_cents: number | null;
  /** What the rider is paid per delivery. */
  rider_fee_cents: number | null;
  /** 0.075 = 7.5%. Null: no tax added. */
  tax_rate: number | null;
};

/** Who would-be vendors talk to about renting a stall. Set by the admin. */
export type Contact = {
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  contact_note: string | null;
};

/** Public site state every page can read: maintenance switch, fees and the market contact. */
export type SiteInfo = { maintenance_mode: boolean; maintenance_message: string } & Fees & Contact;

export type Settings = {
  maintenance_mode: boolean;
  maintenance_message: string;
  vendor_signups_open: boolean;
  rider_signups_open: boolean;
} & Partial<Fees & Contact>;

// Visual stand-in for a product photo when the seller hasn't uploaded one.
export type ProductArt = { shape: ArtShape; bg: string; fg: string };
export type ArtShape =
  | "dress" | "tee" | "sneaker" | "bag" | "lamp" | "mug" | "headphones"
  | "chair" | "plant" | "watch" | "jacket" | "glasses" | "bottle" | "phone";
