"use client";

// Contact card, adapted from chatcn's ContactCard on 21st.dev (aadixc0de/contact-card).
// Kept: the who/details/actions layout, copy buttons that confirm with a check and announce it,
// email addresses that truncate in the middle so the domain stays readable, and full-size touch
// targets. Changed: chatcn's own colour variables are mapped onto the Nextcloud tokens the rest
// of The Bazaar uses, its icons are swapped for our MDI set, and the opening hours, time zone and
// rating parts are left out because the market contact doesn't need them.

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Check, Copy, Email, Message, Phone } from "@/components/icons";

export type ContactCardProps = {
  name: string;
  /** "Market team", "Stall rentals". */
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  /** WhatsApp number. Opens a chat at wa.me. */
  whatsapp?: string | null;
  /** A line from the admin: hours, what to have ready. */
  note?: string | null;
  className?: string;
  /** Shown when there's no way to reach anyone. */
  empty?: ReactNode;
};

const digits = (v: string) => v.replace(/[^\d+]/g, "");
const waLink = (v: string) => `https://wa.me/${v.replace(/\D/g, "")}`;

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "")).toUpperCase() || "M";
}

/** Copies a value, swaps to a check for 1.5 s and tells screen readers. */
function CopyButton({ value, label }: { value: string; label: string }) {
  // Counts copies, so a second click inside the 1.5 s starts the timer again.
  const [copies, setCopies] = useState(0);
  const [settled, setSettled] = useState(0);
  const copied = copies > settled;
  useEffect(() => {
    if (!copies) return;
    const id = window.setTimeout(() => setSettled(copies), 1500);
    return () => window.clearTimeout(id);
  }, [copies]);
  const layer = "absolute transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-opacity";
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      onClick={() => navigator.clipboard?.writeText(value).then(() => setCopies((n) => n + 1)).catch(() => {})}
      className={cn(
        "relative grid size-8 shrink-0 place-items-center rounded-element text-maxcontrast hover:bg-background-hover hover:text-main-text",
        "opacity-0 group-hover/field:opacity-100 group-focus-within/field:opacity-100 focus-visible:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-100",
      )}
    >
      <Copy size={16} className={cn(layer, copied ? "scale-75 opacity-0" : "scale-100 opacity-100")} />
      <Check size={16} className={cn(layer, "text-text-success", copied ? "scale-100 opacity-100" : "scale-75 opacity-0")} />
      <span aria-live="polite" className="sr-only">{copied ? "Copied" : ""}</span>
    </button>
  );
}

function Field({ icon, label, copy, children }: { icon: ReactNode; label: string; copy?: string; children: ReactNode }) {
  return (
    <div className="group/field flex min-h-10 items-center gap-3">
      <span aria-hidden className="shrink-0 text-maxcontrast">{icon}</span>
      <span className="sr-only">{label}: </span>
      <div className="flex min-w-0 flex-1 items-center text-[14px]">{children}</div>
      {copy ? <CopyButton value={copy} label={`Copy ${label.toLowerCase()}`} /> : null}
    </div>
  );
}

const linkClass = "min-w-0 truncate rounded-[4px] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary-element";

export function ContactCard({ name, role, email, phone, whatsapp, note, className, empty }: ContactCardProps) {
  const reachable = Boolean(email || phone || whatsapp);
  return (
    <div data-slot="contact-card" className={cn("flex flex-col overflow-hidden rounded-container border border-border-dark bg-main-background", className)}>
      <div className="flex items-center gap-3 p-4">
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-element bg-primary-element-light text-[16px] font-semibold text-primary-element-light-text">
          {initials(name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="line-clamp-2 text-[17px] font-semibold text-pretty">{name}</h3>
          {role ? <p className="truncate text-[14px] text-maxcontrast">{role}</p> : null}
        </div>
      </div>

      {reachable ? (
        <div className="flex flex-col px-4 pb-2">
          {email ? (
            <Field icon={<Email size={18} />} label="Email" copy={email}>
              {/* Long addresses give way in the middle: the start of the name and the whole domain stay. */}
              <a href={`mailto:${email}`} title={email} className={cn(linkClass, "inline-flex max-w-full")}>
                {email.includes("@") ? (
                  <>
                    <span className="min-w-0 truncate">{email.slice(0, email.lastIndexOf("@"))}</span>
                    <span className="shrink-0">{email.slice(email.lastIndexOf("@"))}</span>
                  </>
                ) : (
                  <span className="min-w-0 truncate">{email}</span>
                )}
              </a>
            </Field>
          ) : null}
          {phone ? (
            <Field icon={<Phone size={18} />} label="Phone" copy={phone}>
              <a href={`tel:${digits(phone)}`} className={cn(linkClass, "tabular-nums")}>{phone}</a>
            </Field>
          ) : null}
          {whatsapp ? (
            <Field icon={<Message size={18} />} label="WhatsApp" copy={whatsapp}>
              <a href={waLink(whatsapp)} target="_blank" rel="noopener noreferrer" className={cn(linkClass, "tabular-nums")}>
                {whatsapp} <span className="text-maxcontrast">on WhatsApp</span>
              </a>
            </Field>
          ) : null}
          {note ? <p className="mt-1 border-t border-border pt-3 pb-1 text-[14px] text-maxcontrast text-pretty whitespace-pre-line">{note}</p> : null}
        </div>
      ) : (
        <p className="px-4 pb-4 text-[14px] text-maxcontrast text-pretty">{empty ?? "Contact details will appear here once the market team adds them."}</p>
      )}

      {reachable ? (
        <div className="flex flex-wrap gap-2 border-t border-border p-3">
          {email ? (
            <a href={`mailto:${email}`} className="btn btn-primary flex-1"><Email size={18} /> Email</a>
          ) : null}
          {phone ? (
            <a href={`tel:${digits(phone)}`} className="btn btn-secondary flex-1"><Phone size={18} /> Call</a>
          ) : null}
          {whatsapp ? (
            <a href={waLink(whatsapp)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary flex-1"><Message size={18} /> WhatsApp</a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default ContactCard;
