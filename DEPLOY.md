# Putting The Bazaar online

This guide takes the site from nothing to running on an Oracle Cloud server
with your own domain. Everything runs from one `compose.yml` at the root of
the repo, configured by one `.env` file.

What runs where:

| Piece | Where it lives |
| --- | --- |
| Web app (Next.js), API (FastAPI), background worker, search, Redis, Caddy | Your Oracle server, in Docker |
| Database, sign-in, photo and video storage | A Supabase project |

Caddy is the only thing listening on the internet. It gets the TLS
certificate, sends `/api/*` (and the live updates socket at `/api/v1/ws/live`)
to the API, and everything else to the web app. Shoppers only ever see one
domain.

Allow about an hour the first time.

## 1. Supabase

1. Create a project at supabase.com. Pick the region closest to your
   shoppers and save the database password somewhere safe.
2. **Authentication > URL Configuration.** Set the Site URL to
   `https://yourdomain.com` and add `https://yourdomain.com/**` to the
   redirect URLs.
3. **Authentication > Sign In / Providers > Email.** Keep email sign-in on
   and keep "Confirm email" on. The API refuses accounts without an email
   address.
4. **Authentication > Emails > SMTP.** Supabase's built-in mailer only sends
   a handful of emails an hour, which is fine for testing and not for a shop.
   Before launch, plug in an SMTP provider (Resend, Postmark, Brevo, SES).
5. **Connect** (top of the dashboard) **> Session pooler.** Copy that
   connection string for `DATABASE_URL`. Use the session pooler on port 5432,
   not the transaction pooler on 6543: the API and search keep a listening
   connection open for live updates, and only session mode allows that. The
   direct connection is IPv6 only, which most Oracle networks don't have.
6. **Project Settings > API Keys.** You need the anon key and the service
   role key. Either style works: the legacy JWT keys (`eyJ...`) or the newer
   publishable and secret keys (`sb_publishable_...`, `sb_secret_...`).
7. **Project Settings > JWT Keys.** If the project signs tokens with the
   legacy shared secret, copy it into `SUPABASE_JWT_SECRET`. If it uses the
   newer signing keys, leave `SUPABASE_JWT_SECRET` empty: the API fetches the
   public keys from your project and checks tokens against them.

You don't create any tables or storage buckets by hand. The first start of
the stack runs every migration, creates the `product-images` and
`product-videos` buckets with their size and type limits, and locks the
tables down with row level security.

## 2. The Oracle server

Create the instance:

- **Shape:** VM.Standard.A1.Flex (Ampere, ARM). 2 OCPUs and 12 GB of memory
  is comfortable. The stack itself uses about 2.5 GB; building the web app
  needs another 2 GB or so while it runs.
- **Image:** Canonical Ubuntu 24.04.
- **Networking:** a public subnet with a public IPv4 address. Reserve the
  address (Networking > Reserved public IPs) so it survives a stop and start.

Open the firewall in two places. In the Oracle console, go to your VCN,
open the subnet's security list and add ingress rules from `0.0.0.0/0` for
TCP 80, TCP 443 and UDP 443 (UDP is for HTTP/3).

Then on the server. Oracle's Ubuntu image has its own iptables rules that
reject everything except SSH, so open the same ports there. Do this before
installing Docker, so the saved rules don't pick up Docker's own chains:

```bash
sudo iptables -I INPUT -p tcp -m multiport --dports 80,443 -m state --state NEW -j ACCEPT
sudo iptables -I INPUT -p udp --dport 443 -m state --state NEW -j ACCEPT
sudo netfilter-persistent save
```

Install Docker and git:

```bash
sudo apt-get update && sudo apt-get install -y git
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out and back in so the group change takes effect
```

## 3. DNS

At your domain registrar, add an A record for `yourdomain.com` pointing at
the server's public IP. If you want `www.yourdomain.com` to redirect to it,
add an A record for `www` too; otherwise delete the `www.` block at the
bottom of the `Caddyfile`.

Wait until `ping yourdomain.com` answers from the right address before
starting the stack, or Let's Encrypt won't be able to issue the certificate.

## 4. Configure

```bash
git clone https://github.com/s-rakim/Art1.git bazaar && cd bazaar
cp .env.example .env
chmod 600 .env
nano .env
```

`.env.example` explains every setting. The ones you have to fill in:

