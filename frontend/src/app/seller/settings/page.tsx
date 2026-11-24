"use client";
import { useEffect, useMemo, useState } from "react";
import { ErrorLine, PageTitle } from "@/components/dash";
import { DeliveryMap, type MapPin } from "@/components/delivery-map";
import { api, ApiError } from "@/lib/api";
import { safeColor } from "@/lib/safe";
import { useApi } from "@/lib/use-api";
import type { LatLng } from "@/lib/types";

type Form = { name: string; tagline: string; description: string; banner_color: string; accent_color: string; support_email: string };

export default function StorefrontSettings() {
  const { data, setData, error, token } = useApi((t) => api.sellerMe(t));
  const [f, setF] = useState<Form>({ name: "", tagline: "", description: "", banner_color: "#16130f", accent_color: "#f4f0e6", support_email: "" });
  const [pickup, setPickup] = useState<(LatLng & { label: string; city: string }) | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    const s = data.store;
    setF({
      name: s.name,
      tagline: s.tagline,
      description: s.description,
      banner_color: safeColor(s.banner_color),
      accent_color: safeColor(s.accent_color, "#f4f0e6"),
      support_email: s.support_email ?? "",
    });
    setPickup(s.pickup ? { lat: s.pickup.lat, lng: s.pickup.lng, label: s.pickup.label ?? "", city: s.pickup.city ?? "" } : null);
  }, [data]);

  const pins = useMemo<MapPin[]>(() => (pickup ? [{ id: "pickup", kind: "pickup", label: pickup.label || "Pickup", lat: pickup.lat, lng: pickup.lng }] : []), [pickup]);

  function locate() {
    if (!("geolocation" in navigator)) return setMsg({ ok: false, text: "This browser can't share a location. Click the map instead." });
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPickup((cur) => ({ label: cur?.label ?? "", city: cur?.city ?? "", lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 }));
        setLocating(false);
      },
      () => {
        setLocating(false);
        setMsg({ ok: false, text: "Couldn't get your location. Click the map where riders should collect from." });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const next = await api.updateStore(token, {
        name: f.name.trim(),
        tagline: f.tagline.trim() || null,
        description: f.description.trim() || null,
        banner_color: safeColor(f.banner_color),
        accent_color: safeColor(f.accent_color, "#f4f0e6"),
        support_email: f.support_email.trim() || null,
        pickup: pickup ? { lat: pickup.lat, lng: pickup.lng, label: pickup.label.trim() || null, city: pickup.city.trim() || null } : null,
      });
      if (next?.store?.id) setData(next);
      setMsg({ ok: true, text: "Saved. Changes show on your storefront within a minute." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="max-w-4xl">
      <PageTitle title="Storefront" kicker="How your stall looks, and where riders collect from" />
      <ErrorLine error={error} />
      {data?.store.review_note && data.store.status !== "active" && (
        <p className="mb-6 border-l-4 border-signal bg-card p-4 text-[14px]"><b>Note from the market team:</b> {data.store.review_note}</p>
      )}
      <div className="mb-6 border border-ink p-6" style={{ background: safeColor(f.banner_color), color: safeColor(f.accent_color, "#f4f0e6") }}>
        <p className="font-mono text-[11px] uppercase tracking-wider opacity-80">Preview</p>
        <p className="display mt-2 text-[56px]">{f.name || "Your shop"}</p>
        <p className="opacity-90">{f.tagline}</p>
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          <label className="block"><span className="label">Shop name</span><input required maxLength={120} className="field mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="block"><span className="label">Tagline</span><input maxLength={120} className="field mt-1" value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></label>
          <label className="block"><span className="label">About</span><textarea maxLength={2000} rows={5} className="field mt-1" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <label className="block"><span className="label">Support email shoppers see</span><input type="email" maxLength={254} className="field mt-1" value={f.support_email} onChange={(e) => setF({ ...f, support_email: e.target.value })} /></label>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-[14px]"><input type="color" value={f.banner_color} onChange={(e) => setF({ ...f, banner_color: e.target.value })} className="h-10 w-12 border border-rule" /> Banner</label>
            <label className="flex items-center gap-2 text-[14px]"><input type="color" value={f.accent_color} onChange={(e) => setF({ ...f, accent_color: e.target.value })} className="h-10 w-12 border border-rule" /> Text</label>
          </div>
        </div>
        <fieldset className="space-y-3">
          <legend className="label mb-1">Pickup point for riders</legend>
          <p className="text-[13px] text-ink-3">Riders can&apos;t be dispatched until this is set. Click the map to move the pin, or use where you are now.</p>
          <DeliveryMap pins={pins} onPick={(p) => setPickup((cur) => ({ label: cur?.label ?? "", city: cur?.city ?? "", ...p }))} className="h-[260px]" />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-line btn-sm" disabled={locating} onClick={locate}>{locating ? "Finding you…" : "Use my current location"}</button>
            {pickup && <span className="font-mono text-[12px]">{pickup.lat.toFixed(5)}, {pickup.lng.toFixed(5)}</span>}
          </div>
          {pickup && (
            <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
              <label><span className="label">Where to collect</span><input maxLength={120} className="field mt-1" placeholder="Back door on Pine St, unit 4" value={pickup.label} onChange={(e) => setPickup({ ...pickup, label: e.target.value })} /></label>
              <label><span className="label">City</span><input maxLength={120} className="field mt-1" value={pickup.city} onChange={(e) => setPickup({ ...pickup, city: e.target.value })} /></label>
            </div>
          )}
        </fieldset>
      </div>
      {msg && <p role="status" className={`mt-6 border-l-2 pl-3 text-[13px] ${msg.ok ? "border-market text-market" : "border-signal text-signal"}`}>{msg.text}</p>}
      <button disabled={busy} className="btn btn-ink mt-6">{busy ? "Saving…" : "Save storefront"}</button>
    </form>
  );
}
