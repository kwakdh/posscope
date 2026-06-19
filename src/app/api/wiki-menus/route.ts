import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("wiki_menus")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ menus: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, parent_id, sort_order, icon } = await req.json() as {
    title?: string; parent_id?: string | null; sort_order?: number; icon?: string | null;
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("wiki_menus")
    .insert({
      title: title?.trim() || "새 문서",
      parent_id: parent_id ?? null,
      sort_order: sort_order ?? 0,
      icon: icon ?? null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ menu: data });
}
