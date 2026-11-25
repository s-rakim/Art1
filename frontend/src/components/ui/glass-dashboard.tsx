"use client";

// The live dashboards (admin income and deliveries, the vendor overview, the rider's activity),
// after the "glassy dashboard" workspace on 21st.dev: a frosted stage on the wallpaper, a view
// dock that slides between views, glass panels, counters that run up to their value, and CSV
// export. Rebuilt on The Bazaar's tokens instead of the original's sample data, photo backdrop,
// GSAP and lucide: the wave shader shows through, motion (already in the app) drives the
// counters, entrances are CSS, and the icons are the app's own MDI set. The styles live in
// globals.css under "Glass dashboards".

import { animate } from "motion";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import {
  useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore,
  type CSSProperties, type KeyboardEvent, type ReactNode,
} from "react";
import { ArrowDownRight, ArrowUpRight, Download, Filter, Search } from "@/components/icons";
import { cn } from "@/lib/utils";

/** Series slots in fixed order. Colours are validated for colour-blind separation in globals.css. */
export type Tone = 1 | 2 | 3 | 4 | 5;
const tone = (t: Tone) => ({ "--gd-series": `var(--gd-s${t})` }) as CSSProperties;

// ---------------------------------------------------------------------------------------
// Views in the URL hash, so a view can be linked to and Back goes to the previous one.

const onHash = (tell: () => void) => {
  window.addEventListener("hashchange", tell);
  window.addEventListener("popstate", tell);
  return () => {
    window.removeEventListener("hashchange", tell);
    window.removeEventListener("popstate", tell);
  };
};

