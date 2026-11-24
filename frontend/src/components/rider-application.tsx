"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { STORE_NAME } from "@/lib/config";
import { DemoNotice } from "./ui";

export function RiderApplication({ demo }: { demo: boolean }) {
  const { token } = useAuth();
  const [f, setF] = useState({ full_name: "", phone: "", city: "", vehicle: "motorbike", licence_number: "", location_consent: false });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.applyRider(token, f);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send your application. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="display text-[64px]">Thanks, {f.full_name.split(" ")[0]}.</p>
        <p className="mt-4 text-[17px] text-ink-2">The {STORE_NAME} team reviews rider applications every weekday. We&apos;ll email you about next steps, which usually means a short call and a document check.</p>
      </div>
    );

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl px-4 py-10">
      {demo && <DemoNotice what="a demo rider application" />}
      <p className="label mb-2">Deliver for independent shops in your city</p>
      <h1 className="display text-[56px] md:text-[72px]">Ride with us</h1>
      <div className="mt-8 space-y-4">
        <label className="block"><span className="label">Full name</span><input required maxLength={120} autoComplete="name" className="field mt-1" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="label">Phone</span><input required type="tel" maxLength={24} autoComplete="tel" className="field mt-1" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/[^0-9 +()-]/g, "") })} /></label>
          <label className="block"><span className="label">City</span><input required maxLength={80} className="field mt-1" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></label>
        </div>
        <fieldset><legend className="label mb-2">Vehicle</legend>
          <div className="grid grid-cols-4 border border-ink text-[13px]">
            {["bicycle", "motorbike", "car", "van"].map((v, i) => (
              <label key={v} className={`cursor-pointer py-2.5 text-center capitalize ${i ? "border-l border-ink" : ""} ${f.vehicle === v ? "bg-ink text-paper" : ""}`}>
                <input type="radio" name="vehicle" className="sr-only" checked={f.vehicle === v} onChange={() => setF({ ...f, vehicle: v })} />{v}
              </label>
            ))}
          </div>
        </fieldset>
        {f.vehicle !== "bicycle" && (
          <label className="block"><span className="label">Driving licence number</span><input required maxLength={32} autoComplete="off" className="field mt-1 font-mono" value={f.licence_number} onChange={(e) => setF({ ...f, licence_number: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") })} /></label>
        )}
        <label className="flex cursor-pointer items-start gap-2 text-[14px]">
          <input required type="checkbox" className="mt-1 accent-ink" checked={f.location_consent} onChange={(e) => setF({ ...f, location_consent: e.target.checked })} />
          I understand my live location is shared with the market, the store and the customer while I&apos;m on shift, and never when I&apos;m off shift.
        </label>
        {error && <p role="alert" className="border-l-2 border-signal pl-3 text-[13px] text-signal">{error}</p>}
        <button disabled={busy} className="btn btn-signal h-12 w-full">{busy ? "Sending…" : "Send application"}</button>
      </div>
    </form>
  );
}
