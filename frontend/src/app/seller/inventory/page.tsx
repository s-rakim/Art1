"use client";
import { useState } from "react";
import { ErrorLine, PageTitle, Table } from "@/components/dash";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";

export default function Inventory() {
  const { data, setData, error, token } = useApi((t) => api.sellerInventory(t));
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
      <PageTitle kicker={`${data?.items.length ?? 0} variants · ${totalUnits.toLocaleString("en-US")} units on hand`} title="Inventory" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className="field !h-9 max-w-xs" placeholder="Search title or SKU" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search inventory" />
        <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" className="accent-signal" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />Low stock only</label>
      </div>
      <ErrorLine error={error ?? msg} />
      <Table head={["Product", "Variant", "SKU", "Price", "Held in carts", "Sold, 30 days", "In stock", ""]}>
        {rows.map((r) => {
          const editing = draft[r.variant_id] !== undefined;
          return (
            <tr key={r.variant_id} className={r.stock === 0 ? "bg-signal/5" : ""}>
              <td className="px-3 py-2.5">{r.product_title}</td>
              <td className="px-3 py-2.5 text-ink-2">{r.label}</td>
              <td className="px-3 py-2.5 font-mono text-[12px]">{r.sku}</td>
              <td className="price px-3 py-2.5">{money(r.price_cents)}</td>
              <td className="px-3 py-2.5 font-mono text-[13px] text-ink-3">{r.reserved ?? 0}</td>
              <td className="px-3 py-2.5 font-mono text-[13px]">{r.sold_30d ?? 0}</td>
              <td className="px-3 py-2.5">
                <input
                  aria-label={`Stock for ${r.product_title} ${r.label}`}
                  inputMode="numeric"
                  className={`price h-8 w-20 border bg-paper px-2 text-[13px] ${r.low_stock ? "border-signal" : "border-rule"}`}
                  value={draft[r.variant_id] ?? String(r.stock)}
                  onChange={(e) => setDraft((d) => ({ ...d, [r.variant_id]: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                  onKeyDown={(e) => e.key === "Enter" && save(r.variant_id)}
                />
                {r.low_stock && <span className="ml-2 font-mono text-[10px] text-signal">LOW</span>}
              </td>
              <td className="px-3 py-2.5 text-right">
                {editing && <button disabled={saving === r.variant_id} onClick={() => save(r.variant_id)} className="btn btn-ink btn-sm">Save</button>}
              </td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