| Setting | Value |
| --- | --- |
| `SITE_DOMAIN` | `yourdomain.com`, with no `https://` |
| `ACME_EMAIL` | your email, for certificate expiry notices |
| `DATABASE_URL` | the session pooler string from step 1.5, with your password in it and `?sslmode=require` on the end |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | the anon or publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | the service role or secret key |
| `SUPABASE_JWT_SECRET` | the legacy JWT secret, or empty (step 1.7) |
| `MAP_CENTER` | `lat,lng` of your city |
| `CURRENCY` | `KES` for M-Pesa |
| `PAYMENT_WEBHOOK_TOKEN` | a long random secret, `openssl rand -hex 24`. Only needed for the SMS forwarder or Daraja (step 7) |

Leave prices alone: there aren't any in `.env`. Shipping, tax, the rider's
fee and commission, stall rent, placements, the payout interval and the till
or bank account buyers pay into are all set by an admin in the console once
the site is up.

The anon key ends up in the web app's JavaScript, which is expected; row
level security decides what it can read and it can't write anything. The
service role key and the database URL never leave the API, worker and
migration containers. The web container gets no secrets at all.

## 5. Start it

```bash
docker compose up -d --build
docker compose logs -f migrate api web caddy
```

The first build takes ten to fifteen minutes on an Ampere box; later builds
reuse the cache. What happens on every `up`:

1. `migrate` applies any new migrations and exits.
2. `api`, `worker` and `search` start once it has finished cleanly. If a
   migration fails, nothing else starts and the error is in
   `docker compose logs migrate`.
3. `web` starts once the API is up.
4. Caddy fetches the certificate and starts serving.

Check it from your own computer:

```bash
curl https://yourdomain.com/api/v1/status
```

That should return the site's fees and contact details as JSON, and the home
page should load in a browser.

### Demo data

To look around with sample stores and products before real vendors join,
set `SEED_DEMO=true` in `.env` and run:

```bash
docker compose run --rm migrate
```

Set it back to `false` afterwards. Before you go live, remove the demo
stores, their products and their owners in Supabase's SQL editor:

```sql
delete from stores where slug like 'demo-%';
delete from profiles where email like 'demo-owner-%@example.invalid';
```

## 6. Make yourself the admin

Sign up on the site with your own email and confirm it from the email
Supabase sends. Then:

```bash
docker compose exec api python -m app.cli make-admin you@yourdomain.com
```

Sign out and back in, and you land on the admin console. From there:

- set shipping, tax, the rider's fee, and the contact details shown to
  would-be vendors on the stall page
- set stall rent, commission and placement prices
- set where buyers pay: the M-Pesa till or paybill number, or the bank
  name, account name and number, plus a line of instructions. Every order
  on the site is paid into this one account
- set how riders work: their commission on the delivery charge, how far
  away riders are looked for (`rider_pool_radius_km`, 15 by default), how
  close two shops must be to share a run (`rider_pickup_radius_km`, 2), how
  close the drop-offs must be (`rider_batch_radius_km`, 8) and how many jobs
  one rider can carry (`rider_max_batch`, 3)
- set the payout interval (`payout_interval_days`, 7) and how long an
  unmatched payment code stays usable (`payment_code_ttl_hours`, 72)
- hire or turn down rider applications
- approve vendors

Once you've set up a second factor for your account in Supabase, set
`ADMIN_REQUIRE_MFA=true` and run `docker compose up -d`. From then on every
admin action needs a session that passed the second factor.

### Optional: a read-only login for search

The search service only reads four tables. To give it a login that can't
change anything, run this in Supabase's SQL editor with a password of your
own:

```sql
create role bazaar_search login password 'a-long-random-password' bypassrls;
alter role bazaar_search set default_transaction_read_only = on;
grant usage on schema public to bazaar_search;
grant select on categories, products, stores, product_variants to bazaar_search;
```

Then set `SEARCH_DATABASE_URL` to the same session pooler string with the
user changed to `bazaar_search.<project-ref>` and the new password, and run
`docker compose up -d`.

## 7. Getting payment messages in

Riders confirm payment at the door by the transaction code, so the codes
have to be in the system first. There are three ways, and you can use more
than one. A code is stored once, however many ways it arrives.

**Paste them.** Admin console > Payments > Import. Paste one or many M-Pesa
or bank SMS, check the preview, then save. Nothing else to set up.

**Forward them from a phone.** Put the till's SIM in a spare Android phone
and install an SMS forwarding app that can POST to a web address. Point it
at

```
https://yourdomain.com/api/v1/payments/sms/<PAYMENT_WEBHOOK_TOKEN>
```

with the body `{"text": "<the message>"}` (most apps let you set this as a
JSON template). Only forward messages from MPESA and your bank's sender
name. Anyone with the address can post to it, so treat it like a password;
if it leaks, change `PAYMENT_WEBHOOK_TOKEN` and the phone, then
`docker compose up -d`.

