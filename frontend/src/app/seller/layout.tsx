import type { Metadata } from "next";
import { AppFrame } from "@/components/app-frame";
import { DemoNotice } from "@/components/ui";
import { requireUser } from "@/lib/guard";
import { BACK_TO_SHOP, VENDOR } from "@/lib/nav";

export const metadata: Metadata = { title: { default: "Vendor dashboard", template: "%s · Vendor" }, robots: { index: false } };

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/seller", "vendor");
  return (
    <AppFrame nav={VENDOR.sections} navFooter={{ items: [BACK_TO_SHOP] }} navLabel={VENDOR.title} footer={false}>
      <div className="px-4 py-5 md:px-6">
        {user.demo && <DemoNotice what="the vendor dashboard with sample data" />}
        {children}
      </div>
    </AppFrame>
  );
}
