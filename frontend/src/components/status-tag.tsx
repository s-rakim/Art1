// Order, store-order, delivery, rider and stall statuses all come through here as plain
// strings from the API. Anything unknown falls back to a plain tag.
const style: Record<string, string> = {
  pending_payment: "chip-warning",
  pending: "chip-warning",
  awaiting_rider: "chip-warning",
  assigned: "chip-warning",
  applicant: "chip-warning",
  unpaid: "chip-warning",
  paid: "chip-info",
  processing: "chip-info",
  accepted: "chip-info",
  partially_fulfilled: "chip-info",
  picked_up: "chip-success",
  shipped: "chip-success",
  delivered: "chip-success",
  fulfilled: "chip-success",
  active: "chip-success",
  scheduled: "chip-info",
  live: "chip-success",
  failed: "chip-error",
  suspended: "chip-error",
  rejected: "chip-error",
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
  const text = label[s] ?? s.replace(/_/g, " ");
  return <span className={`chip ${style[s] ?? ""}`}>{text.charAt(0).toUpperCase() + text.slice(1)}</span>;
}
