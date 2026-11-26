"use client";
import { List, Pencil } from "@/components/icons";
import { EntrySheet, SheetViewer } from "@/components/ledger-sheets";
import { GlassStage, useHashView, type DashView } from "@/components/ui/glass-dashboard";

const VIEWS: DashView<"books" | "mine">[] = [
  { id: "books", label: "Market's books", short: "Books", icon: <List size={18} />, description: "Your sales, payments and stock as the market's books have them. Read only." },
  { id: "mine", label: "Your sheet", short: "Yours", icon: <Pencil size={18} />, description: "Rows you keep yourself. The market confirms each one against its reference." },
];

export default function SellerLedger() {
  const [view, setView] = useHashView(VIEWS.map((v) => v.id), "books");
  return (
    <GlassStage kicker="Your stall" title="Ledger" views={VIEWS} view={view} onView={setView}>
      {view === "books" ? <SheetViewer scope="seller" /> : <EntrySheet />}
    </GlassStage>
  );
}
