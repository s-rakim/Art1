import type { Metadata } from "next";
import { AppFrame } from "@/components/app-frame";
import type { NavSection } from "@/components/app-navigation";
import { ArrowLeft, Truck } from "@/components/icons";
import { DemoNotice } from "@/components/ui";
import { requireUser } from "@/lib/guard";

export const metadata: Metadata = { title: { default: "Rider", template: "%s · Rider" }, robots: { index: false } };

const nav: NavSection[] = [{ items: [{ href: "/rider", label: "My deliveries", icon: <Truck />, exact: true }] }];
const footer: NavSection = { items: [{ href: "/", label: "Back to the shop", icon: <ArrowLeft />, exact: true }] };

export default async function RiderLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/rider", "rider");
  return (
    <AppFrame nav={nav} navFooter={footer} navLabel="Rider app" footer={false}>
      <div className="mx-auto max-w-3xl px-4 py-5">
        {user.demo && <DemoNotice what="the rider app with sample deliveries" />}
        {children}
      </div>
    </AppFrame>
  );
}
