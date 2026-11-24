import type { OrderStatus } from "@/lib/types";

const style: Record<OrderStatus, string> = {
  pending: "ticket-tag",
  paid: "ticket-ink",
  packed: "ticket-ink",
  shipped: "ticket-market",
  delivered: "ticket-market",
  cancelled: "",
  refunded: "",
};

export function StatusTag({ status }: { status: OrderStatus }) {
  return <span className={`ticket ${style[status]}`}>{status.toUpperCase()}</span>;
}
