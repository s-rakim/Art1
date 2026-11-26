import type { Metadata } from "next";
import { Suspense } from "react";
import { VendorApplication } from "@/components/vendor-application";
import { api } from "@/lib/api";
import { redirect } from "next/navigation";
import { requireUser, serverToken } from "@/lib/guard";

export const metadata: Metadata = { title: "Apply for a stall", robots: { index: false } };

export default async function ApplyPage() {
  const user = await requireUser("/sell/apply");
  // One stall per account: anyone who already applied goes to their dashboard instead of
  // filling the form again and hitting "you already have a store".
  const token = user.demo ? null : await serverToken();
  const me = token ? await api.me(token).catch(() => null) : null;
  if (me?.store && (me.store.status === "pending" || me.store.status === "active")) redirect("/seller");
  const plans = await api.plans();
  return (
    <Suspense>
      <VendorApplication plans={plans} demo={user.demo} />
    </Suspense>
  );
}