export function useHashView<T extends string>(ids: readonly T[], fallback: T): [T, (next: T) => void] {
  const hash = useSyncExternalStore(onHash, () => window.location.hash.slice(1), () => "");
  const view = ids.find((v) => v === hash) ?? fallback;
  const go = (next: T) => {
    if (next === view) return;
    history.pushState(null, "", next === fallback ? window.location.pathname + window.location.search : `#${next}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
  return [view, go];
}

// ---------------------------------------------------------------------------------------
// The stage

export type DashView<T extends string> = { id: T; label: string; short?: string; icon: ReactNode; description: string };

/**
 * The frosted frame every live dashboard sits in: a title, the period and export controls,
 * a live indicator, and (with `views`) a dock to move between views.
 */
export function GlassStage<T extends string>({
  kicker, title, description, live, pollSeconds = 20, actions, views, view, onView, children,
}: {
  kicker?: string;
  title: string;
  description?: string;
  /** true while the realtime socket is up; undefined hides the indicator. */
  live?: boolean;
  pollSeconds?: number;
  actions?: ReactNode;
  views?: DashView<T>[];
  view?: T;
  onView?: (next: T) => void;
  children: ReactNode;
}) {
  const headId = useId();
  const current = views?.find((v) => v.id === view);
  return (
    <section className="gd" aria-labelledby={headId}>
      <header className="gd-head">
        <div className="min-w-0">
          {kicker && <p className="gd-kicker">{kicker}</p>}
          <h1 id={headId} className="gd-title">{current && current.id !== views?.[0]?.id ? current.label : title}</h1>
          {(current?.description ?? description) && <p className="gd-sub">{current?.description ?? description}</p>}
        </div>
        <div className="gd-actions">
          {live !== undefined && (
            <span className="gd-live" data-live={live || undefined} role="status">
              <i aria-hidden />
              {live ? "Live" : `Updates every ${pollSeconds} s`}
            </span>
          )}
          {actions}
        </div>
      </header>
      {views && view && onView ? (
        <>
          <div id={`${headId}-panel`} role="tabpanel" aria-label={current?.label} key={view} className="gd-body">
            {children}
          </div>
          <Dock views={views} view={view} onView={onView} controls={`${headId}-panel`} />
        </>
      ) : (
        <div className="gd-body">{children}</div>
      )}
    </section>
  );
}

function Dock<T extends string>({ views, view, onView, controls }: { views: DashView<T>[]; view: T; onView: (v: T) => void; controls: string }) {
  const bar = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLSpanElement>(null);

  // Slide the white pill under the selected view. DOM writes only, so no re-render per frame.
  useLayoutEffect(() => {
    const box = bar.current;
    const pill = marker.current;
    if (!box || !pill) return;
    const place = () => {
      const on = box.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!on) return;
      pill.style.width = `${on.offsetWidth}px`;
      pill.style.height = `${on.offsetHeight}px`;
      pill.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
      pill.dataset.ready = "true";
    };
    place();
    const watch = new ResizeObserver(place);
    watch.observe(box);
    return () => watch.disconnect();
  }, [view]);

  function onKey(e: KeyboardEvent) {
    const i = views.findIndex((v) => v.id === view);
    const to = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: views.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = views[(to + views.length) % views.length];
    onView(next.id);
    bar.current?.querySelector<HTMLElement>(`[data-view="${next.id}"]`)?.focus();
  }

  return (
    <div className="gd-dock-wrap">
      <div ref={bar} className="gd-dock" role="tablist" aria-label="Dashboard views" onKeyDown={onKey}>
        <span ref={marker} className="gd-dock-pill" aria-hidden />
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            data-view={v.id}
            aria-selected={v.id === view}
            aria-controls={controls}
            tabIndex={v.id === view ? 0 : -1}
            onClick={() => onView(v.id)}
          >
            {v.icon}
            <span className="max-sm:hidden">{v.label}</span>
            <span className="sm:hidden">{v.short ?? v.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Controls

export function PeriodSwitch<T extends string>({ value, options, onChange, label = "Period" }: {
  value: T; options: ReadonlyArray<readonly [T, string]>; onChange: (v: T) => void; label?: string;
}) {
  return (
    <div className="gd-period" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export function ExportButton({ onClick, disabled, label = "Export CSV" }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" className="gd-btn gd-btn-primary" onClick={onClick} disabled={disabled}>
      <Download size={16} />
      {label}
    </button>
  );
}

/**
 * Downloads rows as a CSV file. Cells that a spreadsheet would read as a formula (a store
 * name like "=HYPERLINK(...)") get a leading apostrophe, so an export can't run anything when
 * someone opens it in Excel or Sheets.
 */
export function saveCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[^A-Za-z0-9._-]/g, "-");
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ---------------------------------------------------------------------------------------
// Numbers

/** A number that runs up to its value, and from the old value to the new one when data refreshes. */
export function Counter({ value, format }: { value: number; format: (n: number) => string }) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  const reduce = useReducedMotion();
  const fmt = useRef(format);
  useEffect(() => {
    fmt.current = format;
  });
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    if (reduce || !Number.isFinite(value)) {
      shown.current = value;
      node.textContent = fmt.current(value);
      return;
    }
    const run = animate(shown.current, value, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (n) => {
        shown.current = n;
        node.textContent = fmt.current(n);
      },
    });
    return () => run.stop();
  }, [value, reduce]);
  return (
    <>
      <span ref={el} aria-hidden>{format(value)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}

export function Delta({ value, goodWhenUp = true }: { value: number | null; goodWhenUp?: boolean }) {
  if (value === null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  const bad = up !== goodWhenUp && value !== 0;
  return (
    <span className="gd-delta" data-attention={bad || undefined}>
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {`${up ? "+" : "−"}${Math.abs(value).toFixed(Math.abs(value) < 10 ? 1 : 0)}%`}
    </span>
  );
}

/** Percentage change between two totals, or null when there's nothing to compare against. */
export function change(now: number, before: number) {
  return before > 0 ? ((now - before) / before) * 100 : null;
}

export function Metric({
  label, value, format, icon, note, delta, tone: t, href, i = 0,
}: {
  label: string;
  value: number | null;
  format: (n: number) => string;
  icon: ReactNode;
  note?: ReactNode;
  delta?: ReactNode;
  /** "accent" is the solid blue card; "attention" marks something waiting on you. */
  tone?: "accent" | "attention";
  href?: string;
  i?: number;
}) {
  const body = (
    <>
      <span className="gd-metric-head"><span>{label}</span><span className="gd-metric-icon" aria-hidden>{icon}</span></span>
      <strong className="gd-metric-value">{value === null ? "…" : <Counter value={value} format={format} />}</strong>
      <span className="gd-metric-note">{delta}{note && <span>{note}</span>}</span>
    </>
  );
  const props = { className: "gd-metric", "data-tone": t, style: { "--i": i } as CSSProperties };
  return href ? <Link href={href} {...props}>{body}</Link> : <article {...props}>{body}</article>;
}

// ---------------------------------------------------------------------------------------
// Panels

export function Panel({ title, subtitle, action, className, children, i = 0 }: {
  title: string; subtitle?: string; action?: ReactNode; className?: string; children: ReactNode; i?: number;
}) {
  const id = useId();
  return (
    <section className={cn("gd-panel", className)} aria-labelledby={id} style={{ "--i": i } as CSSProperties}>
      <header className="gd-panel-head">
        <div className="min-w-0"><h2 id={id}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Legend({ items }: { items: Array<{ label: string; tone: Tone }> }) {
  return (
    <ul className="gd-legend" aria-label="Legend">
      {items.map((it) => <li key={it.label} style={tone(it.tone)}><i aria-hidden />{it.label}</li>)}
    </ul>
  );
}

export function Meter({ label, value, max, note }: { label: string; value: number; max: number; note?: ReactNode }) {
  const share = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div>
      <div className="gd-meter" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <i style={{ width: `${share * 100}%` }} />
      </div>
      {note && <p className="gd-meter-note">{note}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Charts. One y-axis each; pointer and keyboard both move a readout, which is also announced.

function useActive(n: number) {
  const [active, setActive] = useState<number | null>(null);
  const onKey = (e: KeyboardEvent) => {
    const at = active ?? n - 1;
    const to = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    setActive(Math.max(0, Math.min(n - 1, to)));
  };
  return { active: active !== null && active < n ? active : null, setActive, onKey };
}

/** Columns of stacked series, oldest on the left. */
export function StackChart({ title, rows, series, format }: {
  title: string;
  rows: Array<{ label: string; values: number[] }>;
  series: Array<{ label: string; tone: Tone }>;
  format: (n: number) => string;
}) {
  const { active, setActive, onKey } = useActive(rows.length);
  const max = Math.max(1, ...rows.map((r) => r.values.reduce((a, b) => a + b, 0))) * 1.08;
  const sel = active === null ? null : rows[active];
  const total = (r: { values: number[] }) => r.values.reduce((a, b) => a + b, 0);
  const every = Math.max(1, Math.ceil(rows.length / 7));
  return (
    <figure className="gd-chart">
      <div className="gd-chart-meta">
        {series.length > 1 ? <Legend items={series} /> : <span />}
        <span className="gd-readout" aria-live="polite">
          {sel ? `${sel.label}: ${format(total(sel))}` : ""}
        </span>
      </div>
      <div
        className="gd-stack"
        tabIndex={0}
        role="group"
        aria-label={`${title}. Use the arrow keys to read each day.`}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        style={{ "--n": rows.length } as CSSProperties}
      >
        {rows.map((r, i) => {
          const sum = total(r);
          return (
            <div key={`${r.label}-${i}`} className="gd-col" data-active={active === i || undefined} onPointerEnter={() => setActive(i)} onClick={() => setActive(i)}>
              <span className="gd-bar" style={{ height: `${(sum / max) * 100}%`, "--d": `${i * 18}ms` } as CSSProperties}>
                {r.values.map((v, k) => v > 0 && <i key={k} style={{ ...tone(series[k]?.tone ?? 1), flexGrow: v }} />)}
              </span>
            </div>
          );
        })}
        {sel && (
          <div className="gd-tip" style={{ "--x": `${((active! + 0.5) / rows.length) * 100}%` } as CSSProperties} aria-hidden>
            <strong>{sel.label}</strong>
            {series.map((s, k) => sel.values[k] ? <span key={s.label} style={tone(s.tone)}><i />{s.label}<b>{format(sel.values[k])}</b></span> : null)}
            {series.length > 1 && <span>Total<b>{format(total(sel))}</b></span>}
          </div>
        )}
      </div>
      <div className="gd-axis" aria-hidden>
        {rows.map((r, i) => <span key={`${r.label}-${i}`}>{i % every === 0 || i === rows.length - 1 ? r.label : ""}</span>)}
      </div>
    </figure>
  );
}

function curve(pts: Array<[number, number]>) {
  return pts.reduce((path, [x, y], i) => {
    if (i === 0) return `M ${x} ${y}`;
    const [px, py] = pts[i - 1];
    const mid = (x + px) / 2;
    return `${path} C ${mid} ${py}, ${mid} ${y}, ${x} ${y}`;
  }, "");
}

/** Lines over time on one shared scale. The first series gets a soft fill. */
export function LineChart({ title, labels, series, format, axisFormat = format }: {
  title: string;
  labels: string[];
  series: Array<{ label: string; tone: Tone; values: number[] }>;
  format: (n: number) => string;
  axisFormat?: (n: number) => string;
}) {
  const fill = `gd-fill-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { active, setActive, onKey } = useActive(labels.length);
  const W = 600;
  const H = 200;
  const top = Math.max(1, ...series.flatMap((s) => s.values)) * 1.12;
  const x = (i: number) => (labels.length < 2 ? W / 2 : (i * W) / (labels.length - 1));
  const y = (v: number) => H - (v / top) * H;
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => top * f);
  const every = Math.max(1, Math.ceil(labels.length / 7));
  return (
    <figure className="gd-chart">
      <div className="gd-chart-meta">
        {series.length > 1 ? <Legend items={series} /> : <span />}
        <span className="gd-readout" aria-live="polite">
          {active !== null ? `${labels[active]}: ${series.map((s) => `${s.label} ${format(s.values[active] ?? 0)}`).join(", ")}` : ""}
        </span>
      </div>
      <div className="gd-line">
        <div className="gd-yaxis" aria-hidden>{ticks.map((t, i) => <span key={i}>{axisFormat(t)}</span>)}</div>
        <div
          className="gd-plot"
          tabIndex={0}
          role="group"
          aria-label={`${title}. Use the arrow keys to read each point.`}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const share = (e.clientX - box.left) / Math.max(1, box.width);
            setActive(Math.max(0, Math.min(labels.length - 1, Math.round(share * (labels.length - 1)))));
          }}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id={fill} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={`var(--gd-s${series[0]?.tone ?? 1})`} stopOpacity=".28" />
                <stop offset="1" stopColor={`var(--gd-s${series[0]?.tone ?? 1})`} stopOpacity=".02" />
              </linearGradient>
            </defs>
            {ticks.map((_, i) => <line key={i} className="gd-grid" x1="0" x2={W} y1={(H * i) / 4} y2={(H * i) / 4} />)}
            <g className="gd-reveal">
              {series[0] && labels.length > 1 && (
                <path d={`${curve(series[0].values.map((v, i) => [x(i), y(v)]))} L ${W} ${H} L 0 ${H} Z`} fill={`url(#${fill})`} />
              )}
              {series.map((s) => (
                <path key={s.label} className="gd-path" style={tone(s.tone)} d={curve(s.values.map((v, i) => [x(i), y(v)]))} />
              ))}
            </g>
            {active !== null && <line className="gd-cursor" x1={x(active)} x2={x(active)} y1="0" y2={H} />}
          </svg>
          {active !== null && series.map((s) => (
            <i key={s.label} className="gd-dot" style={{ ...tone(s.tone), left: `${(x(active) / W) * 100}%`, top: `${(y(s.values[active] ?? 0) / H) * 100}%` }} />
          ))}
          {active !== null && (
            <div className="gd-tip" style={{ "--x": `${(x(active) / W) * 100}%` } as CSSProperties} aria-hidden>
              <strong>{labels[active]}</strong>
              {series.map((s) => <span key={s.label} style={tone(s.tone)}><i />{s.label}<b>{format(s.values[active] ?? 0)}</b></span>)}
            </div>
          )}
        </div>
      </div>
      <div className="gd-axis gd-axis-line" aria-hidden>
        {labels.map((l, i) => <span key={`${l}-${i}`}>{i % every === 0 || i === labels.length - 1 ? l : ""}</span>)}
      </div>
    </figure>
  );
}

