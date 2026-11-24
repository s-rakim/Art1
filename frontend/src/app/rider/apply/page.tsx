import type { Metadata } from "next";
import { RiderApplication } from "@/components/rider-application";
import { requireUser } from "@/lib/guard";

export const metadata: Metadata = { title: "Ride with us", robots: { index: false } };

export default async function RiderApply() {
  const user = await requireUser("/rider/apply");
  return <RiderApplication demo={user.demo} />;
}
