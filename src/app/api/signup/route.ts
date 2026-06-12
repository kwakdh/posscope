import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { ALLOWED_EMAIL_DOMAIN, ADMIN_EMAILS } from "@/lib/supabase/middleware";
import { randomDefaultAvatar } from "@/lib/default-avatars";

export async function POST(request: Request) {
  const { email, password, name } = await request.json();

  if (!email || !password || !name) {
    return NextResponse.json({ error: "이메일, 비밀번호, 이름을 모두 입력해주세요." }, { status: 400 });
  }

  const domain = email.split("@")[1]?.toLowerCase();
  const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase());

  if (!isAdmin && domain !== ALLOWED_EMAIL_DOMAIN) {
    return NextResponse.json(
      { error: `@${ALLOWED_EMAIL_DOMAIN} 이메일만 가입할 수 있습니다.` },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? "계정 생성에 실패했습니다." },
      { status: 400 }
    );
  }

  const { error: insertError } = await admin.from("users").insert({
    id: created.user.id,
    email,
    name,
    role: isAdmin ? "admin" : "viewer",
    status: isAdmin ? "approved" : "pending",
    avatar_url: randomDefaultAvatar(),
  });

  if (insertError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ status: isAdmin ? "approved" : "pending" });
}
