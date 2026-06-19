import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { title, blocks, authorName } = await req.json() as {
    title?: string; blocks?: unknown[]; authorName?: string;
  };

  const admin = createAdminClient();

  // 버전 마이너 +1 (저장할 때마다 자동 증가)
  const { data: current } = await admin
    .from("wiki_docs")
    .select("version_major, version_minor")
    .eq("id", id)
    .single();

  const newMinor = (current?.version_minor ?? 0) + 1;

  const { data, error } = await admin
    .from("wiki_docs")
    .update({
      title: title ?? "제목 없음",
      blocks: blocks ?? [],
      author_name: authorName ?? null,
      version_minor: newMinor,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ doc: data });
}
