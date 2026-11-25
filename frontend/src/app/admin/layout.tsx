import type { Metadata } from "next";
import { AppFrame } from "@/components/app-frame";
import type { NavSection } from "@/components/app-navigation";
import { ArrowLeft, Bike, Chart, Megaphone, Receipt, Store, Tools, Truck } from "@/components/icons";
import { DemoNotice } from "@/components/ui";
import { requireUser } from "@/lib/guard";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };

const nav: NavSection[] = [
  { items: [{ href: "/admin", label: "Income", icon: <Chart />, exact: true }] },
  {
    caption: "Market",
    items: [
      { href: "/admin/stores", label: "Stores", icon: <Store /> },
      { href: "/admin/space", label: "Store space", icon: <Megaphone /> },
      { href: "/admin/orders", label: "Orders", icon: <Receipt /> },
    ],
  },
  {
    caption: "Delivery",
    items: [
      { href: "/admin/riders", label: "Riders", icon: <Bike /> },
      { href: "/admin/deliveries", label: "Live deliveries", icon: <Truck /> },
    ],
  },
];
const footer: NavSection = {
  items: [
    { href: "/admin/maintenance", label: "Maintenance", icon: <Tools /> },
    { href: "/", label: "Back to the shop", icon: <ArrowLeft />, exact: true },
  ],
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Non-admins get a 404, not a hint that this area exists.
  const user = await requireUser("/admin", "admin");
  return (
    <AppFrame nav={nav} navFooter={footer} navLabel="Admin console" footer={false}>
      <div className="px-4 py-5 md:px-6">
        {user.demo && <DemoNotice what="the admin console with sample data" />}
        {children}
      </div>
    </AppFrame>
  );
}
