# Art1

A multi-vendor marketplace. Independent stores rent a stall on the site, list their products and sell to shoppers; riders pick up parcels from the stores and deliver them, with the shopper and the store following the rider on a live map. The site owner runs everything from an admin console: approving stores, hiring riders, setting rent and commission, and watching the income.

## Layout

| Folder | What it is |
| --- | --- |
| `backend/` | FastAPI service, a Go search service, and the Postgres/Supabase migrations. Ships as a Docker image. |
| `frontend/` | Next.js web app for shoppers, vendors, riders and admins. Ships as a Docker image. |

Each folder has its own README with setup steps. The backend's `openapi.json` is the contract between the two, and the frontend generates its API types from it.

## Accounts

There are four kinds of account: shopper, vendor, rider and admin. Shoppers, vendors and riders sign up themselves; vendors and riders only get their dashboards once an admin approves them. Admins are invited and can't sign up.

## Payments

Card payments are not switched on yet. Orders are paid by cash on delivery or bank transfer, and the store confirms the money arrived.

## Hosting

Both services run behind Caddy with Docker Compose. The images build for amd64 and arm64, so they run on an ARM server as well as a regular one.
