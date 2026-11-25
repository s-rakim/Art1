import type { Metadata } from "next";
import Link from "next/link";
import { api, EMPTY_SITE } from "@/lib/api";
import { STORE_NAME } from "@/lib/config";
import { Check } from "@/components/icons";
import { ContactCard } from "@/components/ui/contact-card";

export const metadata: Metadata = { title: "Rent a stall" };

// Rent, commission and placement prices are set by the market team and agreed with each
// vendor, so this page never shows an amount. It points people at the team instead.
export default async function SellPage() {
  const [plans, placements, site] = await Promise.all([
    api.plans(),
    api.placementSlots(),
    api.status().catch(() => EMPTY_SITE),
  ]);
  const team = site.contact_name ?? `The ${STORE_NAME.replace(/^The\s+/i, "")} team`;

  return (
    <div className="px-4 py-5 md:px-6">
      <section className="grid gap-6 rounded-container bg-primary-element-light p-6 text-primary-element-light-text md:grid-cols-[1.3fr_1fr] md:items-center md:p-8">
        <div>
          <p className="label !text-primary-element-light-text opacity-80">For brands, makers and wholesalers</p>
          <h1 className="heading mt-1 text-[26px] leading-tight text-balance">Rent a stall and keep your customers</h1>
          <p className="mt-3 max-w-xl text-[15px] text-pretty">
            {STORE_NAME} rents out store space the way a covered market does. Each stall pays a monthly rent and a commission
            on what sells. Both are agreed with the market team, so talk to them before you apply and they&apos;ll tell you
            what your stall would cost.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row md:flex-col md:items-stretch">
          <a href="#contact" className="btn btn-primary btn-lg">Talk to the market team</a>
          <Link href="/signup?as=vendor" className="btn btn-secondary btn-lg">Apply for a stall</Link>
          <p className="text-center text-[13px]">Already selling here? <Link href="/login" className="link-u">Log in</Link></p>
        </div>
      </section>

      <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Talk to us", "Tell the market team what you sell. They'll explain the plans and quote your rent."],
          ["Apply", "Send your application. Most stalls are approved within two working days."],
          ["Stock your stall", "List products with photos and a video, set sizes and colours, add bulk pricing if you wholesale."],
          ["Sell and dispatch", "Confirm payment, pack the order, and the closest market rider picks it up."],
        ].map(([t, b], i) => (
          <li key={t} className="card flex gap-3 p-4">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-element text-[13px] font-semibold text-primary-element-text tabular-nums">{i + 1}</span>
            <div>
              <p className="font-semibold">{t}</p>
              <p className="mt-0.5 text-[14px] text-maxcontrast text-pretty">{b}</p>
            </div>
          </li>
        ))}
      </ol>

      <section id="plans" className="mt-10 scroll-mt-[60px]">
        <h2 className="heading text-[20px]">Stall plans</h2>
        <p className="mt-1 max-w-2xl text-maxcontrast text-pretty">What each stall includes. Prices are on request from the market team.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className={`flex flex-col rounded-container border-2 bg-main-background p-5 ${p.highlighted ? "border-primary-element" : "border-border"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="heading text-[20px]">{p.name}</p>
                {p.highlighted && <span className="chip chip-info">Most popular</span>}
              </div>
              {p.description ? <p className="mt-1 text-[14px] text-maxcontrast text-pretty">{p.description}</p> : null}
              <p className="mt-3 text-[14px] font-semibold text-primary-element">Price on request</p>
              <ul className="mt-4 flex-1 space-y-2 text-[14px]">
                <li className="flex gap-2"><Check size={18} className="shrink-0 text-text-success" />{p.product_limit ? `Up to ${p.product_limit.toLocaleString("en-US")} listings` : "Unlimited listings"}</li>
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2"><Check size={18} className="shrink-0 text-text-success" />{f}</li>
                ))}
              </ul>
              <div className="mt-6 flex flex-col gap-2">
                <a href="#contact" className={`btn btn-lg ${p.highlighted ? "btn-primary" : "btn-secondary"}`}>Ask about {p.name}</a>
                <Link href={`/signup?as=vendor&plan=${encodeURIComponent(p.code)}`} className="btn btn-tertiary">Apply with this plan</Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {placements.length > 0 && (
        <section id="placements" className="mt-10 scroll-mt-[60px]">
          <h2 className="heading text-[20px]">Rent extra space</h2>
          <p className="mt-1 max-w-2xl text-maxcontrast text-pretty">
            On top of your stall you can rent prime spots around the market by the day, for up to 60 days at a time. Each spot
            only fits so many shops, so popular dates fill up. Vendors see the day rate when they book.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {placements.map((pl) => {
              const left = pl.booked != null ? pl.capacity - pl.booked : null;
              return (
                <div key={pl.id} className="card flex flex-col p-4">
                  <p className="label">{pl.location}</p>
                  <p className="mt-0.5 font-semibold">{pl.name}</p>
                  <p className="mt-1 flex-1 text-[14px] text-maxcontrast text-pretty">{pl.description}</p>
                  {left !== null && pl.booked != null ? (
                    <>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-pill bg-background-dark"><div className="h-full rounded-pill bg-primary-element" style={{ width: `${Math.min(100, (pl.booked / Math.max(1, pl.capacity)) * 100)}%` }} /></div>
                      <p className={`mt-1 text-[12px] tabular-nums ${left <= 4 ? "font-semibold text-primary-element" : "text-maxcontrast"}`}>{left} of {pl.capacity} spots free today</p>
                    </>
                  ) : (
                    <p className="mt-3 text-[12px] text-maxcontrast tabular-nums">{pl.capacity} spots a day</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section id="contact" className="mt-10 grid scroll-mt-[60px] gap-6 md:grid-cols-[1fr_minmax(300px,420px)] md:items-start">
        <div>
          <h2 className="heading text-[20px]">Talk to the market team</h2>
          <p className="mt-1 max-w-xl text-maxcontrast text-pretty">
            Rent depends on the plan, how long you stay and what you sell. Reach out and the team will walk you through it,
            answer questions about deliveries and payouts, and help you set up your stall.
          </p>
        </div>
        <ContactCard
          name={team}
          role="Stall rentals and vendor support"
          email={site.contact_email}
          phone={site.contact_phone}
          whatsapp={site.contact_whatsapp}
          note={site.contact_note}
          empty="The market team hasn't added contact details yet. Apply for a stall and they'll get in touch."
        />
      </section>
    </div>
  );
}
