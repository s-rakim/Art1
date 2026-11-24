import type { Metadata } from "next";
import { SellerShell } from "@/components/seller-shell";
import { DemoNotice } from "@/components/ui";
import { requireUser } from "@/lib/guard";

export const metadata: Metadata = { title: { default: "Vendor dashboard", template: "%s · Vendor" }, robots: { index: false } };

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/seller", "vendor");
  return (
    <SellerShell>
      {user.demo && <DemoNotice what="the vendor dashboard with sample data" />}
      {children}
    </SellerShell>
  );
}
