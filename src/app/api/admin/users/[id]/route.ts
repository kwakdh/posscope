import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/admin-guard";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdmin();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { id } = await params;
  const { status, role } = await request.json();

  if (status && !["pending", "approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "잘못된 상태값입니다." }, { status: 400 });
  }
  if (role && !["admin", "planner", "developer", "viewer"].includes(role)) {
    return NextResponse.json({ error: "잘못된 권한값입니다." }, { status: 400 });
  }

  if (status || role) {
    const { data: target } = await result.admin
      .from("users")
      .select("role")
      .eq("id", id)
      .single();

    if (target?.role === "admin" && (role && role !== "admin" || status === "rejected")) {
      return NextResponse.json(
        { error: "관리자 계정은 화면에서 변경할 수 없습니다. 코드 작업이 필요합니다." },
        { status: 403 }
      );
    }
  }

  const update: Record<string, string> = {};
  if (status) update.status = status;
  if (role) update.role = role;

  const { error } = await result.admin.from("users").update(update).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdmin();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { id } = await params;

  const { data: target } = await result.admin
    .from("users")
    .select("role")
    .eq("id", id)
    .single();

  if (target?.role === "admin") {
    return NextResponse.json(
      { error: "관리자 계정은 화면에서 삭제할 수 없습니다. 코드 작업이 필요합니다." },
      { status: 403 }
    );
  }

  const { error } = await result.admin.auth.admin.deleteUser(id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
