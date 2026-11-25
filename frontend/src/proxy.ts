import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const tiles = process.env.NEXT_PUBLIC_MAP_TILES || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const GUARDED = ["/account", "/orders", "/seller", "/admin", "/checkout", "/wishlist", "/rider"];
// Application forms need a signed-in user but not an approved role.

function origin(u: string) {
  try {
    return new URL(u).origin;
  } catch {
    return "";
  }
}

function buildCsp(nonce: string) {
  const dev = process.env.NODE_ENV === "development";
  const sb = origin(supabaseUrl);
  const tileOrigin = origin(tiles.replace(/\{[a-z]\}/g, "a"));
  const api = origin(apiUrl);
  // The API's tracking websocket lives on the same host, over ws:// or wss://.
  const connect = ["'self'", api, api && api.replace(/^http/, "ws"), sb, sb && sb.replace(/^http/, "ws"), tileOrigin].filter(Boolean).join(" ");
  const img = ["'self'", "data:", "blob:", sb, tileOrigin, process.env.NEXT_PUBLIC_IMAGE_HOST ? `https://${process.env.NEXT_PUBLIC_IMAGE_HOST}` : ""]
    .filter(Boolean)
    .join(" ");
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Stylesheets need the nonce; style="" attributes are allowed because store colours and
    // bar heights are set inline. Attribute styles can't run script.
    `style-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-inline'" : ""}`,
    `style-src-attr 'unsafe-inline'`,
    `img-src ${img}`,
    `font-src 'self'`,
    `connect-src ${connect}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    // Only force HTTPS sub-requests when the API itself is on HTTPS, or local setups break.
    ...(!dev && apiUrl.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

// Runs before every page: sets a per-request CSP nonce, keeps the Supabase session cookie
// fresh, and sends signed-out visitors to /login for private areas. Role checks for /seller
// and /admin also happen server-side in their layouts, and the API enforces them again.
export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  requestHeaders.set("Content-Security-Policy", csp);

  const forward = () => NextResponse.next({ request: { headers: requestHeaders } });
  let response = forward();

  if (supabaseUrl && supabaseKey) {
    const sb = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = forward();
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    // getUser() validates the JWT with Supabase; getSession() alone would trust the cookie.
    const { data } = await sb.auth.getUser();
    const path = request.nextUrl.pathname;
    if (!data.user && GUARDED.some((p) => path === p || path.startsWith(`${p}/`))) {
      const login = request.nextUrl.clone();
      login.pathname = "/login";
      login.search = "";
      login.searchParams.set("next", path);
      const redirect = NextResponse.redirect(login);
      redirect.headers.set("Content-Security-Policy", csp);
      return redirect;
    }
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Prefetches go through the proxy too, so nobody can skip the auth check or forge
    // the x-pathname header by sending a prefetch-looking request.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|vendor/|img/).*)",
  ],
};
