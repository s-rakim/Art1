# The Bazaar: backend

This is the server side of The Bazaar: a market where independent retailers
rent a stall to sell, riders carry orders from the stalls to buyers, and the
buyer, the stall and the admin all watch the delivery move on a map.

It is three small programs and a database.

| Piece | Language | What it does |
| --- | --- | --- |
| `api/` | Python, FastAPI | The HTTP and websocket API the frontend talks to. Also runs the background worker and the migration runner. |
| `search/` | Go | Keeps the whole catalogue in memory and answers searches in a millisecond or two: typo tolerant, plural aware, search-as-you-type, facet counts. |
| `supabase/migrations/` | SQL, PL/pgSQL | The schema, the money logic (checkout, payment confirmation, cancellations, rent billing), the live event triggers and the row level security lockdown. |
| `scripts/` | Bash | The migration runner and demo data. |

Supabase provides Postgres, sign in, and file storage. Everything else runs
in Docker on your own server.

## How The Bazaar works

**One login, four kinds of account.** Everyone signs in on the same page with
an email address and password (Supabase Auth). The account decides where
they land: `GET /me` returns the role and a `home` path, and phone-number
sign-ins are refused. There are two sign-up links:

- **Shoppers** sign up, confirm their email, log in and land on the home page.
- **Riders** sign up through the rider link (the frontend sends
  `user_metadata.requested_role = "rider"`). The account starts as a
  `rider_applicant`, which can do exactly two things: fill in the hiring form
  (`POST /rider/applications`) and check on it (`GET /rider/me`). Every other
  endpoint answers 403 `rider_not_hired`. The application shows up on the
  admin's hiring page (`GET /admin/rider-applications`), where the admin
  hires (`POST .../approve`) or turns it down (`POST .../reject`). Only a
  hired rider gets into the rider app, and one who is later let go drops back
  to waiting rather than to shopping.
- **Vendors** start as shoppers and apply for a stall with
  `POST /seller/applications`. An admin approves the store.
- **Admins** can't sign up at all. The first one is made from the server
  (see below) and can promote others.

Sign-up metadata can only ever lower what an account may do: asking for
`admin` or `vendor` there gets an ordinary shopper. Roles live in the
`profiles` table and are checked on every request. They are mirrored into
Supabase `app_metadata.roles` for the frontend's convenience, but the API
never trusts the token for that.

**Prices are the admin's.** Nothing about money is fixed in the code. The
admin sets shipping, the free shipping threshold, tax and the rider's fee in
`PATCH /admin/settings`, and stall rent and commission per plan in
`PATCH /admin/plans/{id}`. The public plan list (`GET /plans`) says what each
stall plan includes but not what it costs; `GET /status` carries the admin
contact (name, email, phone, WhatsApp, a note) the rent-a-stall page shows
instead. A fresh install starts with three plans (Starter Stall, Boutique,
Flagship) and shipping at 4.99, which the admin is expected to change.

The first month of rent is charged when a store is approved and every month
after by the worker. Stores can also book paid placements by the day: the
homepage hero, homepage picks, category spotlights and sponsored search
results.

**Products.** Vendors upload photos and one video per product. The files go
through the API, not straight to storage, so they can be checked: photos must
decode as JPEG, PNG, WebP or AVIF and are re-encoded to WebP at most 2000 px
across, which strips EXIF data such as GPS positions and anything hidden in
the file. Videos must be well formed MP4, MOV or WebM, at most 50 MB and three
minutes; an MP4 has to be a clean chain of boxes from first byte to last, so a
file that is also a web page is turned away. Everything lands under the
store's own folder with a random name, and product image URLs must point
there. Stock can be edited one variant at a time or in bulk
(`PATCH /seller/inventory`, all or nothing), and every manual change is kept
with who made it and why (`GET /seller/inventory/history`).

**Orders.** A checkout can contain products from several stores. It becomes
one order for the buyer and one sub-order per store, so each store packs and
ships its own part. Prices, volume discounts, coupons and shipping are always
worked out in the database while the stock rows are locked; the client only
says what and how many. The buyer drops a pin for delivery at checkout and
can move it (`PUT /orders/{id}/dropoff`) until the parcel arrives.

