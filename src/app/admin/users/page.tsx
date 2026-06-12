import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { UsersTable } from "./users-table";
import { AddUserForm } from "./add-user-form";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await requireAdmin();
  if ("error" in result) redirect("/");

  const { data: users } = await result.admin
    .from("users")
    .select("id, email, name, role, status, created_at, avatar_url, last_seen_at")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-zinc-900">사용자 관리</h1>
      <p className="mt-1 text-sm text-zinc-500">가입 신청을 승인/거절하고, 사용자를 직접 추가할 수 있습니다.</p>

      <div className="mt-8">
        <AddUserForm />
      </div>

      <div className="mt-8">
        <UsersTable initialUsers={users ?? []} />
      </div>
    </div>
  );
}
