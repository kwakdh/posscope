import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { randomDefaultAvatar } from "@/lib/default-avatars";

export async function GET() {
  const result = await requireAdmin();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { data, error } = await result.admin
    .from("users")
    .select("id, email, name, role, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ users: data });
}

export async function POST(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { email, name, password, role } = await request.json();

  if (!email || !name || !password) {
    return NextResponse.json({ error: "이메일, 이름, 비밀번호를 모두 입력해주세요." }, { status: 400 });
  }

  const { admin } = result;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message ?? "계정 생성에 실패했습니다." }, { status: 400 });
  }

  const { error: insertError } = await admin.from("users").insert({
    id: created.user.id,
    email,
    name,
    role: role ?? "viewer",
    status: "approved",
    avatar_url: randomDefaultAvatar(),
  });

  if (insertError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
