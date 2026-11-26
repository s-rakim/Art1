import type { ReactNode } from "react";
import {
  AdminIcon, Archive, ArrowLeft, Bike, Cash, Chart, Fire, Grid, Heart, Help, Home, List, Megaphone, Message, Receipt, Settings, Sparkle,
  Store, Tools, Truck, User, Wallet, Box,
} from "@/components/icons";

// Every place the app links between its areas reads from this file: the side column inside
// each area and the menu in the header. Change a label or a route here and both follow.

export type NavItem = { href: string; label: string; icon?: ReactNode; count?: number; exact?: boolean; blurb?: string };
export type NavSection = { caption?: string; items: NavItem[] };
export type Area = { key: "vendor" | "rider" | "admin"; label: string; title: string; href: string; role: string; icon: ReactNode; sections: NavSection[] };

export const BACK_TO_SHOP: NavItem = { href: "/", label: "Back to the shop", icon: <ArrowLeft />, exact: true };

export const SHOP_LINKS: NavItem[] = [
  { href: "/", label: "Home", icon: <Home />, exact: true, blurb: "Greeting, picks and the shops on the rail" },
  { href: "/deals", label: "Today's deals", icon: <Fire />, blurb: "Markdowns from every stall, ending soon" },
  { href: "/search?sort=newest", label: "New in", icon: <Sparkle />, blurb: "Pieces listed in the last few days" },
  { href: "/stores", label: "All stores", icon: <Store />, blurb: "Every stall in the market, side by side" },
  { href: "/wholesale", label: "Wholesale", icon: <Archive />, blurb: "Bulk prices for resellers" },
];

export const YOU_LINKS: NavItem[] = [
  { href: "/orders", label: "Orders", icon: <Receipt /> },
  { href: "/wishlist", label: "Wishlist", icon: <Heart /> },
  { href: "/account", label: "Account", icon: <User /> },
];

export const SELL_LINKS: NavItem[] = [
  { href: "/sell", label: "Rent a stall", icon: <Store />, exact: true, blurb: "What a stall gets you and how renting works" },
  { href: "/sell/apply", label: "Apply for a stall", icon: <Megaphone />, blurb: "Tell us about your shop, we reply within two days" },
  { href: "/sell#contact", label: "Talk to the market team", icon: <Message />, blurb: "Prices are set per stall, ask us for yours" },
];

export const RIDE_LINKS: NavItem[] = [
  { href: "/rider/apply", label: "Apply to ride", icon: <Bike />, blurb: "Deliver for the market's stalls on your own hours" },
];

export const HELP_LINK: NavItem = { href: "/help/shipping", label: "Help", icon: <Help /> };

export const VENDOR: Area = {
  key: "vendor",
  label: "Vendor",
  title: "Vendor dashboard",
  icon: <Store />,
  href: "/seller",
  role: "vendor",
  sections: [
    {
      items: [
        { href: "/seller", label: "Overview", icon: <Chart />, exact: true, blurb: "Sales, payouts and what needs you today" },
        { href: "/seller/orders", label: "Orders and payments", icon: <Wallet />, blurb: "Pack, ship and get paid" },
        { href: "/seller/deliveries", label: "Dispatch and map", icon: <Truck />, blurb: "Riders on the way, live" },
        { href: "/seller/riders", label: "Riders", icon: <Bike />, blurb: "Who is near your stall right now" },
        { href: "/seller/ledger", label: "Ledger", icon: <List />, blurb: "Your sales, payments and stock sheets, and your own entries" },
      ],
    },
    {
      caption: "Catalogue",
      items: [
        { href: "/seller/inventory", label: "Inventory", icon: <Box />, blurb: "Stock counts across every size" },
        { href: "/seller/products", label: "Products", icon: <Grid />, blurb: "Photos, video, prices and stock" },
      ],
    },
    {
      caption: "Your stall",
      items: [
        { href: "/seller/space", label: "Store space", icon: <Megaphone />, blurb: "Your plan and featured spots" },
        { href: "/seller/settings", label: "Storefront settings", icon: <Settings />, blurb: "Name, banner and policies" },
      ],
    },
  ],
};

export const RIDER: Area = {
  key: "rider",
  label: "Rider",
  title: "Rider app",
  icon: <Bike />,
  href: "/rider",
  role: "rider",
  sections: [
    {
      items: [
        { href: "/rider", label: "My deliveries", icon: <Truck />, exact: true, blurb: "Open jobs, your run and the route" },
        { href: "/rider/activity", label: "Activity and earnings", icon: <Chart />, blurb: "What you've delivered and earned" },
      ],
    },
  ],
};

export const ADMIN: Area = {
  key: "admin",
  label: "Admin",
  title: "Admin console",
  icon: <AdminIcon />,
  href: "/admin",
  role: "admin",
  sections: [
    { items: [{ href: "/admin", label: "Income", icon: <Chart />, exact: true, blurb: "Rent, commission and fees" }] },
    {
      caption: "Market",
      items: [
        { href: "/admin/stores", label: "Stores", icon: <Store />, blurb: "Applications and live stalls" },
        { href: "/admin/space", label: "Store space", icon: <Megaphone />, blurb: "Plans and featured placements" },
        { href: "/admin/pricing", label: "Fees and settings", icon: <Cash />, blurb: "Fees, where shoppers pay, and rider rules" },
        { href: "/admin/orders", label: "Orders", icon: <Receipt />, blurb: "Every order across the market" },
      ],
    },
    {
      caption: "Money",
      items: [
        { href: "/admin/payments", label: "Payments and payouts", icon: <Wallet />, blurb: "The till's payments, codes and what stalls are owed" },
        { href: "/admin/ledger", label: "Ledger", icon: <List />, blurb: "Every stall's sheets, and rows waiting for you to confirm" },
      ],
    },
    {
      caption: "Delivery",
      items: [
        { href: "/admin/riders", label: "Riders and hiring", icon: <Bike />, blurb: "Applications, approvals, the fleet" },
        { href: "/admin/deliveries", label: "Live deliveries", icon: <Truck />, blurb: "The map of every job in flight" },
      ],
    },
  ],
};

export const ADMIN_FOOTER: NavItem[] = [{ href: "/admin/maintenance", label: "Maintenance", icon: <Tools /> }, BACK_TO_SHOP];

export const AREAS = [VENDOR, RIDER, ADMIN];

/** Which areas a signed-in person can open. With sign-in switched off (the demo), all of them. */
export function areasFor(roles: string[], everything: boolean): Area[] {
  return AREAS.filter((a) => everything || roles.includes(a.role));
}

export function isActive(path: string, item: Pick<NavItem, "href" | "exact">) {
  if (item.href.includes("?") || item.href.includes("#")) return false;
  if (item.exact) return path === item.href;
  return path === item.href || path.startsWith(`${item.href}/`);
}
