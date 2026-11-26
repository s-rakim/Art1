import { GuestFrame } from "@/components/guest-frame";

// The hiring form is public: people apply before they have an account, so it sits on the
// same white guest box as the login page rather than inside the app.
export default function RiderApplyLayout({ children }: { children: React.ReactNode }) {
  return <GuestFrame wide>{children}</GuestFrame>;
}