**Payments.** Every buyer pays one account: The Bazaar's M-Pesa till or bank
account, which the admin sets in the console (`PATCH /admin/settings`) and
which `/status` shows to the apps. Stores never take money directly and can't
mark an order paid. A checkout that spans several stores is still one
payment. Buyers either pay on arrival (`cod`: M-Pesa or bank while the rider
is at the door) or pay first (`bank_transfer`).

Payment messages go into a payments bank (`payment_receipts`). They arrive
three ways: an admin pastes or forwards M-Pesa and bank SMS
(`POST /admin/payments/import`, preview first, then commit), a phone forwards
them as they come in (`POST /payments/sms/{token}`), or Safaricom's Daraja
posts each till payment (`/payments/till/{token}/confirmation`). The reader
pulls out the transaction code, amount, payer's name and phone, time and any
order number, caps and cleans the text, and stores each code once. A code is
unconfirmed until it is matched to an order, then confirmed for good:
a database trigger refuses to change, reuse or delete a confirmed code, and
unconfirmed ones expire after `payment_code_ttl_hours`. Partial payments add
up; the order's store parts are marked paid once their total is covered.

At the door the rider taps "arrived" (the admin and the buyer see it live),
then types the transaction code or the payer's name. They see the amount and
whether it covers the order, and confirm. Two riders racing for the same code
can't both win: the order and the receipt are locked, and the loser gets
`code_used`. Only then can the parcel be marked delivered, with the buyer's
handover code as before. An admin can match a code to an order from the
console too (`PATCH /admin/payments/{id}`), or void a bad one.

**Ledger and payouts.** Every movement of a store's money is a row in
`ledger_entries`: sales, commission, per unit fees, rent, placements, the
rider's delivery fee, payouts and refunds. A store's balance is the sum.
Takings are held for the admin's payout interval (`payout_interval_days`),
then show as owed on `GET /admin/settlements`. The admin pays a store and
records it (`POST /admin/settlements/{store_id}`) once the books balance:
no vendor sheet entries waiting, no delivered orders still unpaid and no
rider waiting at a door. Settling early or with open items needs `force` and
a note.

**Sheets.** Read-only sheets per store: ledger, sales, payments (with the
codes), inventory sold, the vendor's own entries and payouts. Each comes as
JSON or CSV (`?format=csv`). A vendor gets only their own store
(`GET /seller/sheets/{sheet}`); the admin gets any store or all of them
(`GET /admin/sheets/{sheet}`). The editable sheet is `sheet_entries`: a
vendor adds and fixes rows (`/seller/sheet-entries`), and they stay pending
until the admin confirms them against a transaction code or other reference
(`POST /admin/sheet-entries/{id}/confirm` with the matching key). Confirmed
rows are locked and appear in the read-only sheets. Every change to entries
and payment codes goes to `audit_log`, which the database won't let anyone
edit or delete (`GET /admin/audit`). CSV cells that start with `=`, `+`, `-`
or `@` are escaped so a spreadsheet won't run them.

**Deliveries.** As soon as a store order is ready to leave (straight away for
pay on arrival, once paid for bank transfer), it is offered to the closest
free rider to the shop: hired, on shift, seen in the last ten minutes, not
holding another offer, and within the admin's pool radius. Riders with
nothing on are asked first. The rider has `DISPATCH_ACCEPT_SECONDS` to
accept; a decline or silence passes it to the next closest, and with nobody
free the order waits and the worker tries again every 15 seconds.

Riders also see a job board (`GET /rider/open-jobs`) of waiting orders and
can claim or skip them. A rider on a run can only add jobs whose shop is
close to the shop of the run (`rider_pickup_radius_km`) and whose drop-off is
close to the run's drop-offs (`rider_batch_radius_km`), up to
`rider_max_batch` at once; anything else is marked not batchable. The same
rule, one database function, applies to offers, claims and a store choosing
a rider by hand. `GET /rider/run` returns the stops and a route in the order
the jobs were placed. A rider earns the admin's flat fee plus their
commission on the delivery charge, fixed on the delivery when it is created.

