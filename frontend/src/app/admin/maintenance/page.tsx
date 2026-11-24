"use client";
import { useEffect, useState } from "react";
import { ErrorLine, PageTitle } from "@/components/dash";
import { api, ApiError } from "@/lib/api";
import { apiBase, AUTH_ENABLED } from "@/lib/config";
import type { Settings } from "@/lib/types";
import { useApi } from "@/lib/use-api";

type Check = { name: string; ok: boolean | null; detail: string };

export default function Maintenance() {
  const { data, setData, error, token } = useApi((t) => api.adminSettings(t));
  const [draft, setDraft] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  async function runChecks() {
    const out: Check[] = [];
    const t0 = performance.now();
    try {
      const r = await fetch(`${apiBase()}/status`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      out.push({ name: "API", ok: r.ok, detail: `${r.status} in ${Math.round(performance.now() - t0)} ms` });
    } catch {
      out.push({ name: "API", ok: false, detail: "Unreachable" });
    }
    out.push({ name: "Sign-in (Supabase)", ok: AUTH_ENABLED, detail: AUTH_ENABLED ? "Configured" : "Keys missing, running in demo mode" });
    out.push({ name: "Secure connection", ok: window.location.protocol === "https:", detail: window.location.protocol === "https:" ? "HTTPS" : "Plain HTTP. Put the site behind TLS before launch." });
    setChecks(out);
  }

  useEffect(() => {
    runChecks();
  }, []);

  async function save() {
    if (!draft) return;
    if (draft.maintenance_mode && !data?.maintenance_mode && !window.confirm("Turn on maintenance mode? Shoppers, vendors and riders will see the maintenance page until you turn it off.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const s = await api.adminUpdateSettings(token, draft);
      setData(s);
      setMsg({ ok: true, text: "Settings saved." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Couldn't save settings." });
    } finally {
      setBusy(false);
    }
  }

  const toggle = (k: keyof Settings, label: string, note: string) =>
    draft && (
      <label className="flex cursor-pointer items-start justify-between gap-6 border-b border-rule py-4 last:border-0">
        <span><span className="block font-semibold">{label}</span><span className="block text-[13px] text-ink-3">{note}</span></span>
        <input type="checkbox" role="switch" className="mt-1 h-5 w-5 accent-signal" checked={Boolean(draft[k])} onChange={(e) => setDraft({ ...draft, [k]: e.target.checked })} />
      </label>
    );

  return (
    <>
      <PageTitle title="Maintenance" kicker="Site switches and health" />
      <ErrorLine error={error} />
      {draft && (
        <div className={`border-2 p-5 ${draft.maintenance_mode ? "border-signal bg-signal/5" : "border-ink bg-card"}`}>
          {toggle("maintenance_mode", "Maintenance mode", "Shows a holding page everywhere except the admin area and sign-in. Checkout, dispatch and sign-ups pause.")}
          {draft.maintenance_mode && (
            <label className="block pb-4"><span className="label">Message shown to visitors</span><input maxLength={200} className="field mt-1" value={draft.maintenance_message} onChange={(e) => setDraft({ ...draft, maintenance_message: e.target.value })} /></label>
          )}
          {toggle("vendor_signups_open", "Vendor applications open", "Let new shops apply for a stall.")}
          {toggle("rider_signups_open", "Rider applications open", "Let new riders apply. Turn off when you have enough crew.")}
          {msg && <p role="status" className={`mt-3 border-l-2 pl-3 text-[13px] ${msg.ok ? "border-market text-market" : "border-signal text-signal"}`}>{msg.text}</p>}
          <button disabled={busy} onClick={save} className="btn btn-ink mt-4">{busy ? "Saving…" : "Save settings"}</button>
        </div>
      )}
      <div className="mt-8">
        <div className="mb-2 flex items-center justify-between"><p className="label">Health checks</p><button onClick={runChecks} className="link-u text-[13px]">Run again</button></div>
        <ul className="divide-y divide-rule border border-ink bg-card">
          {checks.map((c) => (
            <li key={c.name} className="flex items-center gap-3 px-4 py-3 text-[14px]">
              <span className={`h-2.5 w-2.5 ${c.ok ? "bg-market" : "bg-signal"}`} />
              <span className="font-semibold">{c.name}</span>
              <span className="ml-auto font-mono text-[12px] text-ink-3">{c.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
