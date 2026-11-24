"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Category } from "@/lib/types";
import { Search } from "./icons";

export function SearchBox({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [scope, setScope] = useState(params.get("category") ?? "");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const wrap = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      api.suggest(term).then((s) => setSuggestions(s.slice(0, 7))).catch(() => setSuggestions([]));
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function go(term: string) {
    const sp = new URLSearchParams();
    if (term.trim()) sp.set("q", term.trim().slice(0, 120));
    if (scope) sp.set("category", scope);
    setOpen(false);
    router.push(`/search?${sp.toString()}`);
  }

  const roots = categories.filter((c) => !c.parent_id);

  return (
    <form
      ref={wrap}
      role="search"
      className="relative flex h-11 w-full items-stretch border border-ink bg-card"
      onSubmit={(e) => {
        e.preventDefault();
        go(active >= 0 ? suggestions[active] : q);
      }}
    >
      <label className="sr-only" htmlFor="search-scope">Search in</label>
      <select
        id="search-scope"
        value={scope}
        onChange={(e) => setScope(e.target.value)}
        className="hidden w-44 border-r border-rule bg-paper-2 pr-7 pl-3 text-[13px] font-medium md:block"
      >
        <option value="">All departments</option>
        {roots.map((c) => (
          <option key={c.id} value={c.slug}>{c.name}</option>
        ))}
      </select>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !suggestions.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % suggestions.length); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1)); }
          if (e.key === "Escape") setOpen(false);
        }}
        maxLength={120}
        type="search"
        name="q"
        placeholder="Search products, stores, wholesale lots"
        aria-label="Search"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        className="min-w-0 flex-1 bg-transparent px-3 text-[14px] outline-none placeholder:text-ink-3"
      />
      <button type="submit" className="flex w-12 items-center justify-center bg-ink text-paper hover:bg-signal" aria-label="Search">
        <Search size={18} />
      </button>
      {open && suggestions.length > 0 && (
        <ul id={listId} role="listbox" className="absolute top-full right-0 left-0 z-50 mt-px border border-ink bg-card shadow-[4px_4px_0_0_#16130f]">
          {suggestions.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); setQ(s); go(s); }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-[14px] ${i === active ? "bg-paper-2" : ""}`}
            >
              <Search size={14} className="text-ink-3" />
              {s}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
