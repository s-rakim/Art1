"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AUTH_ENABLED } from "@/lib/config";
import { safeNext } from "@/lib/safe";
import { supabase } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";

const roles: Array<{ id: Role; label: string; home: string; blurb: string; signup?: string }> = [
  { id: "customer", label: "Shopper", home: "/account", blurb: "Track orders, save items and check out faster.", signup: "One account for every store in the market." },
  { id: "vendor", label: "Vendor", home: "/seller", blurb: "Manage your stall: sales, stock, payments and dispatch.", signup: "Create your login, then tell us about your shop. We review new stalls within two working days." },
  { id: "rider", label: "Rider", home: "/rider", blurb: "See your deliveries and go on shift.", signup: "Create your login, then apply to ride. Approved riders are hired by the market team." },
  { id: "admin", label: "Admin", home: "/admin", blurb: "Market operations. Admin accounts are created by invitation only." },
];

function isRole(v: string | null): v is Role {
  return v === "customer" || v === "vendor" || v === "rider" || v === "admin";
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const asParam = params.get("as");
  const [role, setRole] = useState<Role>(isRole(asParam) && !(mode === "signup" && asParam === "admin") ? asParam : "customer");
  const current = roles.find((r) => r.id === role)!;
  const nextParam = params.get("next");
  const next = nextParam ? safeNext(nextParam, current.home) : current.home;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const tabs = mode === "signup" ? roles.filter((r) => r.signup) : roles;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sb = supabase();
    if (!sb) return setMsg({ kind: "error", text: "Sign-in isn't configured on this server yet." });
    setBusy(true);
    setMsg(null);
    if (mode === "login") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      setBusy(false);
      // One message for unknown email and wrong password, so accounts can't be enumerated.
      if (error) return setMsg({ kind: "error", text: "That email and password don't match an account." });
      router.replace(next);
      router.refresh();
      return;
    }
    // requested_role is only a hint for the backend. Real roles live in app_metadata,
    // which only the backend can write after a vendor or rider is approved.
    const after = role === "vendor" ? "/sell/apply" : role === "rider" ? "/rider/apply" : next;
    const { error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { requested_role: role },
        emailRedirectTo: `${window.location.origin}/login?as=${role}&next=${encodeURIComponent(after)}`,
      },
    });
    setBusy(false);
    if (error && error.status !== 422) return setMsg({ kind: "error", text: "Couldn't create the account. Check the details and try again." });
    setMsg({ kind: "ok", text: "Check your inbox for a confirmation link. It expires in an hour." });
  }

  async function magic() {
    const sb = supabase();
    if (!sb || !email) return setMsg({ kind: "error", text: "Enter your email first." });
    setBusy(true);
    await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}${next}` } });
    setBusy(false);
    setMsg({ kind: "ok", text: "If there's an account for that email, a sign-in link is on its way." });
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-14">
      <h1 className="display text-[56px]">{mode === "login" ? "Sign in" : "Create account"}</h1>

      <div role="tablist" aria-label="Account type" className="mt-6 grid border border-ink" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((r, i) => (
          <button
            key={r.id}
            role="tab"
            type="button"
            aria-selected={role === r.id}
            onClick={() => { setRole(r.id); setMsg(null); }}
            className={`h-11 text-[13px] font-semibold ${i ? "border-l border-ink" : ""} ${role === r.id ? "bg-ink text-paper" : "hover:bg-paper-2"}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[14px] text-ink-2">{mode === "signup" ? current.signup : current.blurb}</p>

      {!AUTH_ENABLED && (
        <p className="mt-6 border border-tag bg-tag/15 p-3 text-[13px]">
          This server doesn&apos;t have Supabase keys yet, so sign-in is off. The rest of the store works in demo mode, and you
          can look around the <Link className="underline" href={current.home}>{current.label.toLowerCase()} area</Link> with sample data.
        </p>
      )}

      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block">
          <span className="label">Email</span>
          <input type="email" required maxLength={254} autoComplete="email" className="field mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input
            type="password"
            required
            minLength={mode === "signup" ? 10 : 1}
            maxLength={128}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="field mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "signup" && <span className="mt-1 block text-[12px] text-ink-3">At least 10 characters. A short sentence works well.</span>}
        </label>
        {msg && (
          <p role={msg.kind === "error" ? "alert" : "status"} className={`border-l-2 pl-3 text-[13px] ${msg.kind === "error" ? "border-signal text-signal" : "border-market text-market"}`}>
            {msg.text}
          </p>
        )}
        <button disabled={busy || !AUTH_ENABLED} className="btn btn-ink h-12 w-full">
          {busy ? "One moment…" : mode === "login" ? `Sign in as ${current.label.toLowerCase()}` : `Create ${current.label.toLowerCase()} account`}
        </button>
        {mode === "login" && role !== "admin" && (
          <button type="button" disabled={busy || !AUTH_ENABLED} onClick={magic} className="btn btn-line h-12 w-full">Email me a sign-in link</button>
        )}
      </form>

      <p className="mt-8 text-[14px]">
        {mode === "login" ? (
          role === "admin" ? (
            <span className="text-ink-3">Need admin access? Ask an existing admin to invite you.</span>
          ) : (
            <>New here? <Link className="link-u font-semibold" href={`/signup?as=${role}`}>Create a {current.label.toLowerCase()} account</Link></>
          )
        ) : (
          <>Already have one? <Link className="link-u font-semibold" href={`/login?as=${role}`}>Sign in</Link></>
        )}
      </p>
    </div>
  );
}
