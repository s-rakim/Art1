import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui";
import { STORE_NAME } from "@/lib/config";

const topics: Record<string, { title: string; body: string[] }> = {
  returns: {
    title: "Returns",
    body: [
      "You can return most items within 30 days of delivery. Start a return from the order page, pick a reason, and the store sends a prepaid label or a rider pickup.",
      "Refunds go back to the original payment method within five working days of the store receiving the item.",
      "Personalised items, opened beauty products and underwear can't be returned unless they arrived damaged or wrong.",
    ],
  },
  shipping: {
    title: "Shipping and delivery",
    body: [
      "Every store ships its own orders, so a bag with items from three stores arrives in up to three parcels.",
      "Local orders are often delivered by a market rider. You can follow them on a live map from your order page.",
      "Shipping is free from any single store once your items from that store pass $50.",
    ],
  },
  protection: {
    title: "Buyer protection",
    body: [
      `If an order doesn't arrive, or arrives damaged or not as described, ${STORE_NAME} refunds you even if the store doesn't respond.`,
      "Open a dispute from the order page within 30 days of the expected delivery date. Keep messages on the platform so we can see what was agreed.",
    ],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ topic: string }> }): Promise<Metadata> {
  return { title: topics[(await params).topic]?.title ?? "Help" };
}

export default async function HelpPage({ params }: { params: Promise<{ topic: string }> }) {
  const t = topics[(await params).topic];
  if (!t) notFound();
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Breadcrumbs items={[["Home", "/"], ["Help"], [t.title]]} />
      <h1 className="display mb-6 text-[56px] md:text-[72px]">{t.title}</h1>
      <div className="space-y-4 text-[16px] leading-relaxed text-ink-2">{t.body.map((p) => <p key={p}>{p}</p>)}</div>
    </div>
  );
}
