# Stallrow storefront

The web app for the marketplace: the shop itself, the vendor dashboard, the rider app and the admin console. Next.js 16 (App Router, TypeScript), Tailwind 4, Supabase for sign-in, MapLibre with OpenStreetMap tiles for delivery tracking. It talks to the FastAPI service in `/backend` and never touches the database directly.

The API contract is the backend's `openapi.json`. `src/lib/openapi.ts` is generated from it (`npm run gen:api`), and `src/lib/api.ts` maps those shapes into the view models in `src/lib/types.ts`, so a backend change shows up as a type error here instead of a broken page.

The name, currency and map centre are all environment variables, so rebranding is a config change.

## Who uses what

| Area | Path | Who gets in |
| --- | --- | --- |
| Shop | `/`, `/c/*`, `/p/*`, `/s/*`, `/search`, `/deals`, `/wholesale` | Everyone |
| Bag and checkout | `/cart`, `/checkout` | Checkout needs a signed-in shopper |
| Shopper account | `/account`, `/orders`, `/wishlist` | Signed-in users |
| Rent a stall | `/sell`, then `/sell/apply` | Anyone can read; applying needs a login |
| Vendor dashboard | `/seller/*` | `vendor` role |
| Rider app | `/rider`, application at `/rider/apply` | `rider` role |
| Admin console | `/admin/*` | `admin` role, everyone else gets a 404 |

Sign-in has four tabs (shopper, vendor, rider, admin). Shoppers, vendors and riders can sign up; admins can't, they're invited. The role picked at sign-up is only stored as `user_metadata.requested_role`. Actual access comes from `app_metadata.roles` (`customer`, `vendor`, `rider`, `admin`), which only the backend can write, after a vendor's stall or a rider's application is approved. If that mirror hasn't caught up yet, the server asks `GET /me`, which reads the backend's own profile table.

## How the money and the parcels move

- **Paying.** Card payments aren't switched on yet. Shoppers pick cash on delivery or bank transfer at checkout. Cash orders are ready to dispatch straight away and the rider collects the money; transfer orders wait until the vendor confirms the money arrived. Admins can also mark an order paid or cancel it.
- **Dispatching.** A vendor sends a paid (or cash) order to a nearby rider on shift, or ships it by courier with a tracking number. A rider can be called back until they collect the parcel.
- **Handing over.** Once a rider accepts, the shopper's order page shows a six-digit handover code. The rider types it in to finish the delivery, so a parcel can't be marked delivered without the buyer.
- **Renting space.** Vendors pay monthly rent for their stall plan, and can rent extra spots (homepage shelf, category banner, deal strip, search boost) by the day. Bookings come out of the store balance. Admins set the rent, commission and day rates.

## Running it

```bash
cd frontend
cp .env.example .env.local   # fill in the API URL and Supabase keys
npm install
npm run dev                  # http://localhost:3000
```

With no Supabase keys the site runs in demo mode: the shop, vendor, rider and admin screens all work with bundled sample data, and every private page carries a yellow DEMO banner. If the API is down, public pages fall back to the same sample catalogue. Set `NEXT_PUBLIC_DEMO_DATA=off` in production so a dead API shows an error instead of fake products.

## Docker on the Oracle server

The image is built from `node:22-alpine`, which has arm64 builds, so it builds natively on an Ampere instance. It runs as an unprivileged user and works with a read-only root filesystem.

```bash
# from the repo root, next to the backend's compose file
docker compose -f compose.yml -f frontend/compose.frontend.yml up -d --build
```

`NEXT_PUBLIC_*` values are baked into the browser bundle at build time, which is why they're build args in the compose file. Change them and you rebuild. Server-side calls use `API_URL_INTERNAL` (defaults to `http://api:8000/api/v1`) so they stay on the Docker network.

The container listens on `127.0.0.1:3000`. Put Caddy or Nginx in front of it for HTTPS; the security headers assume the site is served over TLS.

## Security notes

These are the things worth knowing before anyone starts poking at it.

