import type { Metadata } from "next";
import { AdminShell } from "@/components/admin-shell";
import { DemoNotice } from "@/components/ui";
import { requireUser } from "@/lib/guard";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Non-admins get a 404, not a hint that this area exists.
  const user = await requireUser("/admin", "admin");
  return (
    <AdminShell>
      {user.demo && <DemoNotice what="the admin console with sample data" />}
      {children}
    </AdminShell>
  );
}
