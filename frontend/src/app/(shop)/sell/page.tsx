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
    <div className="px-4 py-5 md:px-6">
      <section className="grid gap-6 rounded-container bg-primary-element-light p-6 text-primary-element-light-text md:grid-cols-[1.3fr_1fr] md:items-center md:p-8">
        <div>
          <p className="label !text-primary-element-light-text opacity-80">For brands, makers and wholesalers</p>
          <h1 className="heading mt-1 text-[26px] leading-tight">Rent a stall and keep your customers</h1>
          <p className="mt-3 max-w-xl text-[15px]">
            {STORE_NAME} rents out store space the way a covered market does. You pay a flat monthly rent for your stall, a
            commission on what sells, and nothing else unless you want extra visibility.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row md:flex-col md:items-stretch">
          <Link href="/signup?as=vendor" className="btn btn-primary btn-lg">Apply for a stall</Link>
          <a href="#plans" className="btn btn-secondary btn-lg">Compare plans</a>
          <p className="text-center text-[13px]">Already selling here? <Link href="/login?as=vendor" className="link-u">Log in</Link></p>
        </div>
      </section>

      <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Apply", "Tell us what you sell. Most stalls are approved in two working days."],
          ["Stock your stall", "List products, set sizes and colours, add bulk pricing if you wholesale."],
          ["Confirm and dispatch", "Confirm payment, pack the order, and hand it to a market rider or your own courier."],
          ["Get paid", "Payouts land weekly, twice weekly or daily depending on your plan."],
        ].map(([t, b], i) => (
          <li key={t} className="card flex gap-3 p-4">
            <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-primary-element text-[13px] font-semibold text-primary-element-text tabular-nums">{i + 1}</span>
            <div>
              <p className="font-semibold">{t}</p>
              <p className="mt-0.5 text-[14px] text-maxcontrast">{b}</p>
            </div>
          </li>
        ))}
      </ol>

      <section id="plans" className="mt-10 scroll-mt-[60px]">
        <h2 className="heading mb-4 text-[20px]">Stall plans</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className={`flex flex-col rounded-container border-2 p-5 ${p.highlighted ? "border-primary-element" : "border-border"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="heading text-[20px]">{p.name}</p>
                {p.highlighted && <span className="chip chip-info">Most popular</span>}
              </div>
              <p className="mt-3"><span className="price text-[32px]">{money(p.monthly_price_cents)}</span><span className="text-maxcontrast"> / month</span></p>
              <p className="mt-0.5 text-[13px] text-maxcontrast tabular-nums">+ {(p.commission_rate * 100).toFixed(0)}% commission on sales</p>
              <ul className="mt-5 flex-1 space-y-2 text-[14px]">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2"><Check size={18} className="shrink-0 text-text-success" />{f}</li>
                ))}
              </ul>
              <Link href={`/signup?as=vendor&plan=${p.id}`} className={`btn btn-lg mt-6 ${p.highlighted ? "btn-primary" : "btn-secondary"}`}>Start with {p.name}</Link>
            </div>
          ))}
        </div>
      </section>

      <section id="placements" className="mt-10 scroll-mt-[60px]">
        <h2 className="heading text-[20px]">Rent extra space</h2>
        <p className="mt-1 max-w-2xl text-maxcontrast">On top of your stall you can rent prime spots around the market by the day, for up to 60 days at a time. Each spot only fits so many shops, so popular dates fill up.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {placements.map((pl) => {
            const left = pl.booked != null ? pl.capacity - pl.booked : null;
            return (
              <div key={pl.id} className="card flex flex-col p-4">
                <p className="label">{pl.location}</p>
                <p className="mt-0.5 font-semibold">{pl.name}</p>
                <p className="mt-1 flex-1 text-[14px] text-maxcontrast">{pl.description}</p>
                <p className="mt-3"><span className="price text-[20px]">{money(pl.daily_price_cents)}</span><span className="text-maxcontrast"> / day</span></p>
                {left !== null && pl.booked != null && (
                  <>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-background-dark"><div className="h-full rounded-pill bg-primary-element" style={{ width: `${Math.min(100, (pl.booked / Math.max(1, pl.capacity)) * 100)}%` }} /></div>
                    <p className={`mt-1 text-[12px] tabular-nums ${left <= 4 ? "text-text-error" : "text-maxcontrast"}`}>{left} of {pl.capacity} spots free today</p>
                  </>
                )}
                {left === null && <p className="mt-1 text-[12px] text-maxcontrast tabular-nums">{pl.capacity} spots a day</p>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
