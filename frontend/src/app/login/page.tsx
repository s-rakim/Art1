import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth-form";
import { GuestFrame } from "@/components/guest-frame";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default function LoginPage() {
  return (
    <GuestFrame>
      <Suspense><LoginForm /></Suspense>
    </GuestFrame>
  );
}
