"use client";
import { useSite } from "./site-context";

/**
 * Where shoppers send money: the market's own till, paybill or bank account, as the admin set
 * them. With a reference (the order number), the paybill row tells them exactly what to type.
 */
export function PayTo({ reference, className = "" }: { reference?: string; className?: string }) {
  const pay = useSite().payment;
  if (!pay) return null;
  const rows = [
    pay.mpesa_till && ["M-Pesa till (Buy Goods)", pay.mpesa_till],
    pay.mpesa_paybill && ["M-Pesa paybill", `${pay.mpesa_paybill}, account: ${reference ?? "your order number"}`],
    pay.bank_account_number && [pay.bank_name ?? "Bank", `${pay.bank_account_number}${pay.bank_account_name ? `, ${pay.bank_account_name}` : ""}`],
    reference && ["Reference", reference],
  ].filter((r): r is string[] => Array.isArray(r));
  return (
    <div className={`rounded-element border border-border-dark p-4 text-[14px] ${className}`}>
      <p className="font-semibold">Where you&apos;ll pay{pay.account_name ? `: ${pay.account_name}` : ""}</p>
      <dl className="mt-2 grid gap-1 sm:grid-cols-[max-content_1fr] sm:gap-x-4">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-maxcontrast">{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {pay.instructions && <p className="mt-2 text-[13px] text-maxcontrast">{pay.instructions}</p>}
    </div>
  );
}
