import "./globals.css";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { GuestFrame } from "@/components/guest-frame";
import { CartDrawer } from "@/components/cart-drawer";
import { api } from "@/lib/api";
import { STORE_NAME } from "@/lib/config";

export const metadata: Metadata = {
  title: { default: `${STORE_NAME}: independent shops, one checkout`, template: `%s · ${STORE_NAME}` },
  description: "A marketplace of independent stores. Clothing, home, electronics and wholesale lots from sellers who rent their own stall.",
  referrer: "strict-origin-when-cross-origin",
};

export const viewport: Viewport = { themeColor: "#00679e" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading headers opts every page into dynamic rendering, which the per-request CSP nonce needs.
  const h = await headers();
  const path = h.get("x-pathname") ?? "/";
  const status = await api.status().catch(() => ({ maintenance_mode: false, maintenance_message: "" }));
  const closed = status.maintenance_mode && !/^\/(admin|login)(\/|$)/.test(path);
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only rounded-element focus:not-sr-only focus:fixed focus:top-1.5 focus:left-1.5 focus:z-[60] focus:bg-main-background focus:px-3 focus:py-2 focus:text-main-text">
          Skip to content
        </a>
        {closed ? (
          <GuestFrame>
            <h1 className="heading text-[20px]">Down for maintenance</h1>
            <p className="mt-2 text-maxcontrast">{status.maintenance_message || "We're doing some upkeep. Your bag and orders are safe, and the shop will be back shortly."}</p>
          </GuestFrame>
        ) : (
          children
        )}
        <CartDrawer />
      </body>
    </html>
  );
}