- **Content Security Policy with per-request nonces.** `src/proxy.ts` builds the policy on every request. Scripts run only with the nonce (`strict-dynamic`), there's no `unsafe-eval` in production, no framing (`frame-ancestors 'none'`), and `connect-src` is limited to the API (and its websocket), Supabase and the map tile host. Style attributes are allowed because store colours are set inline; attribute styles can't run script.
- **Other headers.** HSTS, `nosniff`, `X-Frame-Options: DENY`, a strict referrer policy, COOP/CORP and a Permissions-Policy that only allows geolocation (for riders) and payment on our own origin. See `next.config.ts`.
- **Auth is checked on the server.** The proxy validates the Supabase session with `getUser()` (not just the cookie) and bounces signed-out visitors from private paths. Each private layout checks again and checks the role. The API is the real gate and enforces the same roles on every call.
- **No client-trusted money.** Checkout sends product IDs, variant IDs and quantities only. The backend prices the order.
- **No secrets in the bundle.** Only the Supabase anon key is public. `next.config.ts` refuses to build if any `NEXT_PUBLIC_` variable holds a non-anon Supabase key.
- **Untrusted text stays text.** No `dangerouslySetInnerHTML` anywhere. Seller-supplied colours must be `#rrggbb` before they reach a style attribute, images must be https, and map labels are set with `textContent`. Route params are validated before they hit the API. Post-login redirects only accept local paths.
- **No CSRF surface.** API calls carry the token in an `Authorization` header, not a cookie, and there are no server actions.
- **Live tracking socket.** The token goes in the first websocket message, never in the URL, so it stays out of proxy logs. Incoming messages are size-capped and shape-checked before they touch the map. The API refuses sockets from origins not in its CORS list.
- **Photo uploads.** The API hands out a one-time signed URL into the store's own folder in Supabase Storage. The browser checks type (JPEG, PNG, WebP, AVIF) and size (5 MB) first, and refuses any upload or public URL that isn't https.
- **Sign-in doesn't leak accounts.** Wrong email and wrong password get the same message, and the magic-link form always says a link is on its way.
- **Location privacy.** Riders only share position while on shift. The tracking endpoint only returns a customer's own order, and the rider doesn't see the drop-off address until they accept the job.

## Maps

Tracking uses MapLibre GL with raster tiles from `tile.openstreetmap.org`. Positions stream over the API's `/ws/tracking` websocket; if it can't connect, the screens fall back to polling every 10 to 15 seconds. Shoppers see their own parcels, vendors see their own deliveries, and admins get the whole market plus every rider on shift. That's fine for testing, but OpenStreetMap's tile servers aren't meant for production traffic, so point `NEXT_PUBLIC_MAP_TILES` at MapTiler, Stadia or your own tile server before launch. The MapLibre web worker is copied into `public/vendor/` at build time so it loads from our own origin.

## Look and feel

The interface follows Nextcloud's design: the default Nextcloud blue (`#00679e`), the system font stack at 15px, 34px controls with 8px corners, a blue header with the app switcher on the left, and a rounded white body with a 300px navigation column. Below 1024px the navigation turns into a drawer behind the menu button in the header.

All of it comes from one token layer at the top of `src/app/globals.css`. The colour names match Nextcloud's CSS variables (`--color-main-background`, `--color-primary-element`, `--color-primary-element-light`, `--color-border-maxcontrast` and so on) and the values were computed with the same maths Nextcloud's theming app uses, for light and dark. Dark mode follows the operating system. Below the tokens are a handful of component classes copied from Nextcloud's Vue library: `.btn` (primary, secondary, tertiary, error, success), `.field`, `.chip`, `.counter`, `.note`, `.card`, `.nav-entry`, `.menu` and `.modal`. Pages use those and the token utilities rather than raw colours, so a theme change happens in one file.

Icons are Material Design Icons (`@mdi/js` paths, Apache 2.0), the set Nextcloud ships, inlined in `src/components/icons.tsx`.

The four areas share one frame:

- `components/app-frame.tsx` is the header, the navigation column and the content area. The shop, the vendor dashboard, the rider app and the admin console each pass it their own navigation.
- `components/guest-frame.tsx` is the centred card on the blue background used for log in, sign up, errors and maintenance, like Nextcloud's login page.
- The header's app menu shows Shop, Vendor, Rider and Admin depending on the signed-in user's roles (all four in demo mode).

## Layout

```
src/
  app/(shop)/     shopper routes, wrapped in the shop navigation
  app/seller/     vendor dashboard
  app/rider/      rider app and rider application
  app/admin/      admin console
  app/login, app/signup
  app/globals.css design tokens and component classes
  components/     UI, including the app frame and the delivery map
  lib/api.ts      every backend call, with demo fallbacks
  lib/guard.ts    server-side auth and role checks
  lib/safe.ts     validators for colours, URLs, slugs and redirects
  lib/mock/       demo catalogue, orders, riders and deliveries
  proxy.ts        CSP nonce, session refresh, private-path redirects
  store/cart.ts   bag, wishlist and recently viewed (local storage)
```
