"use client";
import Link from "next/link";
import { ErrorLine, PageTitle, Table } from "@/components/dash";
import { ProductImage } from "@/components/product-art";
import { api } from "@/lib/api";
import { compact, money } from "@/lib/format";
import { useApi } from "@/lib/use-api";

export default function SellerProducts() {
  const { data, error } = useApi((t) => api.sellerProducts(t));
  return (
    <>
      <PageTitle title="Products" kicker={`${data?.total ?? 0} listings`} action={<Link href="/seller/products/new" className="btn btn-signal btn-sm">New product</Link>} />
      <ErrorLine error={error} />
      <Table head={["", "Title", "Price", "Rating", "Sold", ""]}>
        {(data?.items ?? []).map((p) => (
          <tr key={p.id}>
            <td className="w-14 px-3 py-2"><div className="h-14 w-11 overflow-hidden bg-paper-2"><ProductImage src={p.image_url} art={p.art} alt={p.title} /></div></td>
            <td className="px-3 py-2">{p.title}</td>
            <td className="price px-3 py-2">{money(p.price_cents, p.currency)}</td>
            <td className="px-3 py-2 font-mono text-[13px]">★ {p.rating.toFixed(1)}</td>
            <td className="px-3 py-2 font-mono text-[13px]">{compact(p.sold_count)}</td>
            <td className="px-3 py-2 text-right"><Link href={`/p/${p.slug}`} className="link-u text-[13px]">View</Link></td>
          </tr>
        ))}
      </Table>
    </>
  );
}
