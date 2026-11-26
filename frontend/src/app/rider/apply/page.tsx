import type { Metadata } from "next";
import { Suspense } from "react";
import { RiderApplication } from "@/components/rider-application";

export const metadata: Metadata = { title: "Ride with us", robots: { index: false } };

export default function RiderApply() {
  return (
    <Suspense>
      <RiderApplication />
    </Suspense>
  );
}
