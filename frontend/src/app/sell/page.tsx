import type { Metadata } from "next";
import Link from "next/link";
import { api } from "@/lib/api";
import { STORE_NAME } from "@/lib/config";
import { money } from "@/lib/format";
import { Check } from "@/components/icons";

export const metadata: Metadata = { title: "Rent a stall" };

export default async function SellPage() {
  const [plans, placements] = await Promise.all([api.plans(), api.placementSlots()]);
  return (
    <>
      <section className="border-b border-ink">
        <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-14 md:grid-cols-[1.3fr_1fr] md:items-end">
          <div>
            <p className="label mb-4">For brands, makers and wholesalers</p>
            <h1 className="display text-[64px] sm:text-[96px] lg:text-[128px]">Rent a stall.<br /><span className="text-signal">Keep your customers.</span></h1>
          </div>
          <div className="space-y-5 text-[17px] text-ink-2">
            <p>
              {STORE_NAME} rents out store space the way a covered market does. You pay a flat monthly rent for your stall, a
              commission on what sells, and nothing else unless you want extra visibility.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup?as=vendor" className="btn btn-signal h-12 px-6">Apply for a stall</Link>
              <a href="#plans" className="btn btn-line h-12 px-6">Compare plans</a>
            </div>
            <p className="text-[13px] text-ink-3">Already have a vendor login? <Link href="/login?as=vendor" className="underline">Sign in</Link></p>
          </div>
        </div>
      </section>

      <section className="border-b border-rule bg-card">
        <ol className="mx-auto grid max-w-[1400px] gap-px px-4 sm:grid-cols-4">
          {[
            ["Apply", "Tell us what you sell. Most stalls are approved in two working days."],
            ["Stock your stall", "List products, set sizes and colours, add bulk pricing if you wholesale."],
            ["Confirm and dispatch", "Confirm payment, pack the order, and hand it to a market rider or your own courier."],
            ["Get paid", "Payouts land weekly, twice weekly or daily depending on your plan."],
          ].map(([t, b], i) => (
            <li key={t} className="py-8 pr-6">
              <span className="font-mono text-[13px] text-signal">0{i + 1}</span>
              <p className="display mt-1 text-[28px]">{t}</p>
              <p className="mt-1 text-[14px] text-ink-2">{b}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="plans" className="mx-auto max-w-[1400px] scroll-mt-40 px-4 py-16">
        <h2 className="display mb-8 text-[48px] md:text-[64px]">Stall plans</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className={`flex flex-col border-2 p-6 ${p.highlighted ? "border-ink bg-ink text-paper" : "border-ink bg-card"}`}>
              <div className="flex items-center justify-between">
                <p className="display text-[36px]">{p.name}</p>
                {p.highlighted && <span className="ticket ticket-tag">MOST STALLS</span>}
              </div>
              <p className="mt-4"><span className="price text-[44px]">{money(p.monthly_price_cents)}</span><span className="opacity-70"> / month</span></p>
              <p className="mt-1 font-mono text-[13px] opacity-80">+ {(p.commission_rate * 100).toFixed(0)}% commission on sales</p>
              <ul className="mt-6 flex-1 space-y-2 text-[14px]">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2"><Check size={16} className={`mt-0.5 shrink-0 ${p.highlighted ? "text-tag" : "text-market"}`} />{f}</li>
                ))}
              </ul>
              <Link href={`/signup?as=vendor&plan=${p.id}`} className={`btn mt-8 h-12 ${p.highlighted ? "bg-paper text-ink hover:bg-tag" : "btn-ink"}`}>Start with {p.name}</Link>
            </div>
          ))}
        </div>
      </section>

      <section id="placements" className="scroll-mt-40 border-y border-ink bg-tag/30">
        <div className="mx-auto max-w-[1400px] px-4 py-16">
          <h2 className="display text-[48px] md:text-[64px]">Rent extra space</h2>
          <p className="mt-2 max-w-2xl text-ink-2">On top of your stall you can rent prime spots around the market by the day, for up to 60 days at a time. Each spot only fits so many shops, so popular dates fill up.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {placements.map((pl) => {
              const left = pl.booked != null ? pl.capacity - pl.booked : null;
              return (
                <div key={pl.id} className="flex flex-col border border-ink bg-paper p-5">
                  <p className="label">{pl.location}</p>
                  <p className="display mt-1 text-[28px]">{pl.name}</p>
                  <p className="mt-2 flex-1 text-[14px] text-ink-2">{pl.description}</p>
                  <p className="mt-4"><span className="price text-[22px]">{money(pl.daily_price_cents)}</span><span className="text-ink-3"> / day</span></p>
                  {left !== null && pl.booked != null && (
                    <>
                      <div className="mt-2 h-1.5 bg-paper-2"><div className="h-full bg-ink" style={{ width: `${Math.min(100, (pl.booked / Math.max(1, pl.capacity)) * 100)}%` }} /></div>
                      <p className={`mt-1 font-mono text-[11px] ${left <= 4 ? "text-signal" : "text-ink-3"}`}>{left} of {pl.capacity} spots free today</p>
                    </>
                  )}
                  {left === null && <p className="mt-1 font-mono text-[11px] text-ink-3">{pl.capacity} spots a day</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