**Daraja.** Once Safaricom has approved a Daraja app for the till, with
OAuth switched on, set `MPESA_ENV`, `MPESA_SHORTCODE`,
`MPESA_CONSUMER_KEY` and `MPESA_CONSUMER_SECRET` in `.env`, run
`docker compose up -d`, then register the callback once:

```bash
docker compose exec api python -m app.cli register-mpesa-urls
```

From then on every till payment is posted to the API the moment it lands.
Try it with `MPESA_ENV=sandbox` and the sandbox shortcode first. Do this
again if you change the domain or the token.

Unmatched codes expire after `payment_code_ttl_hours`. Confirmed ones are
kept for good and can't be used twice.

### Paying the stores

Admin console > Settlements lists what each store is owed once takings have
been held for the payout interval, minus rent, commission and delivery.
Pay the store from the till or bank as you normally would, then record it
there with the M-Pesa or bank reference. It only lets you once the books
balance: no vendor sheet entries waiting for you, no delivered order still
unpaid and no rider waiting at a door. You can settle anyway with a note,
and the note is kept.

## Day to day

| Task | How |
| --- | --- |
| Update to the latest code | `git pull && docker compose up -d --build` |
| Apply new migrations | Happens on every `up`. To run them on their own: `docker compose run --rm migrate` |
| See what's happening | `docker compose ps`, `docker compose logs -f api worker` |
| Change a setting in `.env` | Edit it, then `docker compose up -d --build`. Settings the browser uses (domain, Supabase URL and anon key, store name, currency, map) are built into the web app, so the rebuild matters. |
| Put the site in maintenance | Admin console > Maintenance |
| Restart one piece | `docker compose restart api` |
| Free disk space after many updates | `docker image prune -f && docker builder prune -f` |

### Backups

Supabase's daily backups come with its paid plans. On the free plan, or as a
second copy, dump the database yourself. Supabase runs Postgres 17, so use a
Postgres 17 client:

```bash
mkdir -p ~/backups
docker run --rm --env-file .env postgres:17-alpine \
  sh -c 'pg_dump "$DATABASE_URL" --no-owner --schema=public' \
  | gzip > ~/backups/bazaar-$(date +%F).sql.gz
```

Put that in `crontab -e` to run nightly, and copy the files somewhere off the
server (Oracle Object Storage, or your own machine). Photos and videos live
in Supabase Storage and are not in the dump.

### Prebuilt backend images

Every push to `main` builds the API and search images for amd64 and arm64
and publishes them to GitHub's container registry. To use them instead of
building on the server, set `IMAGE_PREFIX=ghcr.io/s-rakim/bazaar` and
`IMAGE_TAG=latest` in `.env`, then:

```bash
docker compose pull migrate api worker search
docker compose build web
docker compose up -d
```

The web app is always built on the server, because your domain and Supabase
project are built into it.

## Trying it on your own computer

Set `SITE_DOMAIN=localhost` and `ACME_EMAIL` to anything, fill in the
Supabase values, and run `docker compose up -d --build`. Caddy uses its own
local certificate authority for `localhost`, so the browser shows a warning
the first time; accept it, or trust Caddy's root certificate from the
`caddy_data` volume. Add `https://localhost/**` to the Supabase redirect URLs
for sign-in to work.

`docker compose --profile localdb up -d` runs Postgres in a container
instead of Supabase's database (see the bottom of `.env.example`). Sign-in
and uploads still go to your Supabase project.

## When something is wrong

| Symptom | Likely cause |
| --- | --- |
| Caddy logs `challenge failed` or `no such host` | DNS doesn't point at the server yet, or ports 80 and 443 are closed in the security list or iptables |
| `migrate` exits with `password authentication failed` | Wrong password in `DATABASE_URL`, or the user isn't in the `postgres.<project-ref>` form the pooler wants |
| `migrate` exits with `connection refused` or hangs | Using the direct connection (IPv6) instead of the session pooler |
| Everyone gets 401 after signing in | `SUPABASE_URL` doesn't match the project, or the JWT secret is wrong. With the newer signing keys, leave the secret empty |
| Live map and order updates don't arrive | `DATABASE_URL` points at the transaction pooler (port 6543). Use the session pooler on 5432 |
| Photo or video upload fails with `uploads_disabled` | `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing from `.env` |
| Photo or video upload fails with `upload_failed` | The service role key is wrong, or the storage buckets weren't created (check `docker compose logs migrate`) |
| The web container restarts with an out of memory error during build | Give the instance more memory, or add swap: `sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |
