"use client";
import { useEffect, useState } from "react";
import { ErrorLine, PageTitle } from "@/components/dash";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api, ApiError } from "@/lib/api";
import { apiBase, AUTH_ENABLED } from "@/lib/config";
import type { Settings } from "@/lib/types";
import { useDraft } from "@/lib/hooks";
import { useApi } from "@/lib/use-api";

type Check = { name: string; ok: boolean | null; detail: string };

/** The quick health checks at the top of the page: API, sign-in keys, HTTPS. */
async function healthChecks(): Promise<Check[]> {
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
  return out;
}

export default function Maintenance() {
  const { data, setData, error, token } = useApi((t) => api.adminSettings(t));
  const [draft, setDraft] = useDraft<Settings, Settings>(data, (d) => d);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [asking, setAsking] = useState(false);

  async function runChecks() {
    setChecks(await healthChecks());
  }

  useEffect(() => {
    let alive = true;
    healthChecks().then((c) => alive && setChecks(c));
    return () => {
      alive = false;
    };
  }, []);

  async function save(confirmed = false) {
    if (!draft) return;
    // Switching the whole site off gets a second look first.
    if (draft.maintenance_mode && !data?.maintenance_mode && !confirmed) return setAsking(true);
    setAsking(false);
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
      <label className="flex cursor-pointer items-start justify-between gap-6 border-b border-border py-4 last:border-0">
        <span><span className="block font-semibold">{label}</span><span className="block text-[13px] text-maxcontrast">{note}</span></span>
        <input type="checkbox" role="switch" className="rounded-full mt-1 h-5 w-5 accent-primary-element" checked={Boolean(draft[k])} onChange={(e) => setDraft({ ...draft, [k]: e.target.checked })} />
      </label>
    );

  return (
    <>
      <PageTitle title="Maintenance" kicker="Site switches and health" />
      <ErrorLine error={error} />
      {draft && (
        <div className={`rounded-element border-2 p-5 ${draft.maintenance_mode ? "border-element-error bg-error" : "border-border-dark bg-main-background"}`}>
          {toggle("maintenance_mode", "Maintenance mode", "Shows a holding page everywhere except the admin area and sign-in. Checkout, dispatch and sign-ups pause.")}
          {draft.maintenance_mode && (
            <label className="block pb-4"><span className="label">Message shown to visitors</span><input maxLength={200} className="field mt-1" value={draft.maintenance_message} onChange={(e) => setDraft({ ...draft, maintenance_message: e.target.value })} /></label>
          )}
          {toggle("vendor_signups_open", "Vendor applications open", "Let new shops apply for a stall.")}
          {toggle("rider_signups_open", "Rider applications open", "Let new riders apply. Turn off when you have enough crew.")}
          {msg && <p role="status" className={`mt-3 border-l-2 pl-3 text-[13px] ${msg.ok ? "border-element-success text-text-success" : "border-element-error text-text-error"}`}>{msg.text}</p>}
          <button disabled={busy} onClick={() => save()} className="btn btn-primary mt-4">{busy ? "Saving…" : "Save settings"}</button>
        </div>
      )}
      <ConfirmDialog open={asking} title="Turn on maintenance mode?" confirm="Turn it on" busy={busy} onConfirm={() => save(true)} onClose={() => setAsking(false)}>
        Shoppers, vendors and riders will see the maintenance page until you turn it off. The admin area and sign-in stay open.
      </ConfirmDialog>
      <div className="mt-8">
        <div className="mb-2 flex items-center justify-between"><p className="label">Health checks</p><button onClick={runChecks} className="link-u text-[13px]">Run again</button></div>
        <ul className="rounded-element divide-y divide-border border border-border-dark bg-main-background">
          {checks.map((c) => (
            <li key={c.name} className="flex items-center gap-3 px-4 py-3 text-[14px]">
              <span className={`rounded-full h-2.5 w-2.5 ${c.ok ? "bg-success" : "bg-element-error"}`} />
              <span className="font-semibold">{c.name}</span>
              <span className="ml-auto tabular-nums text-[12px] text-maxcontrast">{c.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
