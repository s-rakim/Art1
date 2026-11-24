"use client";
import type { ReactNode } from "react";
import { AlertCircle } from "./icons";

export function PageTitle({ kicker, title, action }: { kicker?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        {kicker && <p className="label">{kicker}</p>}
        <h1 className="heading text-[22px]">{title}</h1>
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "signal" | "market" }) {
  return (
    <div className="card p-4">
      <p className="label">{label}</p>
      <p className={`price mt-0.5 text-[24px] leading-tight ${tone === "signal" ? "text-text-error" : tone === "market" ? "text-text-success" : ""}`}>{value}</p>
      {note && <p className="mt-0.5 text-[13px] text-maxcontrast">{note}</p>}
    </div>
  );
}

/** Plain bar chart, no library. Values in whatever unit; format controls the tooltip/label. */
export function Bars({ data, format, stacked }: { data: Array<{ label: string; values: number[] }>; format: (n: number) => string; stacked?: string[] }) {
  const colors = ["var(--color-primary-element)", "var(--color-element-success)", "var(--color-element-warning)", "var(--color-element-error)", "var(--color-border-maxcontrast)"];
  const max = Math.max(1, ...data.map((d) => d.values.reduce((a, b) => a + b, 0)));
  return (
    <div>
      <div className="flex h-48 items-end gap-[3px] border-b border-border-dark" role="img" aria-label="Bar chart">
        {data.map((d) => {
          const total = d.values.reduce((a, b) => a + b, 0);
          return (
            <div key={d.label} className="group relative flex h-full flex-1 flex-col-reverse" title={`${d.label}: ${format(total)}`}>
              {d.values.map((v, i) => (
                <div key={i} style={{ height: `${(v / max) * 100}%`, background: colors[i % colors.length] }} className="w-full opacity-85 first:rounded-b-none last:rounded-t-[3px] group-hover:opacity-100" />
              ))}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[12px] text-maxcontrast">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
      {stacked && (
        <ul className="mt-3 flex flex-wrap gap-4 text-[12px]">
          {stacked.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[i % colors.length] }} />{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-[15px] max-md:[&_td]:whitespace-nowrap">
        <thead>
          <tr>{head.map((h, i) => <th key={`${i}-${h}`} className="label h-[44px] border-b border-border px-3 font-normal">{h}</th>)}</tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-border [&>tr:hover]:bg-background-hover">{children}</tbody>
      </table>
    </div>
  );
}

export function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <p role="alert" className="note note-error mb-4 text-[14px]"><AlertCircle size={18} /><span>{error}</span></p>;
}
