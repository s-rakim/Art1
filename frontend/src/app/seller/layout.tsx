import type { Metadata } from "next";
import { AppFrame } from "@/components/app-frame";
import type { NavSection } from "@/components/app-navigation";
import { ArrowLeft, Box, Chart, Grid, Megaphone, Settings, Truck, Wallet } from "@/components/icons";
import { DemoNotice } from "@/components/ui";
import { requireUser } from "@/lib/guard";

export const metadata: Metadata = { title: { default: "Vendor dashboard", template: "%s · Vendor" }, robots: { index: false } };

const nav: NavSection[] = [
  {
    items: [
      { href: "/seller", label: "Overview", icon: <Chart />, exact: true },
      { href: "/seller/orders", label: "Orders and payments", icon: <Wallet /> },
      { href: "/seller/deliveries", label: "Dispatch and map", icon: <Truck /> },
    ],
  },
  {
    caption: "Catalogue",
    items: [
      { href: "/seller/inventory", label: "Inventory", icon: <Box /> },
      { href: "/seller/products", label: "Products", icon: <Grid /> },
    ],
  },
  {
    caption: "Your stall",
    items: [
      { href: "/seller/space", label: "Store space", icon: <Megaphone /> },
      { href: "/seller/settings", label: "Storefront settings", icon: <Settings /> },
    ],
  },
];
const footer: NavSection = { items: [{ href: "/", label: "Back to the shop", icon: <ArrowLeft />, exact: true }] };

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/seller", "vendor");
  return (
    <AppFrame nav={nav} navFooter={footer} navLabel="Vendor dashboard" footer={false}>
      <div className="px-4 py-5 md:px-6">
        {user.demo && <DemoNotice what="the vendor dashboard with sample data" />}
        {children}
      </div>
    </AppFrame>
  );
}
