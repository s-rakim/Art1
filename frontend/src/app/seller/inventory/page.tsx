"use client";
import Link from "next/link";
import { useState } from "react";
import { ErrorLine, PageTitle, Table } from "@/components/dash";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { LiveDot } from "@/components/live-refresh";
import { useLiveEvents, useLiveReload } from "@/lib/live";

export default function Inventory() {
  const { data, setData, error, token, reload } = useApi((t) => api.sellerInventory(t));
  // Stock moves when orders come in; take the server's number unless the vendor is mid-edit.
  const live = useLiveEvents(["stock"], (e) => {
    if (e.type !== "stock") return;
    setData((d) => (d ? { ...d, items: d.items.map((r) => (r.variant_id === e.variant_id ? { ...r, stock: e.stock, low_stock: e.stock < 5 } : r)) } : d));
  });
  useLiveReload(["catalog"], reload, live ? 0 : 30000);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);

  async function save(id: string) {
    const n = parseInt(draft[id] ?? "", 10);
    if (!Number.isFinite(n) || n < 0 || n > 100000) return setMsg("Stock must be a whole number between 0 and 100,000.");
    setSaving(id);
    setMsg(null);
    try {
      const stock = await api.setStock(token, id, n);
      setData((d) => (d ? { ...d, items: d.items.map((r) => (r.variant_id === id ? { ...r, stock, low_stock: stock < 5 } : r)) } : d));
      setDraft(({ [id]: _, ...rest }) => rest);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Couldn't save that stock level.");
    } finally {
      setSaving(null);
    }
  }

  const rows = (data?.items ?? []).filter((r) => (!lowOnly || r.low_stock) && `${r.product_title} ${r.sku} ${r.label}`.toLowerCase().includes(q.toLowerCase()));
  const totalUnits = (data?.items ?? []).reduce((a, r) => a + r.stock, 0);

  return (
    <>
      <PageTitle kicker={`${data?.items.length ?? 0} variants · ${totalUnits.toLocaleString("en-US")} units on hand`} title="Inventory" action={<LiveDot live={live} />} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className="field max-w-xs" placeholder="Search title or SKU" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search inventory" />
        <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" className="accent-primary-element" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />Low stock only</label>
      </div>
      <ErrorLine error={error ?? msg} />
      <Table head={["Product", "Variant", "SKU", "Price", "Held in carts", "Sold, 30 days", "In stock", ""]}>
        {rows.map((r) => {
          const editing = draft[r.variant_id] !== undefined;
          return (
            <tr key={r.variant_id} className={r.stock === 0 ? "bg-error" : ""}>
              <td className="px-3 py-2.5"><Link href={`/seller/products/${encodeURIComponent(r.product_id)}`} className="hover:underline">{r.product_title}</Link></td>
              <td className="px-3 py-2.5 text-maxcontrast">{r.label}</td>
              <td className="px-3 py-2.5 tabular-nums text-[12px]">{r.sku}</td>
              <td className="price px-3 py-2.5">{money(r.price_cents)}</td>
              <td className="px-3 py-2.5 tabular-nums text-[13px] text-maxcontrast">{r.reserved ?? 0}</td>
              <td className="px-3 py-2.5 tabular-nums text-[13px]">{r.sold_30d ?? 0}</td>
              <td className="px-3 py-2.5">
                <input
                  aria-label={`Stock for ${r.product_title} ${r.label}`}
                  inputMode="numeric"
                  className={`rounded-element price h-8 w-20 border bg-main-background px-2 text-[13px] ${r.low_stock ? "border-element-error" : "border-border"}`}
                  value={draft[r.variant_id] ?? String(r.stock)}
                  onChange={(e) => setDraft((d) => ({ ...d, [r.variant_id]: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                  onKeyDown={(e) => e.key === "Enter" && save(r.variant_id)}
                />
                {r.low_stock && <span className="ml-2 tabular-nums text-[12px] text-text-error">Low stock</span>}
              </td>
              <td className="px-3 py-2.5 text-right">
                {editing && <button disabled={saving === r.variant_id} onClick={() => save(r.variant_id)} className="btn btn-primary btn-sm">Save</button>}
              </td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
