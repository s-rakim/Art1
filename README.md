# The Bazaar

A multi-vendor marketplace. Independent stores rent a stall on the site, list their products and sell to shoppers. Riders pick up parcels from the stores and deliver them, and the shopper, the store and the admin can all follow the rider on a live map. The site owner runs everything from an admin console: approving stores, hiring riders, setting rent, fees and commission, and watching the income.

## Layout

| Path | What it is |
| --- | --- |
| `frontend/` | Next.js web app for shoppers, vendors, riders and admins |
| `backend/` | FastAPI service, background worker, Go search service, and the Postgres migrations |
| `compose.yml` | The whole stack on one server: web app, API, worker, search, Redis and Caddy |
| `Caddyfile` | One domain for everything: `/api/*` goes to the API, the rest to the web app |
| `.env.example` | Every setting for the whole stack, in one file |
| `DEPLOY.md` | Step by step guide to running it on an Oracle Cloud server with your own domain |

The backend's `openapi.json` is the contract between the two halves, and the frontend generates its API types from it. Each folder has its own README for working on that part.

## Accounts

Everyone signs in on the same page with their email and password, and the account decides where they land. There are four kinds of account: shopper, vendor, rider and admin.

- Shoppers sign up and start shopping.
- Riders sign up through their own link, fill in a hiring form, and get no access until an admin hires them.
- Vendors apply for a stall and get their back office once an admin approves the store.
- Admins are made from the server and can't sign up.

## Prices

Nothing in the code or the settings file fixes a price. Shipping, tax, the rider's fee, stall rent, commission and placements are all set by an admin in the console. Would-be vendors see the admin's contact details instead of a rent figure.

## Payments

Card payments are not switched on yet. Orders are paid by cash on delivery or bank transfer, and the store confirms the money arrived.

## Running it

See [DEPLOY.md](DEPLOY.md). In short: create a Supabase project, copy `.env.example` to `.env` and fill it in, then `docker compose up -d --build`. The images build for amd64 and arm64, so an ARM server works as well as a regular one.
