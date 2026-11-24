"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorLine } from "@/components/dash";
import { DeliveryMap, type MapLine, type MapPin } from "@/components/delivery-map";
import { Pin } from "@/components/icons";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import type { Delivery } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const SEND_EVERY_MS = 15000;

const nextAction: Partial<Record<Delivery["status"], { action: "accept" | "picked_up" | "delivered"; label: string }>> = {
  assigned: { action: "accept", label: "Accept job" },
  accepted: { action: "picked_up", label: "Picked up from store" },
  picked_up: { action: "delivered", label: "Delivered to customer" },
};

export default function RiderHome() {
  const me = useApi((t) => api.riderMe(t));
  const jobs = useApi((t) => api.riderDeliveries(t));
  const [onShift, setOnShift] = useState(false);
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const lastSent = useRef(0);
  const watch = useRef<number | null>(null);

  useEffect(() => {
    if (me.data) setOnShift(me.data.on_shift);
  }, [me.data]);

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
          api.riderLocation(jobs.token, { lat: next.lat, lng: next.lng, accuracy_m: Math.round(next.accuracy), heading: p.coords.heading }).catch(() => {});
        }
      },
      (err) => setGeoError(err.code === err.PERMISSION_DENIED ? "Location permission is off. Turn it on so customers can see you coming." : "Can't get a GPS fix right now."),
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

  async function act(d: Delivery, action: "accept" | "decline" | "picked_up" | "delivered") {
    if (action === "delivered" && !window.confirm(`Mark ${d.order_number} as delivered to ${d.dropoff.label}?`)) return;
    setBusy(d.id);
    setMsg(null);
    try {
      const updated = await api.riderAction(jobs.token, d.id, action);
      jobs.setData((x) => (x ? { ...x, items: action === "decline" ? x.items.filter((i) => i.id !== d.id) : x.items.map((i) => (i.id === d.id ? { ...i, status: updated.status } : i)) } : x));
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "That didn't save. Check your signal and try again.");
    } finally {
      setBusy(null);
    }
  }

  const active = (jobs.data?.items ?? []).filter((d) => d.status !== "delivered" && d.status !== "failed");
  const done = (jobs.data?.items ?? []).filter((d) => d.status === "delivered");
  const current = active.find((d) => d.status === "picked_up" || d.status === "accepted") ?? active[0];
  const me_pos = pos ?? (me.data?.position ? { ...me.data.position, accuracy: 0 } : null);

  const { pins, lines } = useMemo(() => {
    const pins: MapPin[] = [];
    const lines: MapLine[] = [];
    if (current) {
      pins.push({ id: "p", kind: "pickup", label: current.pickup.label, lat: current.pickup.lat, lng: current.pickup.lng });
      pins.push({ id: "d", kind: "dropoff", label: current.dropoff.label, lat: current.dropoff.lat, lng: current.dropoff.lng });
    }
    if (me_pos) {
      pins.push({ id: "me", kind: "rider", label: "You", lat: me_pos.lat, lng: me_pos.lng });
      if (current) lines.push({ id: "leg", from: me_pos, to: current.status === "picked_up" ? current.dropoff : current.pickup });
    }
    return { pins, lines };
  }, [current, me_pos?.lat, me_pos?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-4 border-b border-ink pb-4">
        <div>
          <p className="label">{me.data ? `${me.data.full_name} · ${me.data.vehicle}` : "Rider"}</p>
          <h1 className="display text-[44px]">{onShift ? "On shift" : "Off shift"}</h1>
        </div>
        <button
          onClick={() => setOnShift((s) => !s)}
          aria-pressed={onShift}
          className={`btn h-14 px-6 text-[15px] ${onShift ? "btn-line" : "btn-signal"}`}
        >
          {onShift ? "End shift" : "Start shift"}
        </button>
      </div>

      {onShift && (
        <p className="mb-4 flex items-center gap-2 text-[13px] text-market">
          <Pin size={16} /> Sharing your location with the market and your customers while you&apos;re on shift.
          {pos && <span className="font-mono text-ink-3">±{Math.round(pos.accuracy)}m</span>}
        </p>
      )}
      <ErrorLine error={geoError ?? msg ?? jobs.error} />

      {(current || me_pos) && <DeliveryMap pins={pins} lines={lines} follow="me" className="mb-6 h-[300px]" />}

      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="border border-ink bg-card p-3"><p className="label">Active</p><p className="price text-[22px]">{active.length}</p></div>
        <div className="border border-ink bg-card p-3"><p className="label">Done today</p><p className="price text-[22px]">{done.length}</p></div>
        <div className="border border-ink bg-card p-3"><p className="label">Earned</p><p className="price text-[22px]">{money(done.reduce((a, d) => a + d.fee_cents, 0))}</p></div>
      </div>

      <ul className="space-y-3">
        {active.map((d) => {
          const next = nextAction[d.status];
          return (
            <li key={d.id} className="border-2 border-ink bg-card">
              <div className="flex items-center justify-between border-b border-ink px-4 py-2">
                <span className="font-mono text-[13px]">{d.order_number} · {d.items} item{d.items > 1 ? "s" : ""}</span>
                <span className="price text-market">{money(d.fee_cents)}</span>
              </div>
              <ol className="space-y-2 p-4 text-[14px]">
                <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center bg-ink font-mono text-[11px] text-paper">P</span><span><b>{d.store_name}</b><br />{d.pickup.label}</span></li>
                <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center bg-market font-mono text-[11px] text-paper">D</span><span>{d.status === "assigned" ? "Drop-off shown after you accept" : d.dropoff.label}</span></li>
              </ol>
              <div className="flex gap-2 border-t border-rule p-3">
                {d.status === "assigned" && <button disabled={busy === d.id} onClick={() => act(d, "decline")} className="btn btn-ghost flex-1">Decline</button>}
                {next && <button disabled={busy === d.id || !onShift} onClick={() => act(d, next.action)} className="btn btn-signal h-12 flex-[2]">{onShift ? next.label : "Start shift to continue"}</button>}
                {d.status !== "assigned" && (
                  <a className="btn btn-line h-12" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${d.pickup.lat}%2C${d.pickup.lng}%3B${d.dropoff.lat}%2C${d.dropoff.lng}`}>Route</a>
                )}
              </div>
            </li>
          );
        })}
        {jobs.data && active.length === 0 && <li className="border border-dashed border-rule p-8 text-center text-ink-3">No jobs right now. New ones show up here automatically.</li>}
      </ul>
    </>
  );
}
