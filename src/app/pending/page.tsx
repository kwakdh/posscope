import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";

export default async function PendingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("status, name, email")
    .eq("id", user.id)
    .single();

  if (profile?.status === "approved") {
    redirect("/");
  }

  const rejected = profile?.status === "rejected";

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">
          {rejected ? "가입이 거절되었습니다" : "승인 대기 중입니다"}
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          {rejected
            ? "관리자에게 문의해주세요."
            : "관리자가 가입 신청을 승인하면 이용할 수 있습니다."}
        </p>
        <p className="mt-4 text-sm text-zinc-400">{profile?.name} ({profile?.email})</p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
