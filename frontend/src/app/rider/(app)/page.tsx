"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorLine } from "@/components/dash";
import { DeliveryMap, type MapLine, type MapPin } from "@/components/delivery-map";
import { Pin } from "@/components/icons";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import type { Delivery, LatLng } from "@/lib/types";
import { useApi } from "@/lib/use-api";

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
  const [onShift, setOnShift] = useState(false);
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

  useEffect(() => {
    if (me.data) setOnShift(me.data.on_shift);
  }, [me.data]);

  async function toggleShift() {
    const next = !onShift;
    setSwitching(true);
    setMsg(null);
    try {
      const r = await api.riderShift(jobs.token, next);
      setOnShift(r.on_shift);
      me.setData(r);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Couldn't change your shift. Check your signal.");
    } finally {
      setSwitching(false);
    }
  }

  // Location is only read and shared while the rider is on shift.
  useEffect(() => {
    if (!onShift) {
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
      return;
    }
    if (!("geolocation" in navigator)) {
      setGeoError("This browser can't share location.");
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
          api.riderLocation(jobs.token, { lat: next.lat, lng: next.lng, accuracy_m: Math.round(next.accuracy), heading }).catch(() => {});
        }
      },
      (err) => setGeoError(err.code === err.PERMISSION_DENIED ? "Location permission is off. Turn it on so stores and customers can see you coming." : "Can't get a GPS fix right now."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => {
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    };
  }, [onShift, jobs.token]);

  useEffect(() => {
    const t = setInterval(jobs.reload, 20000);
    return () => clearInterval(t);
  }, [jobs.reload]);

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
      <div className="mb-5 flex items-center justify-between gap-4 border-b border-ink pb-4">
        <div>
          <p className="label">{me.data ? `${me.data.full_name} · ${me.data.vehicle.replace(/_/g, " ")}` : "Rider"}</p>
          <h1 className="display text-[44px]">{onShift ? "On shift" : "Off shift"}</h1>
        </div>
        <button onClick={toggleShift} disabled={switching || !me.data} aria-pressed={onShift} className={`btn h-14 px-6 text-[15px] ${onShift ? "btn-line" : "btn-signal"}`}>
          {switching ? "…" : onShift ? "End shift" : "Start shift"}
        </button>
      </div>

      {onShift && (
        <p className="mb-4 flex items-center gap-2 text-[13px] text-market">
          <Pin size={16} /> Sharing your location with the market, and with the store and customer on your job, while you&apos;re on shift.
          {pos && <span className="font-mono text-ink-3">±{Math.round(pos.accuracy)}m</span>}
        </p>
      )}
      <ErrorLine error={geoError ?? msg ?? jobs.error} />

      {pins.length > 0 && <DeliveryMap pins={pins} lines={lines} follow={here ? "me" : undefined} className="mb-6 h-[300px]" />}

      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="border border-ink bg-card p-3"><p className="label">Active</p><p className="price text-[22px]">{active.length}</p></div>
        <div className="border border-ink bg-card p-3"><p className="label">Done today</p><p className="price text-[22px]">{doneToday.length}</p></div>
        <div className="border border-ink bg-card p-3">
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
            <li key={d.id} className="border-2 border-ink bg-card">
              <div className="flex items-center justify-between border-b border-ink px-4 py-2">
                <span className="font-mono text-[13px]">{d.order_number}{d.items ? ` · ${d.items} item${d.items > 1 ? "s" : ""}` : ""}</span>
                {d.fee_cents != null && <span className="price text-market">{money(d.fee_cents)}</span>}
              </div>
              {!!d.cash_to_collect_cents && (
                <p className="border-b border-ink bg-tag px-4 py-2 text-[14px] font-semibold">Collect {money(d.cash_to_collect_cents)} in cash from the customer</p>
              )}
              <ol className="space-y-2 p-4 text-[14px]">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-ink font-mono text-[11px] text-paper">P</span>
                  <span><b>{d.store_name}</b>{d.pickup?.label && <><br />{d.pickup.label}</>}</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-market font-mono text-[11px] text-paper">D</span>
                  {d.status === "assigned" ? (
                    <span className="text-ink-3">Address shown after you accept{d.dropoff?.label ? ` (${d.dropoff.label})` : ""}</span>
                  ) : (
                    <span>
                      {d.customer_name && <b>{d.customer_name}<br /></b>}
                      {d.dropoff_address ?? d.dropoff?.label ?? "Address on the way"}
                      {d.customer_phone && (
                        <>
                          <br />
                          {/^[0-9 +().-]{6,32}$/.test(d.customer_phone) ? <a className="underline" href={`tel:${d.customer_phone.replace(/[^0-9+]/g, "")}`}>{d.customer_phone}</a> : d.customer_phone}
                        </>
                      )}
                    </span>
                  )}
                </li>
              </ol>

              {d.status === "picked_up" && (
                <form
                  className="flex items-end gap-2 border-t border-rule p-3"
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
                      className="field mt-1 font-mono text-[20px] tracking-[0.3em]"
                      value={code}
                      onChange={(e) => setCodes((c) => ({ ...c, [d.id]: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                    />
                  </label>
                  <button disabled={busy === d.id || code.length !== 6 || !onShift} className="btn btn-signal h-12">Delivered</button>
                </form>
              )}

              {failing === d.id ? (
                <form
                  className="space-y-2 border-t border-rule p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (note.trim()) act(d, "failed", { note: note.trim() });
                  }}
                >
                  <label className="block"><span className="label">What went wrong?</span>
                    <input required maxLength={300} className="field mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nobody home, wrong address, refused…" />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-ghost flex-1" onClick={() => setFailing(null)}>Back</button>
                    <button disabled={busy === d.id || !note.trim()} className="btn btn-ink flex-1">Report and return to store</button>
                  </div>
                </form>
              ) : (
                <div className="flex gap-2 border-t border-rule p-3">
                  {d.status === "assigned" && <button disabled={busy === d.id} onClick={() => act(d, "decline")} className="btn btn-ghost flex-1">Decline</button>}
                  {next && (
                    <button disabled={busy === d.id || !onShift} onClick={() => act(d, next.action)} className="btn btn-signal h-12 flex-[2]">
                      {onShift ? next.label : "Start shift to continue"}
                    </button>
                  )}
                  {(d.status === "accepted" || d.status === "picked_up") && (
                    <button onClick={() => { setFailing(d.id); setNote(""); }} className="btn btn-ghost h-12">Can&apos;t deliver</button>
                  )}
                  {route && d.status !== "assigned" && <a className="btn btn-line h-12" target="_blank" rel="noopener noreferrer" href={route}>Route</a>}
                </div>
              )}
            </li>
          );
        })}
        {jobs.data && active.length === 0 && (
          <li className="border border-dashed border-rule p-8 text-center text-ink-3">
            {onShift ? "No jobs right now. New ones show up here automatically." : "Start your shift to get jobs from nearby stores."}
          </li>
        )}
      </ul>
    </>
  );
}
