# Marketplace backend

This is the server side of the shop: a multi-vendor marketplace where other
retailers rent space to sell, riders carry orders from stores to buyers, and
everyone can watch the delivery move on a map.

It is three small programs and a database.

| Piece | Language | What it does |
| --- | --- | --- |
| `api/` | Python, FastAPI | The HTTP and websocket API the frontend talks to. Also runs the background worker and the migration runner. |
| `search/` | Go | Keeps the whole catalogue in memory and answers searches in a millisecond or two: typo tolerant, plural aware, search-as-you-type, facet counts. |
| `supabase/migrations/` | SQL, PL/pgSQL | The schema, the money logic (checkout, payment confirmation, cancellations, rent billing) and the row level security lockdown. |
| `scripts/` | Bash | The migration runner and demo data. |

Supabase provides Postgres, sign in, and image storage. Everything else
runs in Docker on your own server.

## How the marketplace works

**Four kinds of account.** Everybody signs up through Supabase Auth and
starts as a customer. From there:

- A **vendor** applies with `POST /seller/applications`, choosing a plan. An
  admin approves the store, which makes the account a vendor and starts the
  lease.
- A **rider** applies with `POST /rider/applications`. An admin hires them.
- An **admin** can't sign up at all. The first one is made from the server
  (see below) and can promote others.

Roles live in the `profiles` table and are checked on every request. They are
mirrored into Supabase `app_metadata.roles` (as `customer`, `vendor`,
`rider`, `admin`) so the frontend can show the right pages, but the API never
trusts the token for that.

**Renting space.** A store signs a plan. Plans mix the two models the big
marketplaces use: a monthly rent and a commission on each sale, with a
pay-per-unit tier for small sellers. Out of the box:

| Plan | Rent | Commission | Live products | Free placement days |
| --- | --- | --- | --- | --- |
| Starter Stall | none | 15% + $0.99 a unit | 25 | 0 |
| Boutique | $29 | 10% | 500 | 1 a month |
| Flagship | $149 | 6% | unlimited | 4 a month |

The first month is charged when a store is approved and every month after by
the worker. Stores can also book paid placements by the day: the homepage
hero, homepage picks, category spotlights and sponsored search results.
Prices and plans are all editable from the admin API.

**Orders.** A checkout can contain products from several stores. It becomes
one order for the buyer and one sub-order per store, so each store packs and
ships its own part. Prices, volume discounts, coupons and shipping are always
worked out in the database while the stock rows are locked; the client only
says what and how many.

**Payments.** Card payments are wired for Stripe but switched off until you're
ready. Until then buyers choose cash on delivery or bank transfer, and the
store presses "confirm payment" when the money arrives. Every movement of a
store's money is a row in `ledger_entries`: sales, commission, per unit fees,
rent, placements, delivery fees, payouts and refunds. A store's balance is
the sum. Sales paid through the platform are held for `PAYOUT_HOLD_DAYS`
before they can be paid out.

**Deliveries.** When an order is ready, the store picks an available rider
(sorted by distance from the store) and dispatches them. The rider sees only
the rough area until they accept, then the exact address. While they're on
the job their phone sends its position every 10 to 15 seconds, and the buyer,
the store and the admin watch it live. At the door the buyer reads a six
digit handover code to the rider; without it the parcel can't be marked
delivered, and five wrong guesses lock the delivery.

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

### Live tracking

Connect to `wss://<api>/api/v1/ws/tracking` and send the token as the first
message, not in the URL:

```json
{"type": "auth", "token": "<supabase access token>"}
{"type": "subscribe", "delivery_id": "<id from /orders/{id}/tracking>"}
```

You'll get `location` events (`lat`, `lng`, `heading`, `at`) and `status`
events. Admins can subscribe with `{"type": "subscribe", "scope": "admin"}`
to see every rider on shift. `GET /orders/{id}/tracking` gives the current
state, the ETA and the handover code if the socket isn't open.

## Running it on your Oracle server

These steps assume an Ubuntu Ampere A1 instance. The images are built for
both arm64 and amd64, so any shape works.

### 1. Set up Supabase

1. Create a project at supabase.com.
2. In **Storage**, create a public bucket called `product-images`.
3. In **Authentication > Providers**, keep email on and turn on "Confirm
   email". Add Google or others if you want them.
4. Collect, from **Project Settings**:
   - the database connection string (Database > Connection string, session
     pooler on port 5432),
   - the project URL and the JWT secret (API settings). Newer projects that
     use asymmetric signing keys can leave the secret empty; the API reads
     the public keys instead,
   - the `service_role` key. It never leaves the server.

### 2. Prepare the server

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# Oracle's Ubuntu images ship with iptables rules that block everything but
# SSH, on top of the cloud firewall. Open 80 and 443 in both places:
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Then in the Oracle console, add ingress rules for TCP 80 and 443 (and UDP 443
for HTTP/3) to the subnet's security list.

Point a DNS record such as `api.yourshop.com` at the server's public IP.

### 3. Configure and start

```bash
git clone https://github.com/s-rakim/Art1.git && cd Art1/backend
cp .env.example .env
nano .env        # fill in the domain, Supabase values and CORS origins
chmod 600 .env

docker compose pull        # prebuilt images from GitHub, or:
docker compose build       # build on the server itself
docker compose up -d
docker compose logs -f api
```

`migrate` runs first and exits, then the API, worker and search start. Caddy
fetches a TLS certificate for `API_DOMAIN` on its own.

Want sample stores and products to look at? Set `SEED_DEMO=true`, run
`docker compose run --rm migrate`, then set it back.

### 4. Make yourself an admin

Sign up on the site with your own email, load any page while signed in, then:

```bash
docker compose exec api python -m app.cli make-admin you@yourshop.com
```

Turn on `ADMIN_REQUIRE_MFA=true` once you've set up a second factor in
Supabase: every admin endpoint will then demand it.

### Running without Supabase

For a quick trial you can run Postgres on the box instead. Set
`DATABASE_URL=postgresql://market:<password>@db:5432/market`,
`LOCAL_DB_PASSWORD=<password>` and a long random `SUPABASE_JWT_SECRET` in
`.env`, then `docker compose --profile localdb up -d`. You'll need some way to
issue tokens signed with that secret; for a real launch, use Supabase.

## Day to day

| Task | Command |
| --- | --- |
| Update to the latest images | `docker compose pull && docker compose up -d` |
| Apply new migrations | happens on every `up`; or `docker compose run --rm migrate` |
| Put the site in maintenance | `PATCH /api/v1/admin/settings {"maintenance_mode": true}` |
| Charge rent now instead of waiting a minute | `POST /api/v1/admin/billing/run` |
| Back up | Supabase backs up daily; for `localdb`, `docker compose exec db pg_dump -U market market > backup.sql` |

The worker charges rent that has come due, turns placements on and off,
cancels unpaid card and bank transfer orders after a while to free their
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
- **Deliveries**: riders see only the rough area until they accept; buyers
  see the rider's first name and the last three digits of their phone; the
  handover code locks after five wrong tries.
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
