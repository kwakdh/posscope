// /api/figma-parse — 경량 Proxy 전용
// 피그마 API에서 Raw 노드 트리를 받아 가공 없이 클라이언트로 즉시 반환.
// 모든 무거운 파싱/분류 연산은 클라이언트(utils/figmaParser.ts)가 담당한다.
// 실행 시간 목표: 1초 미만 (Vercel 10초 타임아웃 완전 우회)

import { NextRequest, NextResponse } from "next/server";

const FIGMA_TOKEN = process.env.FIGMA_ACCESS_TOKEN;

export async function POST(req: NextRequest) {
  if (!FIGMA_TOKEN) {
    return NextResponse.json({ error: "Figma 토큰이 설정되지 않았습니다." }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { url } = body as { url?: string };
  if (!url) return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });

  const fileKeyMatch = url.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9_-]+)/);
  const nodeIdMatch  = url.match(/node-id=([^&]+)/);
  if (!fileKeyMatch) return NextResponse.json({ error: "올바른 피그마 URL이 아닙니다." }, { status: 400 });
  if (!nodeIdMatch)  return NextResponse.json({ error: "URL에 node-id가 필요합니다." }, { status: 400 });

  const fileKey = fileKeyMatch[1];
  const nodeId  = decodeURIComponent(nodeIdMatch[1]).replace(/-/g, ":");

  const nodesRes = await fetch(
    `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
    { headers: { "X-Figma-Token": FIGMA_TOKEN }, signal: AbortSignal.timeout(8000) }
  );

  if (!nodesRes.ok) {
    const err = await nodesRes.json().catch(() => ({}));
    return NextResponse.json({ error: err.message ?? "피그마 노드 조회 실패" }, { status: nodesRes.status });
  }

  const nodesData = await nodesRes.json();
  const rawNode = nodesData.nodes?.[nodeId]?.document;
  if (!rawNode) {
    return NextResponse.json({ error: "노드를 찾을 수 없습니다." }, { status: 404 });
  }

  // Raw JSON 즉시 반환 — 가공 없음
  return NextResponse.json({ rawNode, fileKey, nodeId });
}
