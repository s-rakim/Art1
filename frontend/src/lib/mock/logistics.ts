// Demo riders, deliveries and income for the dispatch and tracking screens.
import type { Delivery, Income, InventoryRow, Rider, Settings } from "../types";
import { demoOrders, products, stores } from "./data";

const now = Date.UTC(2026, 10, 24, 15, 0);
export const MAP_CENTER = { lat: 30.2672, lng: -97.7431 };
const at = (mins: number) => new Date(now - mins * 60000).toISOString();
const off = (dLat: number, dLng: number) => ({ lat: MAP_CENTER.lat + dLat, lng: MAP_CENTER.lng + dLng });

export const riders: Rider[] = [
  { id: "r1", full_name: "Tomás Reyes", phone_masked: "+1 ••• ••• 4410", vehicle: "motorbike", city: "Austin", status: "active", on_shift: true, rating: 4.9, deliveries_completed: 1284, position: { ...off(0.012, -0.006), at: at(1) }, applied_at: "2025-02-03" },
  { id: "r2", full_name: "Keisha Grant", phone_masked: "+1 ••• ••• 0192", vehicle: "car", city: "Austin", status: "active", on_shift: true, rating: 4.8, deliveries_completed: 932, position: { ...off(-0.018, 0.014), at: at(2) }, applied_at: "2025-04-17" },
  { id: "r3", full_name: "Ade Balogun", phone_masked: "+1 ••• ••• 7783", vehicle: "bicycle", city: "Austin", status: "active", on_shift: false, rating: 4.7, deliveries_completed: 410, position: null, applied_at: "2025-08-30" },
  { id: "r4", full_name: "Lina Park", phone_masked: "+1 ••• ••• 3301", vehicle: "van", city: "Austin", status: "active", on_shift: true, rating: 4.95, deliveries_completed: 2011, position: { ...off(0.004, 0.022), at: at(0) }, applied_at: "2024-11-12" },
  { id: "r5", full_name: "Marcus Hale", phone_masked: "+1 ••• ••• 5521", vehicle: "motorbike", city: "Austin", status: "applied", on_shift: false, rating: 0, deliveries_completed: 0, position: null, applied_at: "2026-11-21" },
  { id: "r6", full_name: "Yuki Tanaka", phone_masked: "+1 ••• ••• 9034", vehicle: "bicycle", city: "Round Rock", status: "applied", on_shift: false, rating: 0, deliveries_completed: 0, position: null, applied_at: "2026-11-23" },
];

const orders = demoOrders();
const rider = (r: Rider) => ({ id: r.id, full_name: r.full_name, phone_masked: r.phone_masked, vehicle: r.vehicle });

export const deliveries: Delivery[] = [
  { id: "d1", order_id: orders[0].id, order_number: orders[0].number, store_name: stores[0].name, status: "picked_up", pickup: { ...off(0.021, -0.019), label: "Northline Studio, E 6th St" }, dropoff: { ...off(-0.006, 0.011), label: "12 Market Row" }, rider: rider(riders[0]), rider_position: riders[0].position!, eta_minutes: 14, fee_cents: 699, items: 3, created_at: at(55) },
  { id: "d2", order_id: orders[2].id, order_number: orders[2].number, store_name: stores[1].name, status: "accepted", pickup: { ...off(-0.025, 0.004), label: "Kiln & Co, S Congress" }, dropoff: { ...off(-0.03, 0.03), label: "88 Riverside Dr" }, rider: rider(riders[1]), rider_position: riders[1].position!, eta_minutes: 32, fee_cents: 899, items: 1, created_at: at(30) },
  { id: "d3", order_id: "o1099", order_number: "SR-20999", store_name: stores[2].name, status: "awaiting_rider", pickup: { ...off(0.03, 0.02), label: "Volt Depot warehouse" }, dropoff: { ...off(0.01, -0.03), label: "401 W 2nd St" }, rider: null, rider_position: null, eta_minutes: null, fee_cents: 599, items: 2, created_at: at(8) },
  { id: "d4", order_id: "o1100", order_number: "SR-21036", store_name: stores[0].name, status: "assigned", pickup: { ...off(0.021, -0.019), label: "Northline Studio, E 6th St" }, dropoff: { ...off(0.035, -0.002), label: "2200 Guadalupe St" }, rider: rider(riders[3]), rider_position: riders[3].position!, eta_minutes: 41, fee_cents: 799, items: 1, created_at: at(4) },
];

export function trackingFor(orderId: string) {
  const d = deliveries.find((x) => x.order_id === orderId) ?? deliveries[0];
  return { status: d.status, eta_minutes: d.eta_minutes, rider: d.rider, rider_position: d.rider_position, pickup: d.pickup, dropoff: d.dropoff };
}

export const inventory: InventoryRow[] = products
  .filter((p) => p.store.slug === stores[0].slug)
  .flatMap((p) =>
    p.variants.slice(0, 4).map((v) => ({
      variant_id: v.id,
      product_id: p.id,
      product_title: p.title,
      sku: v.sku,
      label: [v.color, v.size].filter(Boolean).join(" / "),
      stock: v.stock,
      low_stock: v.stock < 5,
      price_cents: v.price_cents,
    })),
  );

export const income: Income = (() => {
  const daily = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now - (29 - i) * 86400000).toISOString().slice(0, 10);
    const wobble = Math.sin(i / 3) * 0.2 + 1;
    return {
      date: d,
      rent_cents: Math.round(42880 * (i % 7 === 0 ? 1.6 : 1)),
      commission_cents: Math.round(130000 * wobble + i * 900),
      placement_cents: Math.round(i % 7 === 1 ? 260000 : 18000 * wobble),
    };
  });
  const sum = (k: "rent_cents" | "commission_cents" | "placement_cents") => daily.reduce((a, d) => a + d[k], 0);
  return { daily, rent_cents: sum("rent_cents"), commission_cents: sum("commission_cents"), placement_cents: sum("placement_cents"), delivery_fee_cents: 1_184_300 };
})();

export const settings: Settings = {
  maintenance_mode: false,
  maintenance_message: "We're tidying the aisles. Back shortly.",
  vendor_signups_open: true,
  rider_signups_open: true,
};
