import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const menuId = req.nextUrl.searchParams.get("menuId");
  if (!menuId) return NextResponse.json({ error: "menuId required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("wiki_docs")
    .select("*")
    .eq("menu_id", menuId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ doc: data ?? null });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { menuId, authorName, title } = await req.json() as { menuId: string; authorName?: string; title?: string };
  if (!menuId) return NextResponse.json({ error: "menuId required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("wiki_docs")
    .insert({
      menu_id: menuId,
      title: title?.trim() || "제목 없음",
      blocks: [],
      author_name: authorName ?? null,
      version_major: 0,
      version_minor: 1,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ doc: data });
}
