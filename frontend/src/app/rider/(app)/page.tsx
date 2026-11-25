"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorLine } from "@/components/dash";
import { DeliveryMap, type MapLine, type MapPin } from "@/components/delivery-map";
import { Pin } from "@/components/icons";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import type { Delivery, LatLng } from "@/lib/types";
import { useBrowserFact } from "@/lib/hooks";
import { useApi } from "@/lib/use-api";
import { useLiveReload } from "@/lib/live";

// The API asks for a position every 10 to 15 seconds while on shift.
const SEND_EVERY_MS = 12000;
type Action = "accept" | "decline" | "picked_up" | "delivered" | "failed";

const nextAction: Record<string, { action: Action; label: string } | undefined> = {
  assigned: { action: "accept", label: "Accept job" },
  accepted: { action: "picked_up", label: "Picked up from store" },
};

function routeUrl(from: LatLng | null, d: Delivery) {
  const to = d.status === "picked_up" ? d.dropoff : d.pickup;
  if (to && from) return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${from.lat}%2C${from.lng}%3B${to.lat}%2C${to.lng}`;
  if (to) return `https://www.openstreetmap.org/?mlat=${to.lat}&mlon=${to.lng}#map=17/${to.lat}/${to.lng}`;
  if (d.status === "picked_up" && d.dropoff_address) return `https://www.openstreetmap.org/search?query=${encodeURIComponent(d.dropoff_address)}`;
  return null;
}

