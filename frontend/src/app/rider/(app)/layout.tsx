import type { Metadata } from "next";
import { AppFrame } from "@/components/app-frame";
import { DemoNotice } from "@/components/ui";
import { requireUser } from "@/lib/guard";
import { BACK_TO_SHOP, RIDER } from "@/lib/nav";

export const metadata: Metadata = { title: { default: "Rider", template: "%s · Rider" }, robots: { index: false } };

export default async function RiderLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/rider", "rider");
  return (
    <AppFrame nav={RIDER.sections} navFooter={{ items: [BACK_TO_SHOP] }} navLabel={RIDER.title} footer={false}>
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-5">
        {user.demo && <DemoNotice what="the rider app with sample deliveries" />}
        {children}
      </div>
    </AppFrame>
  );
}
