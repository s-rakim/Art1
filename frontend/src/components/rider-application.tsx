"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AUTH_ENABLED, STORE_NAME } from "@/lib/config";
import { supabase } from "@/lib/supabase/client";
import { AlertCircle, CheckCircle, Info } from "./icons";

type Vehicle = "on_foot" | "bicycle" | "motorbike" | "car" | "van";
const vehicles: Array<[Vehicle, string]> = [["on_foot", "On foot"], ["bicycle", "Bicycle"], ["motorbike", "Motorbike"], ["car", "Car"], ["van", "Van"]];

type Details = { full_name: string; phone: string; city: string; vehicle: Vehicle; licence_number: string };
type Done = "sent" | "confirm" | "saved" | "pending" | "hired" | "rejected" | "paused";

const DONE: Record<Done, { title: string; body: string; ok: boolean }> = {
  sent: { ok: true, title: "Application sent", body: `The ${STORE_NAME} team reviews rider applications every weekday, usually with a short call and a document check. You'll be able to log in as soon as you're hired.` },
  confirm: { ok: true, title: "Check your email", body: "We've sent you a link to confirm your email address. Opening it sends your application to the market team. If you already shop with us, log in first and then open this page again to apply with that account." },
  saved: { ok: true, title: "Nearly there", body: "Your account is set up but the application didn't reach the team just now. Log in once and we'll send it for you." },
  pending: { ok: true, title: "Your application is with the team", body: "Nothing more to do for now. You'll be able to use the rider app as soon as the market team hires you." },
  hired: { ok: true, title: "You're hired", body: "Your rider account is active." },
  rejected: { ok: false, title: "Not this time", body: "Your rider application wasn't approved. Reply to the email from the market team if you'd like them to look again." },
  paused: { ok: false, title: "Your rider account is paused", body: "Contact the market team to get back on the road." },
};

function statusToDone(s: string | null | undefined): Done | null {
  if (!s) return null;
  if (s === "active") return "hired";
  if (s === "rejected") return "rejected";
  if (s === "suspended" || s === "inactive") return "paused";
  return "pending";
}

/**
 * The rider hiring form. Anyone can open it: people who don't have an account set their email
 * and password here, and the application rides along with the sign-up so nothing is lost if
 * they confirm their email later. Applicants can't use the site until an admin hires them.
 */
