import type { Metadata } from "next";
import { DemoNotice } from "@/components/ui";
import { requireUser } from "@/lib/guard";

export const metadata: Metadata = { title: { default: "Rider", template: "%s · Rider" }, robots: { index: false } };

export default async function RiderLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/rider", "rider");
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {user.demo && <DemoNotice what="the rider app with sample deliveries" />}
      {children}
    </div>
  );
}
