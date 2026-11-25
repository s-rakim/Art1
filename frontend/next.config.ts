import type { NextConfig } from "next";

// Refuse to build if someone pastes the Supabase service-role key into a public variable.
// Anything NEXT_PUBLIC_ ends up in every visitor's browser.
for (const [name, value] of Object.entries(process.env)) {
  if (!name.startsWith("NEXT_PUBLIC_") || !value) continue;
  const parts = value.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      if (payload?.role && payload.role !== "anon") {
        throw new Error(`${name} holds a "${payload.role}" key. Only the anon key may be public.`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("Only the anon key")) throw e;
    }
  }
  if (/service[_-]?role/i.test(name)) throw new Error(`${name} looks like a secret and must not be NEXT_PUBLIC_.`);
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=(self), usb=(), browsing-topics=()",
  },
];

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