/** A ring of shares with a list beside it; picking a row highlights its slice. */
export function MixRing({ items, format, totalLabel }: {
  items: Array<{ label: string; value: number; tone: Tone }>;
  format: (n: number) => string;
  totalLabel: string;
}) {
  const mask = `gd-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [pick, setPick] = useState<number | null>(null);
  const total = items.reduce((a, b) => a + b.value, 0);
  const shares = items.map((it) => (total > 0 ? (it.value / total) * 100 : 0));
  const starts = shares.map((_, k) => shares.slice(0, k).reduce((a, b) => a + b, 0));
  return (
    <div className="gd-mix">
      <div className="gd-ring">
        <svg viewBox="0 0 124 124" aria-hidden>
          <defs>
            <mask id={mask}><circle className="gd-ring-draw" cx="62" cy="62" r="47" fill="none" stroke="white" strokeWidth="16" pathLength="100" strokeDasharray="100 0" transform="rotate(-90 62 62)" /></mask>
          </defs>
          <circle cx="62" cy="62" r="47" fill="none" className="gd-ring-track" strokeWidth="14" />
          <g mask={`url(#${mask})`} transform="rotate(-90 62 62)">
            {shares.map((s, k) => (
              <circle key={items[k].label} cx="62" cy="62" r="47" pathLength="100" fill="none" strokeWidth="14"
                className="gd-ring-seg" style={tone(items[k].tone)} data-muted={pick !== null && pick !== k ? true : undefined}
                strokeDasharray={`${Math.max(0, s - (s > 1.5 ? 1 : 0))} 100`} strokeDashoffset={-starts[k]} />
            ))}
          </g>
        </svg>
        <div className="gd-ring-total">
          <strong>{format(pick === null ? total : items[pick].value)}</strong>
          <span>{pick === null ? totalLabel : items[pick].label}</span>
        </div>
      </div>
      <div className="gd-mix-list">
        {items.map((it, k) => (
          <button key={it.label} type="button" aria-pressed={pick === k} onClick={() => setPick(pick === k ? null : k)} style={tone(it.tone)}>
            <span><i aria-hidden />{it.label}</span>
            <span className="gd-mix-bar" aria-hidden><i style={{ width: `${shares[k]}%` }} /></span>
            <strong>{Math.round(shares[k])}%</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Tables and boards

export type BadgeState = "good" | "wait" | "alert" | "plain";

export function Badge({ state, children }: { state: BadgeState; children: ReactNode }) {
  return <span className="gd-badge" data-state={state}><i aria-hidden />{children}</span>;
}

/** A searchable, filterable table. The filter options come from the rows themselves. */
export function ActivityTable<R>({
  rows, columns, rowKey, search, filterBy, filterLabel = "Status", empty = "Nothing here yet.", searchLabel = "Search",
}: {
  rows: R[];
  columns: Array<{ label: string; cell: (r: R) => ReactNode; className?: string }>;
  rowKey: (r: R) => string;
  search: (r: R) => string;
  filterBy?: (r: R) => string;
  filterLabel?: string;
  empty?: string;
  searchLabel?: string;
}) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState("");
  const options = filterBy ? Array.from(new Set(rows.map(filterBy))).sort() : [];
  const terms = q.toLowerCase().trim();
  const shown = rows.filter((r) => (!terms || search(r).toLowerCase().includes(terms)) && (!only || filterBy?.(r) === only));
  return (
    <>
      <div className="gd-tools">
        <label className="gd-search"><Search size={15} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchLabel} aria-label={searchLabel} /></label>
        {filterBy && (
          <label className="gd-filter"><Filter size={15} />
            <select value={only} onChange={(e) => setOnly(e.target.value)} aria-label={`Filter by ${filterLabel.toLowerCase()}`}>
              <option value="">Every {filterLabel.toLowerCase()}</option>
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="gd-table">
        <table>
          <thead><tr>{columns.map((c) => <th key={c.label} scope="col" className={c.className}>{c.label}</th>)}</tr></thead>
          <tbody>{shown.map((r) => <tr key={rowKey(r)}>{columns.map((c) => <td key={c.label} className={c.className}>{c.cell(r)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {shown.length === 0 && <p className="gd-empty" role="status">{rows.length ? "Nothing matches." : empty}</p>}
    </>
  );
}

export type LaneItem = { id: string; title: string; detail?: ReactNode; meta?: ReactNode; href?: string };
export type Lane = { id: string; title: string; icon: ReactNode; tone: Tone; items: LaneItem[]; empty?: string };

/** Columns of work, like a kanban board: what's waiting, what's moving, what's done. */
export function Lanes({ lanes }: { lanes: Lane[] }) {
  const [only, setOnly] = useState("");
  const shown = only ? lanes.filter((l) => l.id === only) : lanes;
  return (
    <>
      <div className="gd-tools">
        <label className="gd-filter"><Filter size={15} />
          <select value={only} onChange={(e) => setOnly(e.target.value)} aria-label="Show lane">
            <option value="">All lanes</option>
            {lanes.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </label>
      </div>
      <div className="gd-lanes" data-one={only ? true : undefined} style={{ "--lanes": shown.length } as CSSProperties}>
        {shown.map((l) => (
          <section key={l.id} className="gd-lane" aria-label={l.title} style={tone(l.tone)}>
            <header><i aria-hidden>{l.icon}</i><h3>{l.title}</h3><span>{l.items.length}</span></header>
            {l.items.map((it) => {
              const inner = (
                <>
                  <strong>{it.title}</strong>
                  {it.detail && <span className="gd-work-detail">{it.detail}</span>}
                  {it.meta && <span className="gd-work-meta">{it.meta}</span>}
                </>
              );
              return it.href
                ? <Link key={it.id} href={it.href} className="gd-work">{inner}</Link>
                : <div key={it.id} className="gd-work">{inner}</div>;
            })}
            {l.items.length === 0 && <p className="gd-empty">{l.empty ?? "Clear."}</p>}
          </section>
        ))}
      </div>
    </>
  );
}
