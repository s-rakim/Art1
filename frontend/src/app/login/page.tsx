import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { GuestFrame } from "@/components/guest-frame";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function LoginPage() {
  return (
    <GuestFrame>
      <Suspense><AuthForm mode="login" /></Suspense>
    </GuestFrame>
  );
}
