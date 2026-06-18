// /api/figma-images — 이미지 Export URL 전용 Proxy
// 클라이언트가 추출한 노드 ID 배열을 받아 Figma /v1/images API를 호출하고
// 임시 CDN URL 맵을 반환한다. 이미지 다운로드·업로드는 클라이언트 책임.

import { NextRequest, NextResponse } from "next/server";

const FIGMA_TOKEN = process.env.FIGMA_ACCESS_TOKEN;

export async function POST(req: NextRequest) {
  if (!FIGMA_TOKEN) {
    return NextResponse.json({ error: "Figma 토큰이 설정되지 않았습니다." }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { fileKey, nodeIds } = body as { fileKey?: string; nodeIds?: string[] };
  if (!fileKey || !Array.isArray(nodeIds) || nodeIds.length === 0) {
    return NextResponse.json({ error: "fileKey와 nodeIds 배열이 필요합니다." }, { status: 400 });
  }

  const ids = nodeIds.map(id => encodeURIComponent(id)).join(",");
  const exportRes = await fetch(
    `https://api.figma.com/v1/images/${fileKey}?ids=${ids}&format=png&scale=1`,
    { headers: { "X-Figma-Token": FIGMA_TOKEN }, signal: AbortSignal.timeout(8000) }
  );

  if (!exportRes.ok) {
    const err = await exportRes.json().catch(() => ({}));
    return NextResponse.json({ error: err.message ?? "이미지 export 실패", images: {} }, { status: exportRes.status });
  }

  const exportData = await exportRes.json();
  // images: { [nodeId]: cdnUrl | null }
  return NextResponse.json({ images: exportData.images ?? {} });
}
