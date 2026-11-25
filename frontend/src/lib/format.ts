import { CURRENCY } from "./config";

const formatters = new Map<string, Intl.NumberFormat>();

export function money(cents: number, currency = CURRENCY) {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { style: "currency", currency });
    formatters.set(currency, f);
  }
  return f.format(cents / 100);
}

/** The market currency's sign on its own ("$", "GH₵", "₦"), for labels on money inputs. */
export function currencySign(currency = CURRENCY) {
  const part = new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((x) => x.type === "currency");
  return part?.value ?? currency;
}

export function compact(n: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function pct(n: number, digits = 0) {
  return `${(n * 100).toFixed(digits)}%`;
}

export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function discount(price: number, compare?: number | null) {
  if (!compare || compare <= price) return 0;
  return Math.round((1 - price / compare) * 100);
}

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
