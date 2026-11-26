"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { landingFor } from "@/lib/after-login";
import { AUTH_ENABLED, STORE_NAME } from "@/lib/config";
import { supabase } from "@/lib/supabase/client";
import { AlertCircle, CheckCircle, Info } from "./icons";

type Msg = { kind: "error" | "ok" | "info"; text: string };

function Note({ msg }: { msg: Msg }) {
  const cls = msg.kind === "error" ? "note-error" : msg.kind === "ok" ? "note-success" : "note-info";
  const Icon = msg.kind === "error" ? AlertCircle : msg.kind === "ok" ? CheckCircle : Info;
  return (
    <p role={msg.kind === "error" ? "alert" : "status"} className={`note ${cls} text-[14px]`}>
      <Icon size={18} />
      <span>{msg.text}</span>
    </p>
  );
}

function DemoNote() {
  return (
    <p className="note note-info text-[14px]">
      <Info size={18} />
      <span>
        Sign-in isn&apos;t switched on for this server yet, so the store runs on sample data. You can still look around the{" "}
        <Link className="underline" href="/">shop</Link>, the <Link className="underline" href="/seller">vendor dashboard</Link>, the{" "}
        <Link className="underline" href="/rider">rider app</Link> and the <Link className="underline" href="/admin">admin console</Link>.
      </span>
    </p>
  );
}

/**
 * The one login page. Everyone signs in here with an email address and password; the account
 * itself decides whether they land in the shop, the vendor dashboard, the rider app or the admin console.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [email, setEmail] = useState(params.get("email")?.slice(0, 254) ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(() => {
    if (params.get("created")) return { kind: "ok", text: "Your account is ready. Log in to start shopping." };
    if (params.get("applied") === "rider") return { kind: "info", text: "Email confirmed. Log in once to send your application to the market team." };
    return null;
  });
  const checked = useRef(false);

  async function land() {
    const sb = supabase();
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    if (!data.session) return false;
    const where = await landingFor(sb, data.session, next);
    if ("blocked" in where) {
      setMsg({ kind: "info", text: where.blocked });
      return true;
    }
    router.replace(where.go);
    router.refresh();
    return true;
  }

  // Someone arriving from an emailed link (or already signed in) gets routed straight away.
  useEffect(() => {
    if (checked.current || !AUTH_ENABLED) return;
    checked.current = true;
    setBusy(true);
    land().finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sb = supabase();
    if (!sb) return setMsg({ kind: "error", text: "Sign-in isn't configured on this server yet." });
    setBusy(true);
    setMsg(null);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setBusy(false);
      // One message for unknown email and wrong password, so accounts can't be enumerated.
      return setMsg({ kind: "error", text: "That email address and password don't match an account." });
    }
    await land();
    setBusy(false);
  }

  async function magic() {
    const sb = supabase();
    if (!sb || !email.trim()) return setMsg({ kind: "error", text: "Enter your email address first." });
    setBusy(true);
    const back = `${window.location.origin}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`;
    await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: back } });
    setBusy(false);
    setMsg({ kind: "ok", text: "If there's an account for that email address, a sign-in link is on its way." });
  }

  return (
    <div>
      <h1 className="heading text-center text-[20px]">Log in to {STORE_NAME}</h1>
      <p className="mt-1 text-center text-[14px] text-maxcontrast">Shoppers, vendors, riders and staff all log in here.</p>

      <form onSubmit={submit} className="mt-5 space-y-3">
        {!AUTH_ENABLED && <DemoNote />}
        <label className="block">
          <span className="label">Email address</span>
          <input type="email" inputMode="email" required maxLength={254} autoComplete="username" className="field mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input type="password" required maxLength={128} autoComplete="current-password" className="field mt-1" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {msg && <Note msg={msg} />}
        <button disabled={busy || !AUTH_ENABLED} className="btn btn-primary btn-lg btn-wide !mt-5">{busy ? "One moment…" : "Log in"}</button>
        <button type="button" disabled={busy || !AUTH_ENABLED} onClick={magic} className="btn btn-tertiary btn-wide">Email me a sign-in link instead</button>
      </form>

      <div className="mt-6 space-y-2 border-t border-border pt-4 text-center text-[14px]">
        <p>New here? <Link className="link" href="/signup">Create a shopper account</Link></p>
        <p>Want to deliver for us? <Link className="link" href="/rider/apply">Apply to ride</Link></p>
        <p className="text-maxcontrast">Selling? <Link className="link" href="/sell">Rent a stall</Link></p>
      </div>
    </div>
  );
}

/**
 * Shopper sign-up (and the vendor route from "Rent a stall"). Riders don't sign up here: they
 * fill in the hiring form at /rider/apply. Once the account exists, people are sent to the login
 * page and come into the shop from there.
 */
export function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const vendor = params.get("as") === "vendor";
  const plan = (params.get("plan") ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sb = supabase();
    if (!sb) return setMsg({ kind: "error", text: "Sign-up isn't configured on this server yet." });
    setBusy(true);
    setMsg(null);
    const after = vendor ? `/sell/apply${plan ? `?plan=${plan}` : ""}` : null;
    const loginUrl = (extra: string) => `/login?${extra}${after ? `&next=${encodeURIComponent(after)}` : ""}`;
    // requested_role is only a hint. Real roles live in app_metadata, which only the backend
    // writes, after a vendor's stall is approved.
    const { data, error } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { requested_role: vendor ? "vendor" : "customer", full_name: name.trim().slice(0, 120) },
        emailRedirectTo: `${window.location.origin}${loginUrl("created=1")}`,
      },
    });
    if (error && error.status !== 422) {
      setBusy(false);
      return setMsg({ kind: "error", text: "Couldn't create the account. Check the details and try again." });
    }
    if (data?.session) {
      // Email confirmation is off on this project: close the fresh session and send them to log in.
      await sb.auth.signOut();
      router.replace(loginUrl(`created=1&email=${encodeURIComponent(email.trim())}`));
      return;
    }
    setBusy(false);
    setMsg({ kind: "ok", text: "Nearly there. We've emailed you a confirmation link; open it and you'll land on the login page." });
  }

  return (
    <div>
      <h1 className="heading text-center text-[20px]">{vendor ? "Create your vendor login" : `Join ${STORE_NAME}`}</h1>
      <p className="mt-1 text-center text-[14px] text-maxcontrast">
        {vendor ? "After you log in, tell us about your shop. New stalls are reviewed within two working days." : "One account for every shop in the market."}
      </p>

      <form onSubmit={submit} className="mt-5 space-y-3">
        {!AUTH_ENABLED && <DemoNote />}
        <label className="block">
          <span className="label">Your name</span>
          <input required maxLength={120} autoComplete="name" className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Email address</span>
          <input type="email" inputMode="email" required maxLength={254} autoComplete="email" className="field mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input type="password" required minLength={10} maxLength={128} autoComplete="new-password" className="field mt-1" value={password} onChange={(e) => setPassword(e.target.value)} />
          <span className="mt-1 block text-[13px] text-maxcontrast">At least 10 characters. A short sentence works well.</span>
        </label>
        {msg && <Note msg={msg} />}
        <button disabled={busy || !AUTH_ENABLED} className="btn btn-primary btn-lg btn-wide !mt-5">{busy ? "One moment…" : "Create account"}</button>
      </form>

      <div className="mt-6 space-y-2 border-t border-border pt-4 text-center text-[14px]">
        <p>Already have an account? <Link className="link" href="/login">Log in</Link></p>
        {!vendor && <p>Want to deliver for us? <Link className="link" href="/rider/apply">Apply to ride</Link></p>}
      </div>
    </div>
  );
}
