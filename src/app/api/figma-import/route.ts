import { NextRequest, NextResponse } from "next/server";

const FIGMA_TOKEN = process.env.FIGMA_ACCESS_TOKEN;

export async function POST(req: NextRequest) {
  if (!FIGMA_TOKEN) {
    return NextResponse.json({ error: "Figma 토큰이 설정되지 않았습니다." }, { status: 500 });
  }

  const { url } = await req.json();
  if (!url) {
    return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });
  }

  // Parse figma URL: figma.com/design/:fileKey/...?node-id=:nodeId
  const fileKeyMatch = url.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9_-]+)/);
  const nodeIdMatch = url.match(/node-id=([^&]+)/);

  if (!fileKeyMatch) {
    return NextResponse.json({ error: "올바른 피그마 URL이 아닙니다." }, { status: 400 });
  }

  const fileKey = fileKeyMatch[1];
  const nodeId = nodeIdMatch ? decodeURIComponent(nodeIdMatch[1]).replace(/-/g, ":") : null;

  try {
    // Export image from Figma
    const params = new URLSearchParams({ format: "png", scale: "2" });
    if (nodeId) params.set("ids", nodeId);

    const exportRes = await fetch(
      `https://api.figma.com/v1/images/${fileKey}?${params}`,
      { headers: { "X-Figma-Token": FIGMA_TOKEN } }
    );

    if (!exportRes.ok) {
      const err = await exportRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.message ?? "피그마 이미지 export에 실패했습니다." },
        { status: exportRes.status }
      );
    }

    const exportData = await exportRes.json();
    const imageUrls = exportData.images as Record<string, string>;
    const imageUrl = nodeId
      ? (imageUrls[nodeId] ?? imageUrls[nodeId.replace(":", "-")] ?? Object.values(imageUrls)[0])
      : Object.values(imageUrls)[0];

    if (!imageUrl) {
      return NextResponse.json({ error: "이미지를 가져올 수 없습니다." }, { status: 404 });
    }

    // Download the image and return as blob so client can upload to Supabase
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      return NextResponse.json({ error: "이미지 다운로드에 실패했습니다." }, { status: 502 });
    }

    const blob = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get("content-type") ?? "image/png";

    return new NextResponse(blob, {
      status: 200,
      headers: { "Content-Type": contentType },
    });
  } catch (e) {
    console.error("figma-import error:", e);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
