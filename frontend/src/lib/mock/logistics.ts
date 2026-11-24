// Demo riders, deliveries and income for the dispatch and tracking screens.
import type { AvailableRider, Delivery, Income, InventoryRow, LiveRider, Rider, Settings, Tracking } from "../types";
import { demoOrders, products, stores } from "./data";

const now = Date.UTC(2026, 10, 24, 15, 0);
const CENTER = { lat: 30.2672, lng: -97.7431 };
const at = (mins: number) => new Date(now - mins * 60000).toISOString();
const off = (dLat: number, dLng: number) => ({ lat: CENTER.lat + dLat, lng: CENTER.lng + dLng });

export const riders: Rider[] = [
  { id: "r1", full_name: "Tomás Reyes", phone: "+1 512 555 4410", vehicle: "motorbike", city: "Austin", status: "active", on_shift: true, deliveries_completed: 1284, active_deliveries: 1, earnings_cents: 1_920_400, unpaid_earnings_cents: 48_300, position: { ...off(0.012, -0.006), at: at(1) }, applied_at: "2025-02-03" },
  { id: "r2", full_name: "Keisha Grant", phone: "+1 512 555 0192", vehicle: "car", city: "Austin", status: "active", on_shift: true, deliveries_completed: 932, active_deliveries: 1, position: { ...off(-0.018, 0.014), at: at(2) }, applied_at: "2025-04-17" },
  { id: "r3", full_name: "Ade Balogun", phone: "+1 512 555 7783", vehicle: "bicycle", city: "Austin", status: "active", on_shift: false, deliveries_completed: 410, active_deliveries: 0, position: null, applied_at: "2025-08-30" },
  { id: "r4", full_name: "Lina Park", phone: "+1 512 555 3301", vehicle: "van", city: "Austin", status: "active", on_shift: true, deliveries_completed: 2011, active_deliveries: 1, position: { ...off(0.004, 0.022), at: at(0) }, applied_at: "2024-11-12" },
  { id: "r5", full_name: "Marcus Hale", phone: "+1 512 555 5521", vehicle: "motorbike", city: "Austin", status: "applicant", on_shift: false, deliveries_completed: 0, active_deliveries: 0, position: null, applied_at: "2026-11-21" },
  { id: "r6", full_name: "Yuki Tanaka", phone: "+1 737 555 9034", vehicle: "on_foot", city: "Round Rock", status: "applicant", on_shift: false, deliveries_completed: 0, active_deliveries: 0, position: null, applied_at: "2026-11-23" },
];

const orders = demoOrders();
const rider = (r: Rider) => ({ id: r.id, name: r.full_name.split(" ")[0], vehicle: r.vehicle });

export const deliveries: Delivery[] = [
  { id: "d1", order_id: orders[0].id, order_number: orders[0].number, store_name: stores[0].name, status: "picked_up", pickup: { ...off(0.021, -0.019), label: "Northline Studio, E 6th St" }, dropoff: { ...off(-0.006, 0.011), label: "12 Market Row" }, rider: rider(riders[0]), rider_position: riders[0].position, eta_minutes: 14, fee_cents: 699, cash_to_collect_cents: 0, customer_name: "Ada", customer_phone: "+1 ••• ••• 2201", items: 3, created_at: at(55) },
  { id: "d2", order_id: orders[2].id, order_number: orders[2].number, store_name: stores[1].name, status: "accepted", pickup: { ...off(-0.025, 0.004), label: "Kiln & Co, S Congress" }, dropoff: { ...off(-0.03, 0.03), label: "88 Riverside Dr" }, rider: rider(riders[1]), rider_position: riders[1].position, eta_minutes: 32, fee_cents: 899, cash_to_collect_cents: 4_598, customer_name: "Cleo", items: 1, created_at: at(30) },
  { id: "d3", order_id: "o1099", order_number: "SR-20999", store_name: stores[2].name, status: "awaiting_rider", pickup: { ...off(0.03, 0.02), label: "Volt Depot warehouse" }, dropoff: { ...off(0.01, -0.03), label: "401 W 2nd St" }, rider: null, rider_position: null, eta_minutes: null, fee_cents: 599, items: 2, created_at: at(8) },
  { id: "d4", order_id: "o1100", order_number: "SR-21036", store_name: stores[0].name, status: "assigned", pickup: { ...off(0.021, -0.019), label: "Northline Studio, E 6th St" }, dropoff: null, rider: rider(riders[3]), rider_position: riders[3].position, eta_minutes: 41, fee_cents: 799, cash_to_collect_cents: 7_400, items: 1, created_at: at(4) },
];

export const liveRiders: LiveRider[] = riders
  .filter((r) => r.status === "active" && r.on_shift && r.position)
  .map((r) => ({ id: r.id, name: r.full_name, vehicle: r.vehicle, lat: r.position!.lat, lng: r.position!.lng, busy: r.active_deliveries > 0 }));

export const availableRiders: AvailableRider[] = riders
  .filter((r) => r.status === "active" && r.on_shift)
  .map((r, i) => ({ id: r.id, name: r.full_name, vehicle: r.vehicle, distance_km: 1.2 + i * 1.7, eta_to_store_minutes: 6 + i * 5, active_deliveries: r.active_deliveries }));

export function trackingFor(orderId: string): Tracking {
  const d = deliveries.find((x) => x.order_id === orderId) ?? deliveries[0];
  const track = {
    delivery_id: d.id,
    store_name: d.store_name,
    status: d.status,
    eta_minutes: d.eta_minutes,
    rider: d.rider ? { name: d.rider.name, phone_masked: "+1 ••• ••• 4410", vehicle: d.rider.vehicle } : null,
    rider_position: d.rider_position,
    pickup: d.pickup,
    dropoff: d.dropoff,
    handover_code: d.status === "accepted" || d.status === "picked_up" ? "482913" : null,
  };
  return { ...track, order_status: "paid", deliveries: [track] };
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
      reserved: v.stock > 3 ? 1 : 0,
      sold_30d: (v.stock * 3) % 17,
    })),
  );

export function incomeFor(days: number): Income {
  const daily = Array.from({ length: days }, (_, i) => {
    const d = new Date(now - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
    const wobble = Math.sin(i / 3) * 0.2 + 1;
    return {
      date: d,
      rent_cents: Math.round(42880 * (i % 7 === 0 ? 1.6 : 1)),
      commission_cents: Math.round(130000 * wobble + i * 900),
      fee_cents: Math.round(12000 * wobble),
      placement_cents: Math.round(i % 7 === 1 ? 260000 : 18000 * wobble),
      delivery_fee_cents: Math.round(38000 * wobble),
    };
  });
  const sum = (k: "rent_cents" | "commission_cents" | "fee_cents" | "placement_cents" | "delivery_fee_cents") => daily.reduce((a, d) => a + d[k], 0);
  const rider_cost_cents = Math.round(sum("delivery_fee_cents") * 0.8);
  const parts = sum("rent_cents") + sum("commission_cents") + sum("fee_cents") + sum("placement_cents") + sum("delivery_fee_cents");
  return {
    daily,
    period_days: days,
    rent_cents: sum("rent_cents"),
    commission_cents: sum("commission_cents"),
    fee_cents: sum("fee_cents"),
    placement_cents: sum("placement_cents"),
    delivery_fee_cents: sum("delivery_fee_cents"),
    rider_cost_cents,
    total_cents: parts - rider_cost_cents,
  };
}

export const income = incomeFor(30);

export const settings: Settings = {
  maintenance_mode: false,
  maintenance_message: "We're tidying the aisles. Back shortly.",
  vendor_signups_open: true,
  rider_signups_open: true,
};
