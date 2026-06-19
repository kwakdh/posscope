import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const docId   = req.nextUrl.searchParams.get("docId");
  const blockId = req.nextUrl.searchParams.get("blockId");
  if (!docId || !blockId) return NextResponse.json({ error: "docId and blockId required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("wiki_block_comments")
    .select("*")
    .eq("doc_id", docId)
    .eq("block_id", blockId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { docId, blockId, content, authorName, mentions } = await req.json() as {
    docId: string; blockId: string; content: string; authorName?: string; mentions?: string[];
  };
  if (!docId || !blockId || !content?.trim()) {
    return NextResponse.json({ error: "docId, blockId, content required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("wiki_block_comments")
    .insert({
      doc_id: docId,
      block_id: blockId,
      content: content.trim(),
      author_name: authorName ?? null,
      mentions: mentions ?? [],
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment: data });
}
