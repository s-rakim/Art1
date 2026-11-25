"use client";
import Link from "next/link";
import { useState } from "react";
import { ErrorLine, PageTitle, Table } from "@/components/dash";
import { ProductImage } from "@/components/product-art";
import { StatusTag } from "@/components/status-tag";
import { api, ApiError } from "@/lib/api";
import { compact, money } from "@/lib/format";
import { useApi } from "@/lib/use-api";

export default function SellerProducts() {
  const { data, setData, error, token } = useApi((t) => api.sellerProducts(t));
  const me = useApi((t) => api.sellerMe(t));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function setStatus(id: string, status: "active" | "draft" | "archived") {
    setBusy(id);
    setMsg(null);
    try {
      await api.updateProduct(token, id, { status });
      setData((d) => (d ? { ...d, items: d.items.map((p) => (p.id === id ? { ...p, status } : p)) } : d));
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Couldn't change that listing.");
    } finally {
      setBusy(null);
    }
  }

  const limit = me.data?.product_limit;
  const live = me.data?.active_products ?? data?.items.filter((p) => p.status === "active").length ?? 0;

  return (
    <>
      <PageTitle
        title="Products"
        kicker={`${data?.total ?? 0} listings · ${live} live${limit ? ` of ${limit} on your plan` : ""}`}
        action={<Link href="/seller/products/new" className="btn btn-primary btn-sm">New product</Link>}
      />
      <ErrorLine error={error ?? msg} />
      <Table head={["", "Title", "Status", "From", "Stock", "Sold", ""]}>
        {(data?.items ?? []).map((p) => (
          <tr key={p.id}>
            <td className="w-14 px-3 py-2"><div className="h-14 w-11 overflow-hidden bg-background-hover"><ProductImage src={p.image_url} art={p.art} alt={p.title} /></div></td>
            <td className="px-3 py-2">{p.title}</td>
            <td className="px-3 py-2"><StatusTag status={p.status} /></td>
            <td className="price px-3 py-2">{p.price_cents !== null ? money(p.price_cents) : "No price"}</td>
            <td className={`px-3 py-2 tabular-nums text-[13px] ${p.stock === 0 ? "text-text-error" : ""}`}>{p.stock}</td>
            <td className="px-3 py-2 tabular-nums text-[13px]">{compact(p.sold_count)}</td>
            <td className="space-x-3 whitespace-nowrap px-3 py-2 text-right text-[13px]">
              {p.status === "active" ? (
                <>
                  <Link href={`/p/${p.slug}`} className="link-u">View</Link>
                  <button disabled={busy === p.id} onClick={() => setStatus(p.id, "draft")} className="link-u">Hide</button>
                </>
              ) : p.status === "draft" ? (
                <>
                  <button disabled={busy === p.id} onClick={() => setStatus(p.id, "active")} className="link-u">Publish</button>
                  <button disabled={busy === p.id} onClick={() => setStatus(p.id, "archived")} className="link-u text-maxcontrast">Archive</button>
                </>
              ) : (
                <button disabled={busy === p.id} onClick={() => setStatus(p.id, "draft")} className="link-u">Restore</button>
              )}
            </td>
          </tr>
        ))}
        {data?.items.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-maxcontrast">No products yet. Add your first one.</td></tr>}
      </Table>
    </>
  );
}
