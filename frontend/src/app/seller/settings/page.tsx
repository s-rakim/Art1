"use client";
import { useEffect, useState } from "react";
import { ErrorLine, PageTitle } from "@/components/dash";
import { api, ApiError } from "@/lib/api";
import { safeColor } from "@/lib/safe";
import { useApi } from "@/lib/use-api";

export default function StorefrontSettings() {
  const { data, error, token } = useApi((t) => api.sellerMe(t));
  const [f, setF] = useState({ name: "", tagline: "", description: "", banner_color: "#16130f", accent_color: "#f4f0e6" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (data) setF({ name: data.name, tagline: data.tagline, description: data.description, banner_color: safeColor(data.banner_color), accent_color: safeColor(data.accent_color, "#f4f0e6") });
  }, [data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.updateStore(token, { ...f, banner_color: safeColor(f.banner_color), accent_color: safeColor(f.accent_color, "#f4f0e6") });
      setMsg({ ok: true, text: "Saved. Changes show on your storefront within a minute." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="max-w-3xl">
      <PageTitle title="Storefront" kicker="How your stall looks to shoppers" />
      <ErrorLine error={error} />
      <div className="mb-6 border border-ink p-6" style={{ background: safeColor(f.banner_color), color: safeColor(f.accent_color, "#f4f0e6") }}>
        <p className="font-mono text-[11px] uppercase tracking-wider opacity-80">Preview</p>
        <p className="display mt-2 text-[56px]">{f.name || "Your shop"}</p>
        <p className="opacity-90">{f.tagline}</p>
      </div>
      <div className="space-y-4">
        <label className="block"><span className="label">Shop name</span><input required maxLength={60} className="field mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="block"><span className="label">Tagline</span><input maxLength={90} className="field mt-1" value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></label>
        <label className="block"><span className="label">About</span><textarea maxLength={2000} rows={5} className="field mt-1" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-[14px]"><input type="color" value={f.banner_color} onChange={(e) => setF({ ...f, banner_color: e.target.value })} className="h-10 w-12 border border-rule" /> Banner</label>
          <label className="flex items-center gap-2 text-[14px]"><input type="color" value={f.accent_color} onChange={(e) => setF({ ...f, accent_color: e.target.value })} className="h-10 w-12 border border-rule" /> Text</label>
        </div>
        {msg && <p role="status" className={`border-l-2 pl-3 text-[13px] ${msg.ok ? "border-market text-market" : "border-signal text-signal"}`}>{msg.text}</p>}
        <button disabled={busy} className="btn btn-ink">{busy ? "Saving…" : "Save storefront"}</button>
      </div>
    </form>
  );
}
