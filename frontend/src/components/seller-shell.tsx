"use client";
import { Box, Chart, Grid, Megaphone, Settings, Truck, Wallet } from "./icons";
import { DashShell } from "./dash";

const nav = [
  { href: "/seller", label: "Overview", icon: <Chart size={18} /> },
  { href: "/seller/orders", label: "Orders & payments", icon: <Wallet size={18} /> },
  { href: "/seller/deliveries", label: "Dispatch & map", icon: <Truck size={18} /> },
  { href: "/seller/inventory", label: "Inventory", icon: <Box size={18} /> },
  { href: "/seller/products", label: "Products", icon: <Grid size={18} /> },
  { href: "/seller/space", label: "Store space", icon: <Megaphone size={18} /> },
  { href: "/seller/settings", label: "Storefront", icon: <Settings size={18} /> },
];

export function SellerShell({ children }: { children: React.ReactNode }) {
  return <DashShell title="Vendor" tone="market" nav={nav}>{children}</DashShell>;
}
