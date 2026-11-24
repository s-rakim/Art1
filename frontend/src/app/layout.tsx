import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { CartDrawer } from "@/components/cart-drawer";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { api } from "@/lib/api";
import { STORE_NAME } from "@/lib/config";

export const metadata: Metadata = {
  title: { default: `${STORE_NAME}: independent shops, one checkout`, template: `%s · ${STORE_NAME}` },
  description: "A marketplace of independent stores. Clothing, home, electronics and wholesale lots from sellers who rent their own stall.",
  referrer: "strict-origin-when-cross-origin",
};

export const viewport: Viewport = { themeColor: "#f4f0e6" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading headers opts every page into dynamic rendering, which the per-request CSP nonce needs.
  const h = await headers();
  const path = h.get("x-pathname") ?? "/";
  const status = await api.status().catch(() => ({ maintenance_mode: false, maintenance_message: "" }));
  const closed = status.maintenance_mode && !/^\/(admin|login)(\/|$)/.test(path);
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
          Skip to content
        </a>
        <Header />
        <main id="main">
          {closed ? (
            <div className="mx-auto max-w-2xl px-4 py-24 text-center">
              <p className="label mb-3">Back soon</p>
              <h1 className="display text-[64px] md:text-[96px]">The market is closed for a moment.</h1>
              <p className="mt-6 text-[17px] text-ink-2">{status.maintenance_message || "We're doing some upkeep. Your bag and orders are safe."}</p>
            </div>
          ) : (
            children
          )}
        </main>
        <Footer />
        <CartDrawer />
      </body>
    </html>
  );
}
