import type { Metadata } from "next";
import { AppFrame } from "@/components/app-frame";
import { DemoNotice } from "@/components/ui";
import { requireUser } from "@/lib/guard";
import { ADMIN, ADMIN_FOOTER } from "@/lib/nav";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Non-admins get a 404, not a hint that this area exists.
  const user = await requireUser("/admin", "admin");
  return (
    <AppFrame nav={ADMIN.sections} navFooter={{ items: ADMIN_FOOTER }} navLabel={ADMIN.title} footer={false}>
      <div className="px-4 py-5 md:px-6">
        {user.demo && <DemoNotice what="the admin console with sample data" />}
        {children}
      </div>
    </AppFrame>
  );
}
