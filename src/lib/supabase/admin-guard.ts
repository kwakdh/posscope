import { createClient, createAdminClient } from "@/lib/supabase/server";
import { ADMIN_EMAILS } from "@/lib/supabase/middleware";

export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "로그인이 필요합니다.", status: 401 } as const;
  }

  let isAdmin = ADMIN_EMAILS.includes(user.email ?? "");

  if (!isAdmin) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    isAdmin = profile?.role === "admin";
  }

  if (!isAdmin) {
    return { error: "관리자만 접근할 수 있습니다.", status: 403 } as const;
  }

  return { admin: createAdminClient(), user } as const;
}
