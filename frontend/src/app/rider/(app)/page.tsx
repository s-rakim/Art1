"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorLine } from "@/components/dash";
import { DeliveryMap, type MapLine, type MapPin } from "@/components/delivery-map";
import { Bike, Cash, CheckCircle, Pin, Truck, Wallet } from "@/components/icons";
import { fitsWith, JobCard, StopCard, why } from "@/components/rider-run";
import { useSite } from "@/components/site-context";
import { Badge, GlassStage, Metric, Panel } from "@/components/ui/glass-dashboard";
import { api, ApiError } from "@/lib/api";
import { ROUTING_URL } from "@/lib/config";
import { money, pct } from "@/lib/format";
import { roadPath } from "@/lib/geo";
import { useBrowserFact } from "@/lib/hooks";
import { useLiveReload } from "@/lib/live";
import type { LatLng, OpenJob, RideStatus } from "@/lib/types";
import { useApi } from "@/lib/use-api";

// The API asks for a position every 10 to 15 seconds while on shift.
const SEND_EVERY_MS = 12000;
const ON_RUN = new Set(["accepted", "picked_up", "arrived"]);
const count = (v: number) => String(Math.round(v));
const today = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

const STATUS: Record<RideStatus, { label: string; badge: "good" | "wait" | "plain"; line: string }> = {
  offline: { label: "Off shift", badge: "plain", line: "Start your shift to see jobs near you and share your location." },
  idle: { label: "Free", badge: "good", line: "Pick a yellow pin or a job below to see where it goes, then accept it." },
  delivering: { label: "Delivering", badge: "wait", line: "Your stops are in red, in the order the customers ordered. Jobs that fit your run stay open." },
};

// Oldest order first, so customers who waited longest are served first; offers to this rider lead.
const byQueue = (a: OpenJob, b: OpenJob) =>
  Number(b.offered) - Number(a.offered) || Number(b.batchable) - Number(a.batchable) || a.placed_at.localeCompare(b.placed_at);

