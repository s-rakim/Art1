import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { GuestFrame } from "@/components/guest-frame";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default function SignupPage() {
  return (
    <GuestFrame>
      <Suspense><AuthForm mode="signup" /></Suspense>
    </GuestFrame>
  );
}
