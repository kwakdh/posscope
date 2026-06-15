"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-zinc-200"
    >
      로그아웃
    </button>
  );
}
