"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { STORE_NAME } from "@/lib/config";
import { AlertCircle, CheckCircle } from "./icons";
import { DemoNotice } from "./ui";

type Vehicle = "on_foot" | "bicycle" | "motorbike" | "car" | "van";
const vehicles: Array<[Vehicle, string]> = [["on_foot", "On foot"], ["bicycle", "Bicycle"], ["motorbike", "Motorbike"], ["car", "Car"], ["van", "Van"]];

export function RiderApplication({ demo }: { demo: boolean }) {
  const { token } = useAuth();
  const [f, setF] = useState<{ full_name: string; phone: string; city: string; vehicle: Vehicle; licence_number: string; location_consent: boolean }>({
    full_name: "", phone: "", city: "", vehicle: "motorbike", licence_number: "", location_consent: false,
  });
  const needsLicence = f.vehicle === "motorbike" || f.vehicle === "car" || f.vehicle === "van";
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // The consent box is a gate in the form, not something the API stores.
      await api.applyRider(token, {
        full_name: f.full_name.trim(),
        phone: f.phone.trim(),
        city: f.city.trim(),
        vehicle: f.vehicle,
        licence_number: needsLicence ? f.licence_number.trim() || null : null,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send your application. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <CheckCircle size={56} className="mx-auto text-text-success" />
        <p className="heading mt-3 text-[22px]">Thanks, {f.full_name.split(" ")[0]}</p>
        <p className="mt-2 text-maxcontrast">The {STORE_NAME} team reviews rider applications every weekday. We&apos;ll email you about next steps, which usually means a short call and a document check.</p>
      </div>
    );

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl px-4 py-5 md:px-6">
      {demo && <DemoNotice what="a demo rider application" />}
      <p className="label">Deliver for independent shops in your city</p>
      <h1 className="heading text-[22px]">Ride with us</h1>
      <div className="card mt-5 space-y-4 p-4 md:p-6">
        <label className="block"><span className="label">Full name</span><input required maxLength={120} autoComplete="name" className="field mt-1" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="label">Phone</span><input required type="tel" minLength={6} maxLength={32} autoComplete="tel" className="field mt-1" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/[^0-9 +()-]/g, "") })} /></label>
          <label className="block"><span className="label">City</span><input required maxLength={120} className="field mt-1" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></label>
        </div>
        <fieldset><legend className="label mb-2">Vehicle</legend>
          <div className="flex flex-wrap gap-2 text-[14px]">
            {vehicles.map(([v, label]) => (
              <label key={v} className={`cursor-pointer rounded-element border px-3 py-1.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary-element ${f.vehicle === v ? "border-primary-element bg-primary-element-light font-medium text-primary-element-light-text" : "border-border-maxcontrast hover:bg-background-hover"}`}>
                <input type="radio" name="vehicle" className="sr-only" checked={f.vehicle === v} onChange={() => setF({ ...f, vehicle: v })} />{label}
              </label>
            ))}
          </div>
        </fieldset>
        {needsLicence && (
          <label className="block"><span className="label">Driving licence number</span><input required maxLength={64} autoComplete="off" className="field mt-1 tabular-nums" value={f.licence_number} onChange={(e) => setF({ ...f, licence_number: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") })} /></label>
        )}
        <label className="flex cursor-pointer items-start gap-2 text-[14px]">
          <input required type="checkbox" className="mt-1 accent-primary-element" checked={f.location_consent} onChange={(e) => setF({ ...f, location_consent: e.target.checked })} />
          I understand my live location is shared with the market, the store and the customer while I&apos;m on shift, and never when I&apos;m off shift.
        </label>
        {error && <p role="alert" className="note note-error text-[14px]"><AlertCircle size={18} /><span>{error}</span></p>}
        <button disabled={busy} className="btn btn-primary btn-lg btn-wide">{busy ? "Sending…" : "Send application"}</button>
      </div>
    </form>
  );
}
