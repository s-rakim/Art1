// Order, store-order, delivery, rider and stall statuses all come through here as plain
// strings from the API. Anything unknown falls back to a plain tag.
const style: Record<string, string> = {
  pending_payment: "ticket-tag",
  pending: "ticket-tag",
  awaiting_rider: "ticket-tag",
  assigned: "ticket-tag",
  applicant: "ticket-tag",
  unpaid: "ticket-tag",
  paid: "ticket-ink",
  processing: "ticket-ink",
  accepted: "ticket-ink",
  partially_fulfilled: "ticket-ink",
  picked_up: "ticket-market",
  shipped: "ticket-market",
  delivered: "ticket-market",
  fulfilled: "ticket-market",
  active: "ticket-market",
  scheduled: "ticket-ink",
  live: "ticket-market",
  failed: "ticket-signal",
  suspended: "ticket-signal",
  rejected: "ticket-signal",
};

const label: Record<string, string> = {
  pending_payment: "awaiting payment",
  partially_fulfilled: "part shipped",
  picked_up: "picked up",
  awaiting_rider: "needs rider",
  applicant: "applied",
};

export function StatusTag({ status }: { status: string }) {
  const s = String(status ?? "");
  return <span className={`ticket ${style[s] ?? ""}`}>{(label[s] ?? s.replace(/_/g, " ")).toUpperCase()}</span>;
}
