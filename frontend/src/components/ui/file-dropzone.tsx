"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, Upload } from "@/components/icons";

/**
 * Drop files here or pick them. Checks type and size before anything is sent and says why a
 * file was turned away, next to the box. The input is a real file input behind a label, so it
 * works from the keyboard and with screen readers without extra wiring.
 */
export function FileDropzone({
  accept,
  maxBytes,
  multiple = false,
  disabled = false,
  label,
  hint,
  icon,
  onFiles,
  className,
}: {
  /** Comma separated MIME types, as for <input accept>. */
  accept: string;
  maxBytes: number;
  multiple?: boolean;
  disabled?: boolean;
  label: string;
  hint?: string;
  icon?: ReactNode;
  onFiles: (files: File[]) => void;
  className?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const types = accept.split(",").map((t) => t.trim());
  const mb = Math.round(maxBytes / (1024 * 1024));

  function take(list: FileList | null) {
    if (!list?.length || disabled) return;
    const files = Array.from(list).slice(0, multiple ? 50 : 1);
    const good: File[] = [];
    const bad: string[] = [];
    for (const f of files) {
      if (!types.includes(f.type)) bad.push(`${f.name} isn't a supported file type.`);
      else if (f.size > maxBytes) bad.push(`${f.name} is over ${mb} MB.`);
      else good.push(f);
    }
    setRejected(bad.length ? bad.slice(0, 3).join(" ") + (bad.length > 3 ? ` And ${bad.length - 3} more.` : "") : null);
    if (good.length) onFiles(good);
    if (input.current) input.current.value = "";
  }

  return (
    <div className={className}>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
        className={cn(
          "flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-container border-2 border-dashed px-4 py-5 text-center transition-colors duration-150",
          over ? "border-primary-element bg-primary-element-light" : "border-border-dark bg-main-background hover:bg-background-hover",
          "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary-element",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <span aria-hidden className="text-primary-element">{icon ?? <Upload size={24} />}</span>
        <span className="text-[14px] font-semibold">{label}</span>
        {hint ? <span className="text-[12px] text-maxcontrast text-pretty">{hint}</span> : null}
        <input
          ref={input}
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          className="sr-only"
          aria-describedby={rejected ? `${id}-err` : undefined}
          onChange={(e) => take(e.target.files)}
        />
      </label>
      {rejected ? (
        <p id={`${id}-err`} role="alert" className="mt-2 flex items-start gap-1.5 text-[13px] text-text-error">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {rejected}
        </p>
      ) : null}
    </div>
  );
}

/** A thin progress bar with its percentage for screen readers. */
export function UploadProgress({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-1.5 w-full overflow-hidden rounded-pill bg-background-dark">
      <div className="h-full origin-left rounded-pill bg-primary-element transition-transform duration-150 ease-out" style={{ transform: `scaleX(${pct / 100})` }} />
    </div>
  );
}
