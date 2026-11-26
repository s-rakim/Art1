# The Bazaar: web app

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

There is one login for everyone. After signing in, each person lands where their account belongs (their orders, the vendor dashboard, the rider app or the admin console), going by what `GET /me` says. Shoppers sign up at `/signup`, vendors through `/signup?as=vendor` and then the stall application, riders through `/rider/apply`; admins can't sign up, they're invited. The role picked at sign-up is only stored as `user_metadata.requested_role`. Actual access comes from `app_metadata.roles` (`customer`, `vendor`, `rider`, `admin`), which only the backend can write, after a vendor's stall or a rider's application is approved. If that mirror hasn't caught up yet, the server asks `GET /me`, which reads the backend's own profile table.

## How the money and the parcels move

- **The bag.** Every line in the bag has a tick. Shoppers can buy from one shop now and leave the rest for later; unticked lines stay in the bag after checkout. "Save for later" moves a line to the wishlist, which is separate from the bag and synced to the account when signed in.
- **Paying.** All money goes to the market, not to the shops: one M-Pesa till or paybill and one bank account, set by an admin under "Fees and settings". Card payments aren't switched on yet. Shoppers pick pay on arrival or bank transfer at checkout, and the order page shows where to pay with the order number as the reference.
- **Riders.** Open jobs show on the rider's map as yellow pins, the one they've picked turns red, and today's drop-offs are green, with the route drawn in the order the jobs were placed. A rider can accept or skip, and take more jobs on the same run when the shops and drop-offs are within the radius the admin set. The exact address, phone number and the customer's note only appear once a job is accepted. The nearest free rider is offered each job first; a vendor can still pick a rider or ship by courier.
- **At the door.** The rider taps "I'm at the door", the customer pays the till, and the rider finds the payment by its transaction code or the payer's name and confirms it. A code can only ever be used once. Payments reach the databank when an admin pastes or uploads the SMS and bank messages under Payments (an SMS forwarder or Daraja callback can feed the same place later). Then the customer reads out the six-digit handover code and the rider marks the parcel delivered.
- **Tracking.** Shoppers follow the rider on a live map with an ETA, and can move the drop-off pin or leave a note for the rider until the parcel arrives.
- **Ledgers and payouts.** Admins see every stall's books (ledger, sales, payments, stock sold, payouts) read only, and each vendor sees only their own. Vendors also keep an editable sheet of their own rows; an admin confirms each row by typing the key from its payment message or receipt, or sends it back with a note. Confirmed rows lock. Every change to payments, payouts and sheets lands in an audit log nobody can edit. Payouts go to each stall after the admin-set interval, net of rent, commission and delivery, and each one needs the transfer's reference. Every table exports to CSV.
- **Renting space.** Stall rent and commission are agreed per vendor, so the public pages show no prices: `/sell` lists what each plan includes and puts the market team's contact card where a price would be. Admins set rent, commission and day rates in the console. Extra spots (homepage shelf, category banner, deal strip, search boost) are booked by the day and come out of the store balance.

## Running it

```bash
cd frontend
cp .env.example .env.local   # fill in the API URL and Supabase keys
npm install
npm run dev                  # http://localhost:3000
```

With no Supabase keys the site runs in demo mode: the shop, vendor, rider and admin screens all work with bundled sample data, and every private page carries a yellow DEMO banner. If the API is down, public pages fall back to the same sample catalogue. Set `NEXT_PUBLIC_DEMO_DATA=off` in production so a dead API shows an error instead of fake products.