The store can step in at any time, pull a job back and pick a rider itself.
The rider sees only the rough area until they accept, then the exact pin,
the buyer's phone and their note. While they're on the job their phone sends
its position, heading and speed every 10 to 15 seconds, and the buyer, the
store and the admin watch it live, and nobody else. At the door the buyer
reads a six digit handover code to the rider; without it the parcel can't be
marked delivered, and five wrong guesses lock the delivery.

**Wishlist and choosing what to buy.** The wishlist is separate from the
cart (`/wishlist`, and `POST /cart/items/{id}/save-for-later` moves a line
across). Checkout can take some cart lines (`cart_item_ids`); the rest stay in
the cart.

Vendors get a riders list (`GET /seller/riders`) with the riders on their
jobs, those who delivered for them lately, and free riders nearby. Phone
numbers are shown only for riders who work the store's orders and exact
positions only while a rider is out on one of them. Admins see every rider
with contact details, last position and recent jobs (`GET /admin/riders`,
`GET /admin/riders/{id}`).

## API

The full contract is in [`openapi.json`](openapi.json) and served live at
`/api/v1/openapi.json`. Interactive docs are at `/api/v1/docs` outside
production (or with `EXPOSE_DOCS=true`).

Some conventions:

- Authenticate with the Supabase access token: `Authorization: Bearer <token>`.
- Money is integer cents with a three letter currency code.
- Lists return `{items, total, page, page_size}`. `page_size` goes up to 100.
- Errors return `{"error": {"code": "out_of_stock", "message": "Only 2 left of ..."}}`.
  The code is stable for the frontend to switch on; the message is safe to show.

### Live updates

Connect to `wss://<api>/api/v1/ws/live` (also served at `/ws/tracking`) and
send the token as the first message, not in the URL:

```json
{"type": "auth", "token": "<supabase access token>"}
{"type": "subscribe", "scope": "me"}
```

`scope: "me"` streams whatever concerns that account: `order` (the buyer and
the store), `job` (the rider, the store and the buyer), `stock` (the store),
`application` (the applicant and admins) and `catalog` (everyone, when a live
product is edited). Add `{"type": "subscribe", "delivery_id": "..."}` to
follow one delivery on a map (`location` with `lat`, `lng`, `heading`,
`speed_kmh`, and `status`); only the buyer, the store, the rider and admins
may. Admins can subscribe with `{"type": "subscribe", "scope": "admin"}` to
see every rider on shift. Events are fired by database triggers, so every
change announces itself whichever code made it, and only after it commits.
The server closes the socket with code 4001 when the token expires; reconnect
with a fresh one. The full protocol is at the top of `api/app/realtime.py`.

## Running it

The backend runs as part of the whole stack from `compose.yml` at the root
of the repo, configured by the root `.env.example`. [DEPLOY.md](../DEPLOY.md)
covers Supabase, the Oracle server, DNS, the first admin, updates and
backups.

The one image under `api/` serves three roles in that stack: `migrate`
applies migrations and exits, `api` serves HTTP and the live socket, and
`worker` runs the background jobs. Every 15 seconds the worker offers ready
orders to the nearest free rider and moves on from riders who let an offer
time out. Every minute it charges rent that has come due, turns placements
on and off, cancels unpaid card and bank transfer orders to free their
stock, and prunes rider location history older than 14 days.

## Security

This was built expecting people to try to break it. What's in place:

- **Tokens** are verified on every request: signature, expiry, audience,
  issuer, an algorithm allowlist (so `alg: none` and HS/RS confusion fail),
  and the token must be a signed in user, not the anon or service key.
- **Roles** come from the database, never the token. Every vendor query is
  scoped to the caller's own store id, every rider query to their own
  deliveries, every buyer query to their own orders. Asking for someone
  else's thing returns 404, the same as asking for something that doesn't
  exist.
