"use client";
import { Chart, Megaphone, Settings, Store, Truck, User, Wallet } from "./icons";
import { DashShell } from "./dash";

const nav = [
  { href: "/admin", label: "Income", icon: <Chart size={18} /> },
  { href: "/admin/stores", label: "Stores", icon: <Store size={18} /> },
  { href: "/admin/space", label: "Store space", icon: <Megaphone size={18} /> },
  { href: "/admin/riders", label: "Riders", icon: <User size={18} /> },
  { href: "/admin/deliveries", label: "Live deliveries", icon: <Truck size={18} /> },
  { href: "/admin/orders", label: "Orders", icon: <Wallet size={18} /> },
  { href: "/admin/maintenance", label: "Maintenance", icon: <Settings size={18} /> },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return <DashShell title="Admin" tone="ink" nav={nav}>{children}</DashShell>;
}
