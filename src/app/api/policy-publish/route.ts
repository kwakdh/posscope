import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { normalizePolicy } from "@/types/policy";

export async function POST(req: NextRequest) {
  // 로그인 여부 확인
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { policyId, publishType, userName, changeLog } = await req.json() as {
    policyId: string;
    publishType: "minor" | "major";
    userName: string;
    changeLog: string;
  };

  if (!policyId || !publishType) {
    return NextResponse.json({ error: "필수 파라미터가 누락되었습니다." }, { status: 400 });
  }

  const admin = createAdminClient();

  // 현재 정책 조회
  const { data: current, error: fetchErr } = await admin
    .from("policies")
    .select("*")
    .eq("id", policyId)
    .single();

  if (fetchErr || !current) {
    return NextResponse.json({ error: "기획서를 찾을 수 없습니다." }, { status: 404 });
  }

  const vMaj: number = current.version_major ?? 0;
  const vMin: number = current.version_minor ?? 0;

  // 발행 버전 계산
  const newMaj = publishType === "major" ? vMaj + 1 : vMaj;
  const newMin = publishType === "major" ? 0 : vMin + 1;

  const now = new Date().toISOString();

  // ── 1. 현재 정책을 발행 버전으로 잠금 ────────────────────────────────────
  const { data: locked, error: lockErr } = await admin
    .from("policies")
    .update({
      is_locked: true,
      published_at: now,
      publish_type: publishType,
      change_log: changeLog ?? "",
      author_name: userName,
      updated_at: now,
      version_major: newMaj,
      version_minor: newMin,
    })
    .eq("id", policyId)
    .select("*")
    .single();

  if (lockErr || !locked) {
    return NextResponse.json(
      { error: `잠금 실패: ${lockErr?.message ?? "알 수 없는 오류"}` },
      { status: 500 }
    );
  }

  // ── 2. 다음 작업을 위한 새 초안 생성 (잠긴 내용 복사, 버전 +1) ──────────
  const { data: newDraft, error: draftErr } = await admin
    .from("policies")
    .insert({
      item_type: current.item_type,
      item_id: current.item_id,
      kind: current.kind,
      title: current.title,
      mode: current.mode,
      wireframes: current.wireframes,
      flow_steps: current.flow_steps,
      description_groups: current.description_groups,
      description_items: current.description_items ?? [],
      policy_note: current.policy_note ?? "",
      ui_note: current.ui_note ?? "",
      consideration_note: current.consideration_note ?? "",
      tables: current.tables ?? [],
      ai_screens: current.ai_screens ?? [],
      image_badges: current.image_badges ?? [],
      wireframe_url: current.wireframe_url ?? null,
      sort_order: current.sort_order ?? 0,
      version_major: newMaj,
      version_minor: newMin + 1,
      is_locked: false,
      published_at: null,
      publish_type: null,
      change_log: "",
      author_name: userName,
      updated_at: now,
    })
    .select("*")
    .single();

  if (draftErr || !newDraft) {
    return NextResponse.json(
      { error: `초안 생성 실패: ${draftErr?.message ?? "알 수 없는 오류"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    locked: normalizePolicy(locked),
    newDraft: normalizePolicy(newDraft),
  });
}