export default function RiderHome() {
  const me = useApi((t) => api.riderMe(t));
  const jobs = useApi((t) => api.riderDeliveries(t));
  // The server is the record of whether this rider is on shift.
  const onShift = me.data?.on_shift ?? false;
  const canLocate = useBrowserFact(() => "geolocation" in navigator, true);
  const [switching, setSwitching] = useState(false);
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [failing, setFailing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const lastSent = useRef(0);
  const watch = useRef<number | null>(null);

  async function toggleShift() {
    const next = !onShift;
    setSwitching(true);
    setMsg(null);
    try {
      me.setData(await api.riderShift(jobs.token, next));
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Couldn't change your shift. Check your signal.");
    } finally {
      setSwitching(false);
    }
  }

  // Location is only read and shared while the rider is on shift.
  useEffect(() => {
    if (!onShift || !canLocate) {
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
      return;
    }
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        setPos(next);
        setGeoError(null);
        const now = Date.now();
        if (now - lastSent.current >= SEND_EVERY_MS) {
          lastSent.current = now;
          const heading = p.coords.heading !== null && Number.isFinite(p.coords.heading) ? p.coords.heading : null;
          const speed = p.coords.speed !== null && Number.isFinite(p.coords.speed) && p.coords.speed >= 0 ? p.coords.speed : null;
          api.riderLocation(jobs.token, { lat: next.lat, lng: next.lng, accuracy_m: Math.round(next.accuracy), heading, speed_mps: speed }).catch(() => {});
        }
      },
      (err) => setGeoError(err.code === err.PERMISSION_DENIED ? "Location permission is off. Turn it on so stores and customers can see you coming." : "Can't get a GPS fix right now."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => {
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    };
  }, [onShift, canLocate, jobs.token]);

  // New jobs and changes from the shop or customer arrive live; polling covers a dropped socket.
  useLiveReload(["job", "order"], jobs.reload, 20000);

  async function act(d: Delivery, action: Action, extra: { code?: string; note?: string } = {}) {
    setBusy(d.id);
    setMsg(null);
    try {
      const updated = await api.riderAction(jobs.token, d.id, action, extra);
      jobs.setData((x) =>
        x ? { ...x, items: action === "decline" ? x.items.filter((i) => i.id !== d.id) : x.items.map((i) => (i.id === d.id ? { ...i, ...updated } : i)) } : x,
      );
      if (action === "delivered") {
        setCodes(({ [d.id]: _, ...rest }) => rest);
        me.reload();
      }
      if (action === "failed") {
        setFailing(null);
        setNote("");
      }
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "That didn't save. Check your signal and try again.");
    } finally {
      setBusy(null);
    }
  }

  const items = jobs.data?.items ?? [];
  const active = items.filter((d) => ["assigned", "accepted", "picked_up"].includes(d.status));
  const doneToday = items.filter((d) => d.status === "delivered" && new Date(d.created_at).toDateString() === new Date().toDateString());
  const current = active.find((d) => d.status === "picked_up" || d.status === "accepted") ?? active[0];
  const here = pos ?? (me.data?.position ? { ...me.data.position, accuracy: 0 } : null);

  const { pins, lines } = useMemo(() => {
    const pins: MapPin[] = [];
    const lines: MapLine[] = [];
    if (current?.pickup) pins.push({ id: "p", kind: "pickup", label: current.pickup.label ?? current.store_name, lat: current.pickup.lat, lng: current.pickup.lng });
    if (current?.dropoff) pins.push({ id: "d", kind: "dropoff", label: current.dropoff.label ?? "Drop-off", lat: current.dropoff.lat, lng: current.dropoff.lng });
    if (here) {
      pins.push({ id: "me", kind: "rider", label: "You", lat: here.lat, lng: here.lng });
      const to = current ? (current.status === "picked_up" ? current.dropoff : current.pickup) : null;
      if (to) lines.push({ id: "leg", from: here, to });
    }
    return { pins, lines };
  }, [current, here?.lat, here?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="label">{me.data ? `${me.data.full_name} · ${me.data.vehicle.replace(/_/g, " ")}` : "Rider"}</p>
          <h1 className="heading flex items-center gap-2 text-[22px]"><span className={`h-2.5 w-2.5 rounded-full ${onShift ? "bg-element-success" : "bg-border-maxcontrast"}`} aria-hidden />{onShift ? "On shift" : "Off shift"}</h1>
        </div>
        <button onClick={toggleShift} disabled={switching || !me.data} aria-pressed={onShift} className={`btn btn-lg ${onShift ? "btn-secondary" : "btn-primary"}`}>
          {switching ? "…" : onShift ? "End shift" : "Start shift"}
        </button>
      </div>

      {onShift && (
        <p className="note note-success mb-4 text-[14px]">
          <Pin size={18} />
          <span>Sharing your location with the market, and with the store and customer on your job, while you&apos;re on shift.{pos && <span className="ml-1 text-maxcontrast tabular-nums">±{Math.round(pos.accuracy)}m</span>}</span>
        </p>
      )}
      <ErrorLine error={(onShift && !canLocate ? "This browser can't share location." : geoError) ?? msg ?? jobs.error} />

      {pins.length > 0 && <DeliveryMap pins={pins} lines={lines} follow={here ? "me" : undefined} className="mb-6 h-[300px]" />}

      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="card p-3"><p className="label">Active</p><p className="price text-[22px]">{active.length}</p></div>
        <div className="card p-3"><p className="label">Done today</p><p className="price text-[22px]">{doneToday.length}</p></div>
        <div className="card p-3">
          <p className="label">Owed to you</p>
          <p className="price text-[22px]">{money(me.data?.unpaid_earnings_cents ?? doneToday.reduce((a, d) => a + (d.fee_cents ?? 0), 0))}</p>
        </div>
      </div>

      <ul className="space-y-3">
        {active.map((d) => {
          const next = nextAction[d.status];
          const route = routeUrl(here, d);
          const code = codes[d.id] ?? "";
          return (
            <li key={d.id} className="card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="text-[14px] font-semibold tabular-nums">{d.order_number}{d.items ? ` · ${d.items} item${d.items > 1 ? "s" : ""}` : ""}</span>
                {d.fee_cents != null && <span className="price text-text-success">{money(d.fee_cents)}</span>}
              </div>
              {!!d.cash_to_collect_cents && (
                <p className="note note-warning mx-3 mt-3 text-[14px] font-semibold"><span>Collect {money(d.cash_to_collect_cents)} in cash from the customer</span></p>
              )}
              <ol className="space-y-2 p-4 text-[14px]">
                <li className="flex gap-3">
                  <span className="rounded-full flex h-6 w-6 shrink-0 items-center justify-center bg-primary-element tabular-nums text-[12px] text-primary-element-text">P</span>
                  <span><b>{d.store_name}</b>{d.pickup?.label && <><br />{d.pickup.label}</>}</span>
                </li>
                <li className="flex gap-3">
                  <span className="rounded-full flex h-6 w-6 shrink-0 items-center justify-center bg-success tabular-nums text-[12px] text-success-text">D</span>
                  {d.status === "assigned" ? (
                    <span className="text-maxcontrast">Address shown after you accept{d.dropoff?.label ? ` (${d.dropoff.label})` : ""}</span>
                  ) : (
                    <span>
                      {d.customer_name && <b>{d.customer_name}<br /></b>}
                      {d.dropoff_address ?? d.dropoff?.label ?? "Address on the way"}
                      {d.customer_phone && (
                        <>
                          <br />
                          {/^[0-9 +().-]{6,32}$/.test(d.customer_phone) ? <a className="link-u" href={`tel:${d.customer_phone.replace(/[^0-9+]/g, "")}`}>{d.customer_phone}</a> : d.customer_phone}
                        </>
                      )}
                    </span>
                  )}
                </li>
              </ol>

              {d.status === "picked_up" && (
                <form
                  className="flex items-end gap-2 border-t border-border p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (/^\d{6}$/.test(code)) act(d, "delivered", { code });
                  }}
                >
                  <label className="flex-1">
                    <span className="label">Customer&apos;s handover code</span>
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      className="field mt-1 tabular-nums text-[20px]"
                      value={code}
                      onChange={(e) => setCodes((c) => ({ ...c, [d.id]: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                    />
                  </label>
                  <button disabled={busy === d.id || code.length !== 6 || !onShift} className="btn btn-primary btn-lg">Delivered</button>
                </form>
              )}

              {failing === d.id ? (
                <form
                  className="space-y-2 border-t border-border p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (note.trim()) act(d, "failed", { note: note.trim() });
                  }}
                >
                  <label className="block"><span className="label">What went wrong?</span>
                    <input required maxLength={300} className="field mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nobody home, wrong address, refused…" />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-tertiary flex-1" onClick={() => setFailing(null)}>Back</button>
                    <button disabled={busy === d.id || !note.trim()} className="btn btn-error flex-1">Report and return to store</button>
                  </div>
                </form>
              ) : (
                <div className="flex gap-2 border-t border-border p-3">
                  {d.status === "assigned" && <button disabled={busy === d.id} onClick={() => act(d, "decline")} className="btn btn-tertiary flex-1">Decline</button>}
                  {next && (
                    <button disabled={busy === d.id || !onShift} onClick={() => act(d, next.action)} className="btn btn-primary btn-lg flex-[2]">
                      {onShift ? next.label : "Start shift to continue"}
                    </button>
                  )}
                  {(d.status === "accepted" || d.status === "picked_up") && (
                    <button onClick={() => { setFailing(d.id); setNote(""); }} className="btn btn-tertiary btn-lg">Can&apos;t deliver</button>
                  )}
                  {route && d.status !== "assigned" && <a className="btn btn-secondary btn-lg" target="_blank" rel="noopener noreferrer" href={route}>Route</a>}
                </div>
              )}
            </li>
          );
        })}
        {jobs.data && active.length === 0 && (
          <li className="rounded-element border border-dashed border-border p-8 text-center text-maxcontrast">
            {onShift ? "No jobs right now. New ones show up here automatically." : "Start your shift to get jobs from nearby stores."}
          </li>
        )}
      </ul>
    </>
  );
}
