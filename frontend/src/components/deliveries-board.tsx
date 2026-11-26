"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Delivery, LiveRider } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { useLiveTracking, type LiveEvent } from "@/lib/live";
import { money } from "@/lib/format";
import { DeliveryMap, type MapLine, type MapPin } from "./delivery-map";
import { ErrorLine } from "./dash";
import { StatusTag } from "./status-tag";

export type Board = { deliveries: Delivery[]; riders?: LiveRider[] };

const ACTIVE = new Set(["awaiting_rider", "assigned", "accepted", "picked_up", "arrived"]);

/**
 * Map plus list of deliveries on the road. Positions stream in over the tracking websocket
 * when it's reachable; the list is refetched every 15 s regardless, or every minute while
 * the socket is up.
 */
export function DeliveriesBoard({
  load,
  admin = false,
  showStore = false,
  onCancel,
  summary,
}: {
  load: (token: string | null) => Promise<Board>;
  admin?: boolean;
  showStore?: boolean;
  onCancel?: (token: string | null, id: string) => Promise<unknown>;
  /** Drawn above the map from the same data, so the headline numbers never disagree with it. */
  summary?: (board: Board & { live: boolean }) => ReactNode;
}) {
  const { data, setData, error, reload, token } = useApi(load);
  const [focus, setFocus] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const active = useMemo(() => (data?.deliveries ?? []).filter((d) => ACTIVE.has(d.status)), [data]);
  const ids = useMemo(() => active.map((d) => d.id), [active]);

  const onEvent = useCallback(
    (e: LiveEvent) => {
      if (e.type === "status") return reload();
      if (e.type === "rider_location") {
        return setData((cur) => cur && { ...cur, riders: cur.riders?.map((r) => (r.id === e.rider_id ? { ...r, lat: e.lat, lng: e.lng } : r)) });
      }
      setData((cur) =>
        cur && {
          ...cur,
          deliveries: cur.deliveries.map((d) => (d.id === e.delivery_id ? { ...d, rider_position: { lat: e.lat, lng: e.lng, at: e.at, heading: e.heading } } : d)),
        },
      );
    },
    [reload, setData],
  );
  const live = useLiveTracking(token, admin ? { admin: true } : { deliveryIds: ids }, onEvent);

  useEffect(() => {
    const t = setInterval(reload, live ? 60000 : 15000);
    return () => clearInterval(t);
  }, [reload, live]);

  const idle = useMemo(() => (data?.riders ?? []).filter((r) => !r.busy && r.lat !== null && r.lng !== null), [data]);

  const { pins, lines } = useMemo(() => {
    const pins: MapPin[] = [];
    const lines: MapLine[] = [];
    for (const d of active) {
      if (focus && focus !== d.id) continue;
      if (d.pickup) pins.push({ id: `${d.id}-p`, kind: "pickup", label: `${d.store_name || "Store"}: ${d.pickup.label ?? "pickup"}`, lat: d.pickup.lat, lng: d.pickup.lng });
      if (d.dropoff) pins.push({ id: `${d.id}-d`, kind: "dropoff", label: `${d.order_number}: ${d.dropoff.label ?? "drop-off"}`, lat: d.dropoff.lat, lng: d.dropoff.lng });
      const next = d.status === "picked_up" ? d.dropoff : d.pickup;
      if (d.rider_position) {
        pins.push({ id: `${d.id}-r`, kind: "rider", label: d.rider?.name ?? "Rider", lat: d.rider_position.lat, lng: d.rider_position.lng, heading: d.rider_position.heading });
        if (next) lines.push({ id: d.id, from: d.rider_position, to: next });
      } else if (d.pickup && d.dropoff) {
        lines.push({ id: d.id, from: d.pickup, to: d.dropoff });
      }
    }
    if (!focus) for (const r of idle) pins.push({ id: `idle-${r.id}`, kind: "idle", label: `${r.name}, free (${r.vehicle.replace(/_/g, " ")})`, lat: r.lat!, lng: r.lng! });
    return { pins, lines };
  }, [active, focus, idle]);

  async function cancel(id: string) {
    if (!onCancel) return;
    setBusy(id);
    setActionError(null);
    try {
      await onCancel(token, id);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't call that delivery back.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <ErrorLine error={error ?? actionError} />
      <p className="gd-live mb-3 w-fit" data-live={live || undefined} role="status">
        <i aria-hidden />
        {live ? "Live" : "Refreshing every 15 seconds"}
      </p>
      {summary && data && <div className="mb-3">{summary({ ...data, live })}</div>}
      <div className="grid gap-3 xl:grid-cols-[1fr_380px]">
        <div className="gd-panel overflow-hidden p-1.5">
          <DeliveryMap pins={pins} lines={lines} className="h-[420px] rounded-[15px] xl:h-[560px]" />
        </div>
        <ul className="gd-panel max-h-[572px] divide-y divide-border overflow-y-auto p-0">
          {focus && (
            <li><button onClick={() => setFocus(null)} className="w-full px-4 py-2 text-left text-[13px] underline">Show all deliveries</button></li>
          )}
          {active.map((d) => (
            <li key={d.id} className={focus === d.id ? "bg-primary-element-light" : ""}>
              <button onClick={() => setFocus(d.id)} aria-pressed={focus === d.id} className="w-full px-4 pt-3 pb-2 text-left text-[14px] hover:bg-background-hover">
                <span className="flex items-center justify-between gap-2">
                  <span className="tabular-nums text-[13px] font-semibold">{d.order_number || d.id.slice(0, 8)}</span>
                  <StatusTag status={d.status} />
                </span>
                {showStore && d.store_name && <span className="mt-1 block text-[12px] text-maxcontrast">{d.store_name}</span>}
                {(d.pickup?.label || d.dropoff?.label) && (
                  <span className="mt-1 block text-[13px]">{d.pickup?.label ?? "Store"} to {d.dropoff?.label ?? "customer"}</span>
                )}
                <span className="mt-1 block text-[12px] text-maxcontrast">
                  {d.rider ? `${d.rider.name}${d.rider.vehicle ? ` (${d.rider.vehicle.replace(/_/g, " ")})` : ""}` : "No rider yet"}
                  {d.eta_minutes !== null && ` · ETA ${d.eta_minutes} min`}
                  {d.fee_cents != null && ` · fee ${money(d.fee_cents)}`}
                </span>
                {!d.pickup && !d.dropoff && !d.rider_position && <span className="mt-1 block text-[12px] text-maxcontrast">No map position yet.</span>}
              </button>
              {onCancel && (d.status === "assigned" || d.status === "accepted") && (
                <div className="px-4 pb-3">
                  <button disabled={busy === d.id} onClick={() => cancel(d.id)} className="text-[12px] text-text-error underline disabled:opacity-50">
                    {busy === d.id ? "Calling back…" : "Call back from rider"}
                  </button>
                </div>
              )}
            </li>
          ))}
          {active.length === 0 && <li className="px-4 py-8 text-center text-[14px] text-maxcontrast">No deliveries on the road.</li>}
        </ul>
      </div>
    </>
  );
}
