import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Listing } from "@/components/listing";
import { Breadcrumbs } from "@/components/ui";
import { api } from "@/lib/api";
import { parseQuery, type SP } from "@/lib/query";
import { safeSlug } from "@/lib/safe";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const cat = (await api.categories()).find((c) => c.slug === slug);
  return { title: cat?.name ?? "Category" };
}

export default async function CategoryPage({ params, searchParams }: { params: Params; searchParams: Promise<SP> }) {
  const { slug: raw } = await params;
  const slug = safeSlug(raw);
  const categories = await api.categories();
  const cat = categories.find((c) => c.slug === slug);
  if (!cat) notFound();
  const parent = cat.parent_id ? categories.find((c) => c.id === cat.parent_id) : null;
  const children = categories.filter((c) => c.parent_id === cat.id);
  const sp = await searchParams;
  const query = parseQuery(sp, { category: cat.slug });

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8">
      <Breadcrumbs items={[["Home", "/"], ...(parent ? [[parent.name, `/c/${parent.slug}`] as [string, string]] : []), [cat.name]]} />
      <h1 className="display mb-4 text-[56px] md:text-[80px]">{cat.name}</h1>
      {children.length > 0 && (
        <ul className="mb-8 flex flex-wrap gap-2">
          {children.map((c) => (
            <li key={c.id}>
              <Link href={`/c/${c.slug}`} className="block border border-ink px-3 py-1.5 text-[13px] font-medium hover:bg-ink hover:text-paper">{c.name}</Link>
            </li>
          ))}
        </ul>
      )}
      <Listing basePath={`/c/${cat.slug}`} sp={sp} query={query} categories={categories} lockCategory />
    </div>
  );
}