export function RiderApplication() {
  const { ready, token } = useAuth();
  const signedIn = !!token;
  const [f, setF] = useState<Details>({ full_name: "", phone: "", city: "", vehicle: "motorbike", licence_number: "" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const needsLicence = f.vehicle === "motorbike" || f.vehicle === "car" || f.vehicle === "van";
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  // The token whose earlier application has been looked up; until it matches, show a short wait.
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  const checking = AUTH_ENABLED && (!ready || (!!token && checkedFor !== token));
  const [error, setError] = useState<string | null>(null);

  // Someone already signed in may have applied before; show where that stands instead of a blank form.
  useEffect(() => {
    if (!ready || !token) return;
    let alive = true;
    api
      .riderStatus(token)
      .then((r) => alive && setDone(statusToDone(r.status)))
      .catch(() => {})
      .finally(() => alive && setCheckedFor(token));
    return () => {
      alive = false;
    };
  }, [ready, token]);

  const body = () => ({
    full_name: f.full_name.trim().slice(0, 120),
    phone: f.phone.trim().slice(0, 32),
    city: f.city.trim().slice(0, 120),
    vehicle: f.vehicle,
    licence_number: needsLicence ? f.licence_number.trim().slice(0, 40) || null : null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!AUTH_ENABLED || signedIn) {
        const r = await api.applyRider(token, body());
        setDone(statusToDone(r.status) ?? "sent");
        return;
      }
      const sb = supabase();
      if (!sb) return setError("Sign-up isn't configured on this server yet.");
      const details = body();
      const { data, error: err } = await sb.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // requested_role is a hint the API reads when it creates the profile; it can only ever
          // make someone an applicant. Hiring is done by an admin and lands in app_metadata.
          data: { requested_role: "rider", full_name: details.full_name, rider_application: details },
          emailRedirectTo: `${window.location.origin}/login?applied=rider`,
        },
      });
      if (err && err.status !== 422) return setError("Couldn't create your account. Check the details and try again.");
      if (!data?.session) return setDone("confirm");
      try {
        await api.applyRider(data.session.access_token, details);
        setDone("sent");
      } catch {
        setDone("saved");
      } finally {
        // Applicants don't get a session until they're hired.
        await sb.auth.signOut();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send your application. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const d = DONE[done];
    const Icon = d.ok ? CheckCircle : AlertCircle;
    return (
      <div className="py-2 text-center">
        <Icon size={48} className={`mx-auto ${d.ok ? "text-primary-element" : "text-text-error"}`} />
        <h1 className="heading mt-3 text-[20px]">{d.title}</h1>
        <p className="mt-2 text-[14px] text-maxcontrast">{d.body}</p>
        <div className="mt-5">
          {done === "hired" ? (
            <Link href="/rider" className="btn btn-primary btn-wide">Open the rider app</Link>
          ) : (
            <Link href="/" className="btn btn-secondary btn-wide">Back to the shop</Link>
          )}
        </div>
      </div>
    );
  }

  if (checking) return <p className="py-8 text-center text-[14px] text-maxcontrast">One moment…</p>;

  return (
    <form onSubmit={submit}>
      <h1 className="heading text-center text-[20px]">Ride with {STORE_NAME}</h1>
      <p className="mt-1 text-center text-[14px] text-maxcontrast">Deliver for the shops in the market. Leave your details and the market team will be in touch.</p>

      <div className="mt-5 space-y-3">
        {!AUTH_ENABLED && (
          <p className="note note-info text-[14px]"><Info size={18} /><span>Sign-in isn&apos;t switched on for this server yet, so this sends a sample application only.</span></p>
        )}

        {!signedIn && AUTH_ENABLED && (
          <fieldset className="space-y-3">
            <legend className="label mb-1">Your login</legend>
            <label className="block">
              <span className="label">Email address</span>
              <input type="email" inputMode="email" required maxLength={254} autoComplete="email" className="field mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">Password</span>
              <input type="password" required minLength={10} maxLength={128} autoComplete="new-password" className="field mt-1" value={password} onChange={(e) => setPassword(e.target.value)} />
              <span className="mt-1 block text-[13px] text-maxcontrast">At least 10 characters. You&apos;ll use it once you&apos;re hired.</span>
            </label>
          </fieldset>
        )}

        <fieldset className={`space-y-3 ${!signedIn && AUTH_ENABLED ? "border-t border-border pt-4" : ""}`}>
          <legend className="label mb-1 pt-4">About you</legend>
          <label className="block">
            <span className="label">Full name</span>
            <input required maxLength={120} autoComplete="name" className="field mt-1" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Phone</span>
              <input required type="tel" minLength={6} maxLength={32} autoComplete="tel" className="field mt-1" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/[^0-9 +()-]/g, "") })} />
            </label>
            <label className="block">
              <span className="label">City</span>
              <input required maxLength={120} autoComplete="address-level2" className="field mt-1" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
            </label>
          </div>
          <fieldset>
            <legend className="label mb-2">How you&apos;ll deliver</legend>
            <div className="flex flex-wrap gap-2 text-[14px]">
              {vehicles.map(([v, label]) => (
                <label key={v} className={`cursor-pointer rounded-pill border px-3 py-1.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary-element ${f.vehicle === v ? "border-primary-element bg-primary-element-light font-medium text-primary-element-light-text" : "border-border-maxcontrast hover:bg-background-hover"}`}>
                  <input type="radio" name="vehicle" className="sr-only" checked={f.vehicle === v} onChange={() => setF({ ...f, vehicle: v })} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {needsLicence && (
            <label className="block">
              <span className="label">Driving licence number</span>
              <input required maxLength={40} autoComplete="off" className="field mt-1 tabular-nums" value={f.licence_number} onChange={(e) => setF({ ...f, licence_number: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") })} />
            </label>
          )}
          <label className="flex cursor-pointer items-start gap-2 text-[14px]">
            <input required type="checkbox" className="mt-1 accent-primary-element" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            I understand my live location is shared with the market, the shop and the customer while I&apos;m on shift, and never when I&apos;m off shift.
          </label>
        </fieldset>

        {error && <p role="alert" className="note note-error text-[14px]"><AlertCircle size={18} /><span>{error}</span></p>}
        <button disabled={busy} className="btn btn-primary btn-lg btn-wide !mt-5">{busy ? "Sending…" : "Send application"}</button>
      </div>

      <div className="mt-6 space-y-2 border-t border-border pt-4 text-center text-[14px]">
        <p>Already applied? <Link className="link" href="/login">Log in to check</Link></p>
        <p>Just here to shop? <Link className="link" href="/signup">Create a shopper account</Link></p>
      </div>
    </form>
  );
}
