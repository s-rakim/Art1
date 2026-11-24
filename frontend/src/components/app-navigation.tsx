"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { create } from "zustand";

export type NavItem = { href: string; label: string; icon?: ReactNode; count?: number; exact?: boolean };
export type NavSection = { caption?: string; items: NavItem[] };

// One drawer flag shared by the header toggle and the navigation column.
export const useNavDrawer = create<{ open: boolean; set: (open: boolean) => void }>()((set) => ({
  open: false,
  set: (open) => set({ open }),
}));

function isActive(path: string, item: NavItem) {
  if (item.href.includes("?")) return false;
  if (item.exact) return path === item.href;
  return path === item.href || path.startsWith(`${item.href}/`);
}

/**
 * Nextcloud's app navigation: a 300px column on the left of the body container.
 * Under 1024px it turns into a drawer that the header's menu button opens.
 */
export function AppNavigation({ sections, footer, label }: { sections: NavSection[]; footer?: NavSection; label: string }) {
  const path = usePathname();
  const open = useNavDrawer((s) => s.open);
  const setOpen = useNavDrawer((s) => s.set);

  useEffect(() => setOpen(false), [path, setOpen]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const list = (s: NavSection, i: number) => (
    <div key={i}>
      {s.caption && <p className="nav-caption">{s.caption}</p>}
      <ul className="flex flex-col gap-1">
        {s.items.map((item) => {
          const on = isActive(path, item);
          return (
            <li key={item.href + item.label}>
              <Link href={item.href} aria-current={on ? "page" : undefined} className="nav-entry">
                {item.icon ?? <span className="w-[34px] shrink-0" aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.count ? <span className={`counter ${on ? "counter-highlighted" : ""}`}>{item.count > 99 ? "99+" : item.count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <>
      {open && <div className="fixed inset-0 top-[44px] z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <nav
        aria-label={label}
        className={`${open ? "flex animate-slide-left" : "hidden"} fixed top-[44px] bottom-2 left-2 z-40 w-[300px] max-w-[calc(100vw-60px)] flex-col overflow-hidden rounded-l-large border-r border-border bg-main-background shadow-modal lg:sticky lg:top-[44px] lg:bottom-auto lg:left-auto lg:z-0 lg:flex lg:h-[calc(100dvh-52px)] lg:max-w-none lg:shrink-0 lg:animate-none lg:shadow-none`}
      >
        <div className="flex-1 overflow-y-auto p-1">{sections.map(list)}</div>
        {footer && <div className="border-t border-border p-1">{list(footer, -1)}</div>}
      </nav>
    </>
  );
}

export function NavToggle() {
  const open = useNavDrawer((s) => s.open);
  const setOpen = useNavDrawer((s) => s.set);
  return (
    <button
      type="button"
      className="btn btn-plain btn-icon lg:hidden"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-label={open ? "Close navigation" : "Open navigation"}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        {open ? (
          <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
        ) : (
          <path d="M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z" />
        )}
      </svg>
    </button>
  );
}