`npm run lint` (ESLint with Next's rules and the React Compiler checks) and `npm run typecheck` should both come back clean before a push.

## Docker on the Oracle server

The whole stack, this app included, runs from the `compose.yml` at the repo root; `DEPLOY.md` there walks through it from an empty Oracle instance to a live domain. The image is built from `node:22-alpine`, which has arm64 builds, so it builds natively on an Ampere instance. It runs as an unprivileged user with a read-only root filesystem and Next's standalone server (`node server.js`).

`NEXT_PUBLIC_*` values are baked into the browser bundle at build time, which is why they're build args in the compose file. Change them and you rebuild (`docker compose build web`). Server-side calls use `API_URL_INTERNAL` (`http://api:8000/api/v1`) so they stay on the Docker network. Caddy sits in front for HTTPS; the security headers assume the site is served over TLS.

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
- **Photo and video uploads.** Files go to the API as multipart uploads, and the API checks them again and writes them to Supabase Storage under the store's own folder. The browser checks first: photos must be JPEG, PNG, WebP or AVIF up to 10 MB (12 per item), the one video per item MP4, MOV or WebM up to 50 MB and three minutes. Media is only shown from the Supabase storage host over https, and the CSP's `media-src` allows nothing else.
- **CSV exports can't run formulas.** Any cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is prefixed with a quote before it's written (plain numbers like -29.00 are left alone), so a vendor's description can't turn into a spreadsheet formula on an admin's machine.
- **Sign-in doesn't leak accounts.** Wrong email and wrong password get the same message, and the magic-link form always says a link is on its way.
- **Location privacy.** Riders only share position while on shift. The tracking endpoint only returns a customer's own order, and the rider doesn't see the drop-off address until they accept the job.

## Maps

Tracking uses MapLibre GL with OpenFreeMap's vector styles (OpenStreetMap data, rebuilt weekly, no key needed), light or dark to match the system, and falls back to raster OpenStreetMap tiles if the style can't load. Set `NEXT_PUBLIC_MAP_STYLE` to any MapLibre style URL to use MapTiler, Stadia or your own. Positions stream over the API's websocket; if it can't connect, the screens fall back to polling every 10 to 15 seconds. Shoppers see their own parcels, vendors see their own deliveries and the riders around their shop, and admins get the whole market plus every rider on shift. The map takes keyboard input (arrows pan, plus and minus zoom) and has zoom and fullscreen buttons. The MapLibre web worker is copied into `public/vendor/` at build time so it loads from our own origin.

## Look and feel

The interface copies Nextcloud. Behind everything runs a slow blue and white wave shader (`components/ui/poba-shade.tsx`, adapted from 21st.dev). It caps its pixel count and frame rate, pauses when the tab is hidden or scrolled away, draws one still frame for reduced motion or data saver, and gives up quietly without WebGL; underneath it sits Nextcloud's default wallpaper, the blue and white "Fluid" image, which is what you see if the shader never starts. The header rests on it in white glyphs. Pages sit in a rounded body inset 8px from the edges: a see-through white navigation column on the left (the wallpaper shows through it, blurred) with the selected entry filled solid blue, and a white content area on the right. Below 1024px the navigation turns into a drawer behind the menu button.

The home page is laid out like Nextcloud's Dashboard: a greeting on the wallpaper, shortcut pills, and see-through white panels for deals, new arrivals, shops, departments, rented shelves, wholesale and selling.

All of it comes from one token layer at the top of `src/app/globals.css`. The colour names match Nextcloud's CSS variables (`--color-main-background`, `--color-main-background-blur`, `--color-primary-element`, `--color-primary-element-light` and so on), and the values were computed with the same maths Nextcloud's theming app uses, from its default blue `#00679e`, for light and dark. Dark mode follows the operating system and swaps in the dark wallpaper. Below the tokens are component classes copied from Nextcloud's Vue library: `.btn` (primary, secondary, tertiary, error, success), `.field`, `.chip`, `.counter`, `.note`, `.card`, `.nav-entry`, `.widget`, `.menu` and `.modal`, plus a `glass` utility for the see-through surfaces. Pages use those and the token utilities rather than raw colours, so a theme change happens in one file. Accents stay blue and white; green, yellow and red only show up for status (delivered, pending, errors).

Icons are filled Material Design Icons (`@mdi/js` paths, Apache 2.0), the set and style Nextcloud uses, inlined in `src/components/icons.tsx`.

The wallpaper (`public/img/background.webp` and `background-dark.webp`) is "Fluid" by Jo Myoung Hee, Nextcloud GmbH, licensed CC BY-SA 4.0. The footer and the login page carry that credit; keep it if the images stay.

The areas share one frame:

- `components/app-frame.tsx` is the header, the navigation column and the content area. The shop, the vendor dashboard, the rider app and the admin console each pass it their own navigation.
- `app/(home)/layout.tsx` is the Dashboard-style frame for the home page, with no side navigation.
- `components/guest-frame.tsx` is the centred white box on the wallpaper used for log in, sign up, errors and maintenance, like Nextcloud's login page.
- The header carries the site's one main menu (`components/site-nav.tsx`, on Base UI's navigation menu): Shop and Sell for everyone, then Vendor, Rider and Admin as the signed-in roles allow (all of them in demo mode). Panels slide between each other and labels do a letter swap on hover. Below 1024px it folds into a single Menu button. Every link in it, and in each area's side column, comes from `lib/nav.tsx`, so the two never disagree.
- Pop-ups all use `components/ui/modal.tsx` (Base UI dialog: focus stays inside, Escape closes, focus goes back), and the account menu is a Base UI menu, so arrow keys work everywhere a list opens.
- `/stores` and each store page have a coverflow switcher (`components/ui/coverflow-carousel.tsx`): swipe, arrow keys or the buttons swing the row round, and on a store page settling on another stall opens it.

## Layout

```
src/
  app/(home)/     the home page, laid out like Nextcloud's Dashboard
  app/(shop)/     the other shopper routes, wrapped in the shop navigation
  app/seller/     vendor dashboard
  app/rider/      rider app and rider application
  app/admin/      admin console
  app/login, app/signup
  app/globals.css design tokens and component classes
  components/     UI, including the app frame and the delivery map
  lib/api.ts      every backend call, with demo fallbacks
  lib/nav.tsx     every navigation link, for the header menu and the side columns
  lib/hooks.ts    hydration, change and draft hooks (no setState-in-effect)
  lib/guard.ts    server-side auth and role checks
  lib/safe.ts     validators for colours, URLs, slugs and redirects
  lib/mock/       demo catalogue, orders, riders and deliveries
  proxy.ts        CSP nonce, session refresh, private-path redirects
  store/cart.ts   bag, wishlist and recently viewed (local storage)
```
