import type { Metadata } from "next";
import { Suspense } from "react";
import { VendorApplication } from "@/components/vendor-application";
import { api } from "@/lib/api";
import { requireUser } from "@/lib/guard";

export const metadata: Metadata = { title: "Apply for a stall", robots: { index: false } };

export default async function ApplyPage() {
  const user = await requireUser("/sell/apply");
  const plans = await api.plans();
  return (
    <Suspense>
      <VendorApplication plans={plans} demo={user.demo} />
    </Suspense>
  );
}
