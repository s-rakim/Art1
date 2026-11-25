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
    <div className="px-4 py-5 md:px-6">
      <Breadcrumbs items={[["Home", "/"], ...(parent ? [[parent.name, `/c/${parent.slug}`] as [string, string]] : []), [cat.name]]} />
      <h1 className="heading mb-3 text-[22px]">{cat.name}</h1>
      {children.length > 0 && (
        <ul className="mb-5 flex flex-wrap gap-1.5">
          {children.map((c) => (
            <li key={c.id}>
              <Link href={`/c/${c.slug}`} className="btn btn-sm">{c.name}</Link>
            </li>
          ))}
        </ul>
      )}
      <Listing basePath={`/c/${cat.slug}`} sp={sp} query={query} categories={categories} lockCategory />
    </div>
  );
}