- **Input** models reject unknown fields, so nobody can slip in `price`,
  `store_id`, `status` or `role`. Text is length capped and stripped of
  control characters, image links must be `https`, colours must be `#rrggbb`,
  coordinates must be on Earth. Sorts are a fixed list. SQL is always
  parameterised.
- **Money** logic runs inside the database with row locks, so two checkouts
  can't oversell the last item and two payout requests can't overdraw a
  balance. Buyers can't buy from their own store or review products they
  haven't bought.
- **The database** has row level security on every table. Supabase's public
  `anon` and `authenticated` roles can read the public catalogue and their own
  orders and nothing else; they can't write anything, can't call any of our
  functions over `/rest/v1/rpc`, and can't see store applications, ledgers,
  riders or locations. The lockdown re-runs after every migration so new
  tables are covered automatically.
- **Transport**: strict CORS allowlist without credentials, security headers
  on every response, no caching of personal responses, a request size cap at
  Caddy and again in the API, per IP rate limits and tighter per user limits
  on checkout, applications, reviews, payouts, dispatch and location updates.
  Caddy throws away any X-Forwarded-For a client sends and passes on the
  real address, so nobody can dodge the limits by making one up.
- **Deliveries**: riders see only the rough area until they accept; buyers
  see the rider's first name and the last three digits of their phone; the
  handover code locks after five wrong tries. Live positions reach the buyer,
  the store, the rider and admins of that delivery only, and a socket is
  closed when its token expires so a suspended rider or demoted admin stops
  hearing events within the hour.
- **Accounts**: sign-up metadata can only lower an account's rights, riders
  can do nothing but apply until hired, and phone-only sign-ins are refused.
- **Uploads**: photos are decoded and re-encoded (no EXIF, no smuggled
  payloads, no decompression bombs), videos must be structurally valid
  MP4/MOV/WebM, the browser's claimed file type is ignored, files are stored
  under the store's own folder with random names, and a store can only
  attach, replace or delete its own files. Only the upload routes accept
  bodies over 2 MB, at Caddy and in the API.
- **Payment codes**: a transaction code is unique in the database and, once
  confirmed, can't be changed, reused or deleted, even by an admin with SQL
  access through the API. Confirming locks the order and then the code, so
  two riders at two doors can't both spend it. Riders can only look up codes
  for a delivery they are standing at; a name search shows at most three
  unconfirmed matches with the code masked, and a code already used elsewhere
  just reads as used. Lookups are rate limited per rider. Message text is
  capped at 2,000 characters and cleaned before anything reads it.
- **Payment feeds** (`/payments/sms/{token}`, `/payments/till/{token}/...`)
  need a secret of at least 32 characters in the address, checked in
  constant time, and Daraja posts must name our own shortcode. The secret is
  masked in Caddy's logs and the API's access log is off. The feeds stay open
  during maintenance so no payment message is lost.
- **Sheets and audit**: vendor sheets are filtered by the caller's store in
  SQL, never by a parameter. Confirmed sheet entries are locked by a trigger,
  and `audit_log` refuses updates, deletes and truncation. CSV exports escape
  formula characters.
- **Webhooks**: Stripe events are signature checked and cross-checked
  against the order's amount, currency and session before anything is
  marked paid. The endpoint doesn't exist until Stripe is configured.
- **Containers** run as non-root on read-only filesystems with every Linux
  capability dropped. Only Caddy publishes ports. The search service image
  is distroless.
- **Supply chain**: every dependency is pinned and Dependabot proposes
  updates weekly. CI publishes SBOMs and provenance with each image.

`api/tests/test_security.py` turns each of these into a test. If you find
something it misses, add a test that fails, then fix it.

## Developing

```bash
# A throwaway Postgres
docker run -d --name pg -e POSTGRES_PASSWORD=pg -p 5433:5432 postgres:16-alpine

cd api
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
pytest                                   # makes and drops its own database

cd ../search && go test ./...

# After changing an endpoint, refresh the contract the frontend uses:
cd ../api && python -m app.cli export-openapi > ../openapi.json
```
