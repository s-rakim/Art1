// Shapes agreed with the backend. Money is always integer cents plus a currency code.

export type Money = { amount_cents: number; currency: string };

export type Paged<T> = { items: T[]; total: number; page: number; page_size: number };

export type Category = {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
  product_count?: number;
};

export type PriceTier = { min_qty: number; price_cents: number };

export type Variant = {
  id: string;
  sku: string;
  color?: string;
  color_hex?: string;
  size?: string;
  price_cents: number;
  compare_at_cents?: number | null;
  stock: number;
};

export type StoreSummary = {
  id: string;
  slug: string;
  name: string;
  verified: boolean;
  rating: number;
  plan: PlanTier;
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
  created_at: string;
};

export type Product = ProductCard & {
  description: string;
  images: string[];
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
  variant_label?: string;
  verified_purchase: boolean;
};

export type PlanTier = "stall" | "shopfront" | "flagship";

export type Store = StoreSummary & {
  tagline: string;
  description: string;
  banner_color: string;
  accent_color: string;
  country: string;
  joined_at: string;
  response_rate: number;
  on_time_rate: number;
  follower_count: number;
  product_count: number;
  status: "pending" | "active" | "suspended";
};

export type Plan = {
  id: PlanTier;
  name: string;
  monthly_price_cents: number;
  commission_rate: number; // 0.08 = 8%
  product_limit: number | null;
  features: string[];
  highlighted?: boolean;
};

export type Placement = {
  id: string;
  name: string;
  location: string;
  weekly_price_cents: number;
  slots_total: number;
  slots_taken: number;
  description: string;
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

export type OrderStatus = "pending" | "paid" | "packed" | "shipped" | "delivered" | "cancelled" | "refunded";

export type Order = {
  id: string;
  number: string;
  status: OrderStatus;
  created_at: string;
  total_cents: number;
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  currency: string;
  lines: Array<Omit<CartLine, "id"> & { id: string }>;
  shipping_address: Address;
  events: Array<{ status: OrderStatus; at: string; note?: string }>;
  customer_email?: string;
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
};

export type SellerStats = {
  revenue_30d_cents: number;
  orders_30d: number;
  conversion_rate: number;
  visitors_30d: number;
  pending_payout_cents: number;
  daily: Array<{ date: string; revenue_cents: number; orders: number }>;
};

export type AdminStats = {
  gmv_30d_cents: number;
  rent_mrr_cents: number;
  commission_30d_cents: number;
  active_stores: number;
  pending_applications: number;
  open_disputes: number;
};

// Visual stand-in for a product photo when the seller hasn't uploaded one.
export type ProductArt = { shape: ArtShape; bg: string; fg: string };
export type ArtShape =
  | "dress" | "tee" | "sneaker" | "bag" | "lamp" | "mug" | "headphones"
  | "chair" | "plant" | "watch" | "jacket" | "glasses" | "bottle" | "phone";

export type Role = "customer" | "vendor" | "rider" | "admin";

export type LatLng = { lat: number; lng: number };

export type Rider = {
  id: string;
  full_name: string;
  phone_masked: string;
  vehicle: "bicycle" | "motorbike" | "car" | "van";
  city: string;
  status: "applied" | "active" | "suspended" | "rejected";
  on_shift: boolean;
  rating: number;
  deliveries_completed: number;
  position?: (LatLng & { at: string }) | null;
  applied_at: string;
};

export type DeliveryStatus = "awaiting_rider" | "assigned" | "accepted" | "picked_up" | "delivered" | "failed";

export type Delivery = {
  id: string;
  order_id: string;
  order_number: string;
  store_name: string;
  status: DeliveryStatus;
  pickup: LatLng & { label: string };
  dropoff: LatLng & { label: string };
  rider: Pick<Rider, "id" | "full_name" | "phone_masked" | "vehicle"> | null;
  rider_position: (LatLng & { at: string }) | null;
  eta_minutes: number | null;
  fee_cents: number;
  items: number;
  created_at: string;
};

export type Tracking = {
  status: DeliveryStatus;
  eta_minutes: number | null;
  rider: Delivery["rider"];
  rider_position: Delivery["rider_position"];
  pickup: Delivery["pickup"];
  dropoff: Delivery["dropoff"];
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
};

export type Income = {
  rent_cents: number;
  commission_cents: number;
  placement_cents: number;
  delivery_fee_cents: number;
  daily: Array<{ date: string; rent_cents: number; commission_cents: number; placement_cents: number }>;
};

export type Settings = {
  maintenance_mode: boolean;
  maintenance_message: string;
  vendor_signups_open: boolean;
  rider_signups_open: boolean;
};
