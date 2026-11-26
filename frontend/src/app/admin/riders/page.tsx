"use client";
import { useCallback, useMemo, useState } from "react";
import { ErrorLine, PageTitle } from "@/components/dash";
import { DeliveryMap, type MapPin } from "@/components/delivery-map";
import { LiveDot } from "@/components/live-refresh";
import { RidersList } from "@/components/riders-list";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { api, ApiError } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import { useLiveReload, useLiveTracking, type LiveEvent } from "@/lib/live";
import type { Rider } from "@/lib/types";
import { useApi } from "@/lib/use-api";

type Next = "active" | "suspended" | "rejected";

export default function AdminRiders() {
  const crew = useApi((t) => api.adminRiders(t));
  const apps = useApi((t) => api.adminRiderApplications(t));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [asking, setAsking] = useState<{ rider: Rider; status: Next } | null>(null);
  const [note, setNote] = useState("");

  // New applications land in the queue live; rider dots move with the whole-market feed.
  const appsLive = useLiveReload(["application"], () => (apps.reload(), crew.reload()), 30000, (e) => e.type === "application" && e.kind === "rider");
  const move = useCallback(
    (e: LiveEvent) => {
      if (e.type !== "rider_location") return;
      crew.setData((d) => d && { ...d, items: d.items.map((r) => (r.id === e.rider_id ? { ...r, position: { lat: e.lat, lng: e.lng, at: e.at, heading: r.position?.heading } } : r)) });
    },
    [crew],
  );
  const mapLive = useLiveTracking(crew.token, { admin: true }, move);
  useLiveReload([], crew.reload, mapLive ? 60000 : 15000);

  async function setStatus(r: Rider, status: Next, review_note?: string) {
    setBusy(r.id);
    setMsg(null);
    try {
      await api.adminUpdateRider(crew.token, r.id, status, review_note);
      crew.reload();
      apps.reload();
      setAsking(null);
      setNote("");
      if (status === "active" && r.status === "applicant") setMsg({ ok: true, text: `${r.full_name} is hired and can go on shift now.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Update failed." });
    } finally {
      setBusy(null);
    }
  }

  async function settle(r: Rider) {
    setBusy(r.id);
    setMsg(null);
    try {
      const res = await api.adminSettleRider(crew.token, r.id);
      setMsg({ ok: true, text: res.paid_cents ? `Recorded ${money(res.paid_cents)} paid to ${r.full_name}.` : `${r.full_name} had nothing owing.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Couldn't record that payment." });
    } finally {
      setBusy(null);
    }
  }

  const applicants = apps.data?.items ?? [];
  const team = useMemo(() => [...(crew.data?.items ?? [])].sort((a, b) => Number(b.on_shift) - Number(a.on_shift) || b.active_deliveries - a.active_deliveries || a.full_name.localeCompare(b.full_name)), [crew.data]);
  const pins = useMemo<MapPin[]>(
    () => team.filter((r) => r.status === "active" && r.on_shift && r.position).map((r) => ({ id: r.id, kind: r.active_deliveries > 0 ? "rider" : "idle", label: r.full_name, lat: r.position!.lat, lng: r.position!.lng, heading: r.position!.heading })),
    [team],
  );

  return (
    <>
      <PageTitle
        title="Riders and hiring"
        kicker={`${team.filter((r) => r.on_shift && r.status === "active").length} on shift now · ${applicants.length} waiting for a decision`}
        action={<LiveDot live={appsLive || mapLive} />}
      />
      <ErrorLine error={crew.error ?? apps.error} />
      {msg && <p role="status" className={`mb-4 border-l-2 pl-3 text-[13px] ${msg.ok ? "border-element-success text-text-success" : "border-element-error text-text-error"}`}>{msg.text}</p>}

      <section className="mb-10" aria-labelledby="apps-h">
        <h2 id="apps-h" className="heading mb-1 flex items-center gap-2 text-[18px]">
          Rider applications {applicants.length > 0 && <span className="counter counter-highlighted">{applicants.length}</span>}
        </h2>
        <p className="mb-3 text-[14px] text-maxcontrast">People who filled in the hiring form. Nobody can log in as a rider until you hire them here.</p>
        {applicants.length === 0 && apps.data && <p className="rounded-container border border-dashed border-border-dark px-4 py-6 text-center text-[14px] text-maxcontrast">No applications waiting. New ones appear here as soon as they&apos;re sent.</p>}
        {applicants.length > 0 && (
          <ul className="grid gap-3 md:grid-cols-2">
            {applicants.map((r) => (
              <li key={r.id} className="card p-4">
                <p className="heading text-[20px]">{r.full_name}</p>
                <dl className="mt-1 grid grid-cols-[90px_1fr] gap-y-0.5 text-[13px]">
                  <dt className="text-maxcontrast">Vehicle</dt><dd className="capitalize">{r.vehicle.replace(/_/g, " ")}</dd>
                  <dt className="text-maxcontrast">City</dt><dd>{r.city}</dd>
                  <dt className="text-maxcontrast">Phone</dt><dd>{r.phone}</dd>
                  {r.email && <><dt className="text-maxcontrast">Email</dt><dd className="break-all">{r.email}</dd></>}
                  {r.licence_number && <><dt className="text-maxcontrast">Licence</dt><dd className="tabular-nums">{r.licence_number}</dd></>}
                  <dt className="text-maxcontrast">Applied</dt><dd>{shortDate(r.applied_at)}</dd>
                </dl>
                <div className="mt-3 flex gap-2">
                  <button disabled={busy === r.id} onClick={() => setStatus(r, "active")} className="btn btn-primary btn-sm">Hire</button>
                  <button disabled={busy === r.id} onClick={() => { setAsking({ rider: r, status: "rejected" }); setNote(""); }} className="btn btn-tertiary btn-sm">Turn down</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="team-h">
        <h2 id="team-h" className="heading mb-1 text-[18px]">Your riders</h2>
        <p className="mb-3 text-[14px] text-maxcontrast">Open a rider to see where they are, how to reach them and what they&apos;re carrying.</p>
        <div className="grid gap-4 xl:grid-cols-[1fr_460px]">
          <DeliveryMap pins={pins} className="h-[340px] xl:h-[600px]" />
          <div className="xl:max-h-[600px] xl:overflow-y-auto">
            <RidersList
              riders={team}
              showLicence
              empty="No riders hired yet."
              actions={(r) => (
                <>
                  {r.status === "active" && <button disabled={busy === r.id} onClick={() => settle(r)} className="btn btn-secondary btn-sm">Mark paid</button>}
                  {r.status === "active" ? (
                    <button disabled={busy === r.id} onClick={() => { setAsking({ rider: r, status: "suspended" }); setNote(""); }} className="btn btn-tertiary btn-sm text-text-error">Suspend</button>
                  ) : (
                    <button disabled={busy === r.id} onClick={() => setStatus(r, "active", "")} className="btn btn-secondary btn-sm">Reinstate</button>
                  )}
                </>
              )}
            />
          </div>
        </div>
      </section>
      <p className="mt-2 text-[12px] text-maxcontrast">&ldquo;Mark paid&rdquo; records that you&apos;ve paid a rider everything they&apos;re owed, outside the app.</p>

      <Modal
        open={!!asking}
        onClose={() => setAsking(null)}
        busy={!!asking && busy === asking.rider.id}
        title={asking ? `${asking.status === "rejected" ? "Turn down" : "Suspend"} ${asking.rider.full_name}` : ""}
      >
        {asking && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStatus(asking.rider, asking.status, note.trim());
            }}
          >
            {asking.status === "suspended" && <p className="px-4 text-[14px] text-maxcontrast">They go off shift and can&apos;t take jobs until reinstated.</p>}
            <label className="block p-4"><span className="label">Note for the rider</span>
              <textarea required minLength={5} maxLength={500} rows={3} className="field mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <ModalFooter>
              <button type="button" onClick={() => setAsking(null)} className="btn btn-tertiary">Cancel</button>
              <button disabled={busy === asking.rider.id} className="btn btn-error">{asking.status === "rejected" ? "Turn down" : "Suspend"}</button>
            </ModalFooter>
          </form>
        )}
      </Modal>
    </>
  );
}
