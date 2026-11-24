"use client";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export function SignOut() {
  const router = useRouter();
  return (
    <button
      className="btn btn-secondary"
      onClick={async () => {
        await supabase()?.auth.signOut();
        router.replace("/");
        router.refresh();
      }}
    >
      Log out
    </button>
  );
}