export default function RiderHome() {
  const site = useSite();
  const me = useApi((t) => api.riderMe(t));
  const board = useApi((t) => api.riderOpenJobs(t));
  const run = useApi((t) => api.riderRun(t));
  const history = useApi((t) => api.riderDeliveries(t, "history"));
  const token = me.token;

  const onShift = me.data?.on_shift ?? false;
  const canLocate = useBrowserFact(() => "geolocation" in navigator, true);
  const [switching, setSwitching] = useState(false);
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const lastSent = useRef(0);

  const { reload: reloadBoard, setData: setBoard } = board;
  const { reload: reloadRun } = run;
  const refresh = useCallback(() => {
    reloadBoard();
    reloadRun();
  }, [reloadBoard, reloadRun]);
  const finished = () => {
    refresh();
    me.reload();
    history.reload();
  };

  // Jobs joining or leaving the pool, offers, and changes from shops arrive live; polling covers a dropped socket.
  const live = useLiveReload(["jobs", "job", "order"], refresh, 20000);

  async function toggleShift() {
    setSwitching(true);
    setMsg(null);
    try {
      me.setData(await api.riderShift(token, !onShift));
      refresh();
    } catch (e) {
      setMsg(why(e, "Couldn't change your shift. Check your signal."));
    } finally {
      setSwitching(false);
    }
  }

  // Location is read and shared only while the rider is on shift.
  useEffect(() => {
    if (!onShift || !canLocate) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        setPos(next);
        setGeoError(null);
        const now = Date.now();
        if (now - lastSent.current >= SEND_EVERY_MS) {
          lastSent.current = now;
          const heading = p.coords.heading !== null && Number.isFinite(p.coords.heading) ? p.coords.heading : null;
          const speed = p.coords.speed !== null && Number.isFinite(p.coords.speed) && p.coords.speed >= 0 ? p.coords.speed : null;
          api.riderLocation(token, { lat: next.lat, lng: next.lng, accuracy_m: Math.round(next.accuracy), heading, speed_mps: speed }).catch(() => {});
        }
      },
      (err) => setGeoError(err.code === err.PERMISSION_DENIED ? "Location permission is off. Turn it on so shops and customers can see you coming." : "Can't get a GPS fix right now."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [onShift, canLocate, token]);

  const stops = useMemo(() => (run.data?.stops ?? []).filter((d) => ON_RUN.has(d.status)), [run.data]);
  const jobs = useMemo(() => {
    const mine = new Set(stops.map((s) => s.id));
    return (board.data?.items ?? []).filter((j) => !j.delivery_id || !mine.has(j.delivery_id)).sort(byQueue);
  }, [board.data, stops]);
  const done = useMemo(() => (history.data?.items ?? []).filter((d) => d.status === "delivered" && today(d.delivered_at ?? d.created_at)), [history.data]);
  const rules = board.data?.rules ?? me.data?.rules ?? null;
  const status: RideStatus = stops.length ? "delivering" : onShift ? "idle" : "offline";
  const pick = jobs.find((j) => j.id === picked) ?? null;

  const lastKnown = me.data?.position;
  const here = useMemo<LatLng | null>(
    () => (pos ? { lat: pos.lat, lng: pos.lng } : lastKnown ? { lat: lastKnown.lat, lng: lastKnown.lng } : null),
    [pos, lastKnown],
  );

  // The run's route from the API: shops still to collect, then drop-offs oldest order first.
  // The rider's end of it follows the live GPS fix instead of the last position the API saw.
  const legs = useMemo(() => {
    const route = run.data?.route ?? [];
    const stopsOnly = route.filter((w) => w.kind !== "rider").map(({ lat, lng }) => ({ lat, lng }));
    const start = here ?? route.find((w) => w.kind === "rider") ?? null;
    return stopsOnly.length && start ? [{ lat: start.lat, lng: start.lng }, ...stopsOnly] : stopsOnly;
  }, [run.data, here]);

  // With a routing server, follow the roads. The rider's end is rounded to about a kilometre so
  // the route is fetched again only after real movement, not on every GPS tick.
  const roadKey = legs.length >= 2 ? legs.map((p, i) => `${p.lat.toFixed(i ? 4 : 2)},${p.lng.toFixed(i ? 4 : 2)}`).join(";") : "";
  const [road, setRoad] = useState<{ key: string; path: LatLng[] } | null>(null);
  useEffect(() => {
    if (!roadKey || !ROUTING_URL) return;
    const points = roadKey.split(";").map((s) => {
      const [lat, lng] = s.split(",").map(Number);
      return { lat, lng };
    });
    const stop = new AbortController();
    roadPath(points, stop.signal).then((path) => path && setRoad({ key: roadKey, path }));
    return () => stop.abort();
  }, [roadKey]);

  const { pins, lines } = useMemo(() => {
    const pins: MapPin[] = [];
    const shops = new Set<string>();
    const shop = (key: string, p: LatLng | null, label: string) => {
      if (!p || shops.has(key)) return;
      shops.add(key);
      pins.push({ id: `shop:${key}`, kind: "pickup", label, lat: p.lat, lng: p.lng });
    };
    for (const d of done) if (d.dropoff) pins.push({ id: `done:${d.id}`, kind: "dropoff", tone: "done", label: d.order_number, lat: d.dropoff.lat, lng: d.dropoff.lng });
    for (const j of jobs) {
      if (!j.dropoff) continue;
      const isPick = j.id === pick?.id;
      // Out of reach: the API says it can't join the run, or it can't ride along with the job picked.
      const dim = !j.batchable || (!!pick && !isPick && !!rules && !fitsWith(pick, j, rules));
      pins.push({ id: `job:${j.id}`, kind: "dropoff", tone: isPick ? "live" : "open", dim, label: `${j.order_number}, near ${j.area ?? j.store.name}`, lat: j.dropoff.lat, lng: j.dropoff.lng });
    }
    if (pick) shop(pick.store.id || pick.store.name, pick.pickup, pick.store.name);
    for (const s of stops) {
      if (s.status === "accepted") shop(s.store_id ?? s.store_name, s.pickup, s.store_name);
      if (s.dropoff) pins.push({ id: `stop:${s.id}`, kind: "dropoff", tone: "live", label: `${s.order_number}${s.customer_name ? `, ${s.customer_name}` : ""}`, lat: s.dropoff.lat, lng: s.dropoff.lng });
    }
    if (here) pins.push({ id: "me", kind: "rider", label: "You", lat: here.lat, lng: here.lng, heading: null });

    const path = road && road.key === roadKey ? [...(here ? [here] : []), ...road.path] : legs;
    const lines: MapLine[] = path.length >= 2 ? [{ id: "run", from: path[0], to: path[path.length - 1], path }] : [];
    return { pins, lines };
  }, [done, jobs, pick, rules, stops, here, road, roadKey, legs]);

  function onPin(id: string) {
    const [kind, key] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)];
    if (kind === "job") setPicked((cur) => (cur === key ? null : key));
    const el = document.getElementById(kind === "job" ? `job-${key}` : kind === "stop" ? `stop-${key}` : "");
    el?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  async function claim(j: OpenJob) {
    setBusyJob(j.id);
    setMsg(null);
    try {
      await api.riderClaim(token, j.id);
      setPicked(null);
      refresh();
      me.reload();
    } catch (e) {
      setMsg(why(e, "Couldn't take that job. Check your signal and try again."));
      if (e instanceof ApiError && e.code === "taken") setBoard((b) => b && { ...b, items: b.items.filter((x) => x.id !== j.id) });
      else reloadBoard();
    } finally {
      setBusyJob(null);
    }
  }

  async function skip(j: OpenJob) {
    setBusyJob(j.id);
    setMsg(null);
    try {
      await api.riderSkip(token, j.id);
      setBoard((b) => b && { ...b, items: b.items.filter((x) => x.id !== j.id) });
      if (picked === j.id) setPicked(null);
    } catch (e) {
      setMsg(why(e, "Couldn't skip that job. Check your signal and try again."));
    } finally {
      setBusyJob(null);
    }
  }

  const ready = board.data !== null && run.data !== null;
  const r = me.data;
  const followed = pick ? `job:${pick.id}` : stops.length && here ? "me" : undefined;
  const todayEarned = done.reduce((a, d) => a + (d.earning_cents ?? 0), 0);

  const jobList = !board.data ? (
    <p className="gd-empty" role="status">Loading jobs…</p>
  ) : !jobs.length ? (
    <p className="gd-empty">
      {onShift ? "No jobs near you right now. New ones appear here and on the map by themselves." : "Start your shift to see jobs from shops near you."}
    </p>
  ) : (
    <ul aria-label="Open jobs">
      {jobs.map((j) => (
        <JobCard
          key={j.id}
          j={j}
          rules={rules}
          picked={j.id === pick?.id}
          fits={!!pick && j.id !== pick.id && j.batchable && !!rules && fitsWith(pick, j, rules)}
          onRun={stops.length > 0}
          onShift={onShift}
          busy={busyJob === j.id}
          onPick={() => setPicked((cur) => (cur === j.id ? null : j.id))}
          onClaim={() => claim(j)}
          onSkip={() => skip(j)}
        />
      ))}
    </ul>
  );

  return (
    <GlassStage
      kicker={r ? `${r.full_name} · ${r.vehicle.replace(/_/g, " ")}` : "Rider"}
      title="Your deliveries"
      description={STATUS[status].line}
      live={live}
      actions={
        <>
          <Badge state={STATUS[status].badge}>{STATUS[status].label}</Badge>
          <button
            type="button"
            onClick={toggleShift}
            disabled={switching || !r || (onShift && stops.length > 0)}
            aria-pressed={onShift}
            title={onShift && stops.length ? "Finish or hand back your stops before ending the shift" : undefined}
            className={`gd-btn ${onShift ? "" : "gd-btn-primary"}`}
          >
            {switching ? "…" : onShift ? "End shift" : "Start shift"}
          </button>
        </>
      }
    >
      <div className="gd-panel p-1.5">
        {ready ? (
          <DeliveryMap pins={pins} lines={lines} follow={followed} onPinClick={onPin} className="h-[300px] sm:h-[400px]" />
        ) : (
          <div className="h-[300px] animate-pulse rounded-container bg-background-hover sm:h-[400px]" role="status" aria-label="Loading the map" />
        )}
      </div>

      {onShift && (
        <p className="note note-success text-[14px]">
          <Pin size={18} />
          <span>
            Sharing your location with the market, and with the shop and customer on each of your jobs, while you&apos;re on shift.
            {pos && <span className="ml-1 tabular-nums text-maxcontrast">±{Math.round(pos.accuracy)} m</span>}
          </span>
        </p>
      )}
      <ErrorLine error={(onShift && !canLocate ? "This browser can't share location." : geoError) ?? msg ?? me.error ?? board.error ?? run.error} />

      <div className="gd-metrics">
        <Metric i={0} tone="accent" label="Deliveries done" icon={<CheckCircle size={16} />} value={r ? r.deliveries_completed : null} format={count} note={`${done.length} today`} />
        <Metric
          i={1}
          label="Earned"
          icon={<Cash size={16} />}
          value={r?.earnings_cents ?? null}
          format={money}
          note={rules ? `${pct(rules.commission_rate)} commission, set by the market` : `${money(todayEarned)} today`}
        />
        <Metric i={2} label="Owed to you" icon={<Wallet size={16} />} value={r?.unpaid_earnings_cents ?? null} format={money} note="paid out by the market" />
        <Metric
          i={3}
          tone={status === "delivering" ? "attention" : undefined}
          label="On your run"
          icon={<Truck size={16} />}
          value={run.data ? stops.length : null}
          format={count}
          note={rules ? `up to ${rules.max_batch} at once` : undefined}
        />
      </div>

      <div className="gd-split">
        <Panel
          i={4}
          title={stops.length ? "Your run" : "Open jobs"}
          subtitle={
            stops.length
              ? "In the order the customers ordered. Address and phone show once you accept."
              : rules
                ? `Within ${rules.pool_radius_km} km of you. Exact address and phone show once you accept.`
                : "Exact address and phone show once you accept."
          }
        >
          {stops.length > 0 ? (
            <ol aria-label="Stops on your run">
              {stops.map((d, i) => (
                <StopCard key={d.id} d={d} n={i + 1} token={token} here={here} onShift={onShift} pay={site.payment} onSaved={refresh} onDone={finished} />
              ))}
            </ol>
          ) : (
            jobList
          )}
        </Panel>

        <div className="space-y-3">
          {stops.length > 0 && (
            <Panel
              i={5}
              title="Jobs that fit your run"
              subtitle={rules ? `Drop-offs within ${rules.batch_radius_km} km of your run, from shops within ${rules.pickup_radius_km} km. The rest are locked until you finish.` : undefined}
            >
              {jobList}
            </Panel>
          )}
          <Panel i={6} title="Delivered today" subtitle={done.length ? `${money(todayEarned)} earned today` : undefined}>
            {done.length ? (
              <ul className="space-y-1.5 text-[14px]">
                {done.map((d) => (
                  <li key={d.id} className="flex items-center gap-2">
                    <span className="job-dot" data-tone="done" aria-hidden />
                    <span className="font-semibold tabular-nums">{d.order_number}</span>
                    <span className="min-w-0 truncate text-maxcontrast">{d.store_name}</span>
                    {d.earning_cents != null && <span className="price ml-auto">{money(d.earning_cents)}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="gd-empty"><Bike size={16} className="mr-1 inline" />Your green pins show up here as you deliver.</p>
            )}
          </Panel>
        </div>
      </div>
    </GlassStage>
  );
}
