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
    <div>
      <h1 className="heading text-center text-[20px]">{mode === "login" ? "Log in to your account" : "Create an account"}</h1>

      <div role="tablist" aria-label="Account type" className="mt-5 flex overflow-hidden rounded-element border border-border-maxcontrast">
        {tabs.map((r, i) => (
          <button
            key={r.id}
            role="tab"
            type="button"
            aria-selected={role === r.id}
            onClick={() => { setRole(r.id); setMsg(null); }}
            className={`h-[34px] flex-1 text-[14px] font-medium transition-colors ${i ? "border-l border-border-maxcontrast" : ""} ${role === r.id ? "bg-primary-element-light font-semibold text-primary-element-light-text" : "hover:bg-background-hover"}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-[14px] text-maxcontrast">{mode === "signup" ? current.signup : current.blurb}</p>

      {!AUTH_ENABLED && (
        <p className="note note-info mt-5 text-[14px]">
          <span>
            This server doesn&apos;t have Supabase keys yet, so sign-in is off. The rest of the store works in demo mode, and you
            can look around the <Link className="underline" href={current.home}>{current.label.toLowerCase()} area</Link> with sample data.
          </span>
        </p>
      )}

      <form onSubmit={submit} className="mt-5 space-y-3">
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
          {mode === "signup" && <span className="mt-1 block text-[13px] text-maxcontrast">At least 10 characters. A short sentence works well.</span>}
        </label>
        {msg && (
          <p role={msg.kind === "error" ? "alert" : "status"} className={`note text-[14px] ${msg.kind === "error" ? "note-error" : "note-success"}`}>
            <span>{msg.text}</span>
          </p>
        )}
        <button disabled={busy || !AUTH_ENABLED} className="btn btn-primary btn-lg btn-wide !mt-5">
          {busy ? "One moment…" : mode === "login" ? `Log in as ${current.label.toLowerCase()}` : `Create ${current.label.toLowerCase()} account`}
        </button>
        {mode === "login" && role !== "admin" && (
          <button type="button" disabled={busy || !AUTH_ENABLED} onClick={magic} className="btn btn-tertiary btn-wide">Email me a sign-in link</button>
        )}
      </form>

      <p className="mt-6 text-center text-[14px]">
        {mode === "login" ? (
          role === "admin" ? (
            <span className="text-maxcontrast">Need admin access? Ask an existing admin to invite you.</span>
          ) : (
            <>New here? <Link className="link" href={`/signup?as=${role}`}>Create a {current.label.toLowerCase()} account</Link></>
          )
        ) : (
          <>Already have one? <Link className="link" href={`/login?as=${role}`}>Log in</Link></>
        )}
      </p>
    </div>
  );
}
