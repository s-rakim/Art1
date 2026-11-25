"use client";
import { useMemo, useState, type ReactNode } from "react";
import type { Rider } from "@/lib/types";
import { DeliveryMap, type MapPin } from "./delivery-map";
import { ChevronDown } from "./icons";
import { StatusTag } from "./status-tag";

const vehicle = (v: string) => (v ? v.replace(/_/g, " ") : "Vehicle not given");

function seen(at: string | null | undefined) {
  if (!at) return null;
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function State({ r }: { r: Rider }) {
  if (r.status !== "active") return <StatusTag status={r.status} />;
  if (!r.on_shift) return <span className="chip chip-secondary">Off shift</span>;
  if (r.active_deliveries > 0) return <span className="chip chip-primary">On a job</span>;
  return <span className="chip chip-success">Free</span>;
}

const RELATION: Record<NonNullable<Rider["relation"]>, string> = { on_job: "On your order", recent: "Delivered for you", nearby: "Near your shop" };

/** Only digits and a leading plus survive into a tel: link. */
const telHref = (p: string) => `tel:${p.replace(/[^0-9+]/g, "")}`;

/**
 * Riders as an expandable list. Each row opens to show where the rider is on a live map,
 * how to reach them and how busy they are. Vendors see distance to their shop; admins get
 * extra actions through `actions`.
 */
export function RidersList({
  riders,
  showDistance = false,
  showLicence = false,
  actions,
  empty = "No riders to show.",
}: {
  riders: Rider[];
  showDistance?: boolean;
  showLicence?: boolean;
  actions?: (r: Rider) => ReactNode;
  empty?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const nearest = showDistance ? riders.find((r) => r.on_shift && r.distance_km != null)?.id : undefined;

  if (!riders.length) return <p className="rounded-container border border-border-dark bg-main-background px-4 py-8 text-center text-[14px] text-maxcontrast">{empty}</p>;

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-container border border-border-dark bg-main-background">
      {riders.map((r) => {
        const expanded = open === r.id;
        const last = seen(r.position?.at);
        return (
          <li key={r.id}>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={`rider-${r.id}`}
              onClick={() => setOpen(expanded ? null : r.id)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-background-hover ${expanded ? "bg-background-hover" : ""}`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-element-light text-[15px] font-semibold text-primary-element-light-text">
                {r.full_name.trim().charAt(0).toUpperCase() || "R"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold">{r.full_name}</span>
                  {r.id === nearest && <span className="chip chip-primary">Nearest</span>}
                  {showDistance && r.relation && r.relation !== "nearby" && <span className="chip chip-secondary">{RELATION[r.relation]}</span>}
                </span>
                <span className="block truncate text-[13px] capitalize text-maxcontrast">
                  {vehicle(r.vehicle)}
                  {showDistance && r.distance_km != null && ` · ${r.distance_km.toFixed(1)} km from your shop`}
                  {!showDistance && r.city && ` · ${r.city}`}
                  {r.on_shift && last && ` · seen ${last}`}
                </span>
              </span>
              <State r={r} />
              <ChevronDown size={20} className={`shrink-0 text-maxcontrast transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
            {expanded && <Details id={`rider-${r.id}`} r={r} showDistance={showDistance} showLicence={showLicence} actions={actions?.(r)} />}
          </li>
        );
      })}
    </ul>
  );
}

function Details({ id, r, showDistance, showLicence, actions }: { id: string; r: Rider; showDistance: boolean; showLicence: boolean; actions?: ReactNode }) {
  const pins = useMemo<MapPin[]>(
    () => (r.position ? [{ id: r.id, kind: r.active_deliveries > 0 ? "rider" : "idle", label: r.full_name, lat: r.position.lat, lng: r.position.lng, heading: r.position.heading }] : []),
    [r.id, r.full_name, r.active_deliveries, r.position],
  );
  const last = seen(r.position?.at);
  return (
    <div id={id} className="grid gap-4 border-t border-border bg-background-hover/40 px-4 py-4 md:grid-cols-[1fr_280px]">
      {r.position ? (
        <DeliveryMap pins={pins} follow={r.id} className="h-[240px]" trails />
      ) : (
        <div className="flex h-[140px] items-center justify-center rounded-container border border-dashed border-border-dark p-4 text-center text-[13px] text-maxcontrast md:h-[240px]">
          {r.on_shift ? "Waiting for this rider's first location fix." : "Location is only shared while the rider is on shift."}
        </div>
      )}
      <div className="text-[14px]">
        <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1.5">
          <dt className="text-maxcontrast">Phone</dt>
          <dd>{r.phone ? <a className="link" href={telHref(r.phone)}>{r.phone}</a> : <span className="text-maxcontrast">Not shared</span>}</dd>
          {r.email && (<><dt className="text-maxcontrast">Email</dt><dd className="break-all"><a className="link" href={`mailto:${r.email}`}>{r.email}</a></dd></>)}
          <dt className="text-maxcontrast">Vehicle</dt><dd className="capitalize">{vehicle(r.vehicle)}</dd>
          {r.city && (<><dt className="text-maxcontrast">City</dt><dd>{r.city}</dd></>)}
          {showLicence && r.licence_number && (<><dt className="text-maxcontrast">Licence</dt><dd className="tabular-nums">{r.licence_number}</dd></>)}
          <dt className="text-maxcontrast">Status</dt><dd><State r={r} /></dd>
          <dt className="text-maxcontrast">Jobs now</dt><dd className="tabular-nums">{r.active_deliveries}</dd>
          <dt className="text-maxcontrast">Delivered</dt><dd className="tabular-nums">{r.deliveries_completed.toLocaleString("en-US")}</dd>
          {showDistance && r.distance_km != null && (<><dt className="text-maxcontrast">From your shop</dt><dd className="tabular-nums">{r.distance_km.toFixed(1)} km{r.eta_to_store_minutes != null ? `, about ${r.eta_to_store_minutes} min away` : ""}</dd></>)}
          {r.position && (<><dt className="text-maxcontrast">Location</dt><dd className="tabular-nums">{r.position.lat.toFixed(5)}, {r.position.lng.toFixed(5)}{last ? <span className="block text-[12px] text-maxcontrast">updated {last}</span> : null}</dd></>)}
        </dl>
        {showDistance && r.jobs && r.jobs.length > 0 && (
          <div className="mt-4">
            <p className="label mb-1">Recent jobs for you</p>
            <ul className="space-y-1 text-[13px]">
              {r.jobs.slice(0, 5).map((j) => (
                <li key={j.delivery_id} className="flex justify-between gap-2">
                  <span className="tabular-nums">{j.order_number}</span>
                  <span className="text-maxcontrast capitalize">{j.status.replace(/_/g, " ")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
