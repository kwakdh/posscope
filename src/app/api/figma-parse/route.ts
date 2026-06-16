import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const FIGMA_TOKEN = process.env.FIGMA_ACCESS_TOKEN;

interface FigmaBox { x: number; y: number; width: number; height: number }
interface FigmaNode {
  id: string; name: string; type: string;
  characters?: string;
  absoluteBoundingBox?: FigmaBox;
  absoluteRenderBounds?: FigmaBox;
  children?: FigmaNode[];
}

// ── 텍스트 유틸 ───────────────────────────────────────────────────────────────

function allTextNodes(node: FigmaNode): FigmaNode[] {
  if (node.type === "TEXT") return [node];
  return (node.children ?? []).flatMap(allTextNodes);
}

function extractText(node: FigmaNode, skipPattern?: RegExp): string {
  return allTextNodes(node)
    .map(n => n.characters?.trim() ?? "")
    .filter(t => t && !/^[-─—━⸻]+$/.test(t) && !(skipPattern?.test(t) ?? false))
    .join("\n");
}

// ── 배지 감지 ─────────────────────────────────────────────────────────────────

type BadgeMark = { id: string; number: number; x: number; y: number; w?: number; h?: number };

function extractBadges(wfNode: FigmaNode): BadgeMark[] {
  const box = wfNode.absoluteBoundingBox;
  if (!box || box.width === 0 || box.height === 0) return [];
  const results: BadgeMark[] = [];

  function parseNum(name: string): number | null {
    const m = name.trim().match(/^(?:No\.?\s*|#|Badge\s*|callout[-\s]*|항목\s*)?(\d+)$/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function scan(node: FigmaNode) {
    const nb = node.absoluteBoundingBox;
    if (!nb) { (node.children ?? []).forEach(scan); return; }
    const isSmall = nb.width <= 80 && nb.height <= 80;
    if (!isSmall || node.type === "TEXT") { (node.children ?? []).forEach(scan); return; }

    let num = parseNum(node.name);
    if (num === null) {
      const nums = allTextNodes(node).map(n => (n.characters ?? "").trim()).filter(t => /^\d+$/.test(t));
      if (nums.length === 1) num = parseInt(nums[0], 10);
    }
    if (num !== null && num >= 1 && num <= 99) {
      const cx = ((nb.x + nb.width / 2 - box!.x) / box!.width) * 100;
      const cy = ((nb.y + nb.height / 2 - box!.y) / box!.height) * 100;
      if (cx >= 0 && cx <= 100 && cy >= 0 && cy <= 100) {
        results.push({ id: node.id, number: num, x: cx, y: cy });
        return;
      }
    }
    (node.children ?? []).forEach(scan);
  }

  (wfNode.children ?? []).forEach(scan);
  const seen = new Set<number>();
  return results.sort((a, b) => a.number - b.number).filter(b => { if (seen.has(b.number)) return false; seen.add(b.number); return true; });
}

// ── 모달/팝업 감지 ────────────────────────────────────────────────────────────

function isModalFrame(node: FigmaNode, parentBox?: FigmaBox): boolean {
  // 1) 이름 기반
  if (/팝업|모달|modal|alert|popup|bottom.?sheet|dialog|overlay|dim/i.test(node.name)) return true;

  const box = node.absoluteBoundingBox;
  if (!box) return false;

  // 2) 크기 기반: 일반 디바이스(360×600 이상) 규격보다 작은 경우
  const isSmallFrame = box.width < 360 || (parentBox && box.width < parentBox.width * 0.85 && box.height < parentBox.height * 0.85);
  if (isSmallFrame) {
    const allTexts = allTextNodes(node).map(n => (n.characters ?? "").trim().toLowerCase());
    // 3) 전형적인 모달 제어 버튼 패턴 감지
    const modalCtrlPattern = /^(확인|취소|닫기|close|cancel|ok|완료|적용|다음|이전|저장)$/;
    const ctrlCount = allTexts.filter(t => modalCtrlPattern.test(t)).length;
    if (ctrlCount >= 1) return true;
  }

  return false;
}

// ── 표(Table) 감지 ────────────────────────────────────────────────────────────

type TableData = { id: string; caption: string; headers: string[]; rows: string[][] };

function detectTable(node: FigmaNode): TableData | null {
  const children = node.children ?? [];
  if (children.length < 2) return null;

  // Y 좌표 기준으로 그룹핑 (같은 행 = Y 좌표 차이 < 5px)
  const sortedByY = [...children].sort((a, b) => (a.absoluteBoundingBox?.y ?? 0) - (b.absoluteBoundingBox?.y ?? 0));
  const rows: FigmaNode[][] = [];
  let currentRow: FigmaNode[] = [sortedByY[0]];

  for (let i = 1; i < sortedByY.length; i++) {
    const prevY = sortedByY[i - 1].absoluteBoundingBox?.y ?? 0;
    const currY = sortedByY[i].absoluteBoundingBox?.y ?? 0;
    if (Math.abs(currY - prevY) < 15) {
      currentRow.push(sortedByY[i]);
    } else {
      rows.push(currentRow);
      currentRow = [sortedByY[i]];
    }
  }
  if (currentRow.length) rows.push(currentRow);

  // 최소 2행, 각 행이 X 기준으로 정렬된 텍스트 셀 구성
  if (rows.length < 2) return null;
  const colCounts = rows.map(r => r.length);
  if (Math.max(...colCounts) - Math.min(...colCounts) > 1) return null;
  if (Math.min(...colCounts) < 1) return null;

  const getText = (cell: FigmaNode) =>
    allTextNodes(cell).map(n => (n.characters ?? "").trim()).filter(Boolean).join(" ");

  const headerRow = rows[0].sort((a, b) => (a.absoluteBoundingBox?.x ?? 0) - (b.absoluteBoundingBox?.x ?? 0));
  const headers = headerRow.map(getText);
  const dataRows = rows.slice(1).map(r =>
    r.sort((a, b) => (a.absoluteBoundingBox?.x ?? 0) - (b.absoluteBoundingBox?.x ?? 0)).map(getText)
  );

  return { id: node.id, caption: node.name, headers, rows: dataRows };
}

// ── 디스크립션 추출 ───────────────────────────────────────────────────────────

const ROW_GAP = 30;

function extractDescriptions(frame: FigmaNode): string[] {
  const box = frame.absoluteBoundingBox;
  const texts = allTextNodes(frame);
  const relX = box ? (n: FigmaNode) => (n.absoluteBoundingBox?.x ?? 0) - box.x : () => 999;
  const absY = (n: FigmaNode) => n.absoluteBoundingBox?.y ?? 0;

  const rightTexts = texts.filter(n => {
    if (box && relX(n) < 50) return false;
    const c = (n.characters ?? "").trim();
    return c.length > 0 && !/^(No\.?|Descriptions?\s*\/\s*Policies?)$/i.test(c) && !/^[-─—━⸻]+$/.test(c);
  }).sort((a, b) => absY(a) - absY(b));

  if (!rightTexts.length) return [];
  const rows: string[] = [];
  let group = [rightTexts[0].characters!.trim()];
  for (let i = 1; i < rightTexts.length; i++) {
    if (absY(rightTexts[i]) - absY(rightTexts[i - 1]) > ROW_GAP) {
      if (group.length) rows.push(group.join("\n"));
      group = [];
    }
    const t = rightTexts[i].characters?.trim();
    if (t) group.push(t);
  }
  if (group.length) rows.push(group.join("\n"));
  return rows;
}

// ── 와이어프레임 판별 ─────────────────────────────────────────────────────────

function isLargeUIFrame(node: FigmaNode): boolean {
  if (!["FRAME", "COMPONENT", "INSTANCE"].includes(node.type)) return false;
  const box = node.absoluteBoundingBox;
  if (!box || box.width < 300 || box.height < 400) return false;
  if (/descriptions?|policies|정책|고려사항|참고사항|tag|connector|slice|vector|group\s*\d/i.test(node.name)) return false;
  return true;
}

// ── 플로우차트 커넥터 감지 ────────────────────────────────────────────────────

type FlowHint = { fromName: string; toName: string };

function detectFlowHints(root: FigmaNode): FlowHint[] {
  const hints: FlowHint[] = [];
  function walk(node: FigmaNode) {
    if (node.type === "CONNECTOR" || (node.type === "LINE" && /arrow|flow|화살|연결/i.test(node.name))) {
      // 커넥터 이름에서 from/to 파싱 시도: "A → B", "A->B"
      const m = node.name.match(/^(.+?)\s*[-→>]+\s*(.+)$/);
      if (m) hints.push({ fromName: m[1].trim(), toName: m[2].trim() });
    }
    (node.children ?? []).forEach(walk);
  }
  walk(root);
  return hints;
}

// ── 트리 탐색 ─────────────────────────────────────────────────────────────────

type FoundFrames = {
  wireframes: FigmaNode[];
  description: FigmaNode | null;
  policy: FigmaNode | null;
  uiNote: FigmaNode | null;
  consideration: FigmaNode | null;
  tables: FigmaNode[];
};

function walkTree(node: FigmaNode, found: FoundFrames, parentBox?: FigmaBox) {
  const name = node.name.trim();
  if (/descriptions?\s*\/\s*policies?/i.test(name)) { found.description ??= node; return; }
  if (/^정책$|^\[정책\]/.test(name) || name === "정책") { found.policy ??= node; return; }
  if (/UI\s*참고사항|UI팀\s*참고|★\s*UI/i.test(name)) { found.uiNote ??= node; return; }
  if (/^확인$|고려사항|★\s*고려/i.test(name)) { found.consideration ??= node; return; }

  // 표 감지 (이름에 table/표/grid가 포함된 프레임)
  if (/table|표|grid|차트|목록/i.test(name) && ["FRAME", "GROUP", "COMPONENT", "INSTANCE"].includes(node.type)) {
    const tbl = detectTable(node);
    if (tbl) { found.tables.push(node); return; }
  }

  if (isLargeUIFrame(node)) {
    found.wireframes.push(node);
    // 자식도 순회 (순환 번호 ①②③ 프레임이 중첩될 수 있음)
  }

  (node.children ?? []).forEach(child => walkTree(child, found, node.absoluteBoundingBox ?? parentBox));
}

// ── API 핸들러 ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!FIGMA_TOKEN) return NextResponse.json({ error: "Figma 토큰이 설정되지 않았습니다." }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const { url } = body as { url?: string };
  if (!url) return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });

  const fileKeyMatch = url.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9_-]+)/);
  const nodeIdMatch = url.match(/node-id=([^&]+)/);
  if (!fileKeyMatch) return NextResponse.json({ error: "올바른 피그마 URL이 아닙니다." }, { status: 400 });
  if (!nodeIdMatch) return NextResponse.json({ error: "URL에 node-id가 필요합니다." }, { status: 400 });

  const fileKey = fileKeyMatch[1];
  const nodeId = decodeURIComponent(nodeIdMatch[1]).replace(/-/g, ":");

  // 노드 트리 조회
  const nodesRes = await fetch(
    `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
    { headers: { "X-Figma-Token": FIGMA_TOKEN } }
  );
  if (!nodesRes.ok) {
    const err = await nodesRes.json().catch(() => ({}));
    return NextResponse.json({ error: err.message ?? "피그마 노드 조회 실패" }, { status: nodesRes.status });
  }

  const nodesData = await nodesRes.json();
  const root: FigmaNode | undefined = nodesData.nodes?.[nodeId]?.document;
  if (!root) return NextResponse.json({ error: "노드를 찾을 수 없습니다." }, { status: 404 });

  // 트리 탐색
  const found: FoundFrames = { wireframes: [], description: null, policy: null, uiNote: null, consideration: null, tables: [] };
  walkTree(root, found, root.absoluteBoundingBox);

  // 순환 번호 우선
  const circled = found.wireframes.filter(w => /[①②③④⑤⑥⑦⑧⑨⑩]/.test(w.name));
  if (circled.length > 0) found.wireframes = circled;
  found.wireframes.sort((a, b) => (a.absoluteBoundingBox?.x ?? 0) - (b.absoluteBoundingBox?.x ?? 0));

  // 모달 판별
  const rootBox = root.absoluteBoundingBox;
  const mainWireframes: FigmaNode[] = [];
  const modalWireframes: FigmaNode[] = [];
  for (const wf of found.wireframes) {
    if (isModalFrame(wf, rootBox ?? undefined)) modalWireframes.push(wf);
    else mainWireframes.push(wf);
  }
  // 모달이 전부거나 메인이 없으면 전부 메인으로
  const finalWireframes = mainWireframes.length > 0
    ? [...mainWireframes, ...modalWireframes]
    : found.wireframes.map(w => ({ ...w, _isModal: false })) as FigmaNode[];

  // 텍스트 추출
  const descriptions = found.description ? extractDescriptions(found.description) : [];
  const policyNote = found.policy ? extractText(found.policy, /^정책$/) : "";
  const uiNote = found.uiNote ? extractText(found.uiNote, /^(UI\s*참고사항|★\s*UI\s*참고사항)$/i) : "";
  const considerationNote = found.consideration ? extractText(found.consideration, /^(확인|고려사항|★\s*고려사항)$/i) : "";

  // 표 데이터
  const tables: TableData[] = found.tables.map(n => detectTable(n)).filter(Boolean) as TableData[];

  // 플로우 힌트
  const flowHints = detectFlowHints(root);

  // 이미지 일괄 export
  type WireframeSection = { name: string; imageUrl: string; imageBase64: string; imageMimeType: string; badges: BadgeMark[]; isModal: boolean };
  const allWfs = mainWireframes.length > 0 ? [...mainWireframes, ...modalWireframes] : found.wireframes;
  const sections: WireframeSection[] = allWfs.map(wf => ({
    name: wf.name,
    imageUrl: "",
    imageBase64: "",
    imageMimeType: "image/png",
    badges: extractBadges(wf),
    isModal: modalWireframes.includes(wf),
  }));

  let exportError: string | null = null;

  console.log("[figma-parse] allWfs:", allWfs.length, allWfs.map(w => `${w.id} "${w.name}"`));

  if (allWfs.length > 0) {
    try {
      // 각 ID를 개별 URL-인코딩해서 콤마로 조인 (`:` 포함 안전 처리)
      const exportIds = allWfs.map(w => encodeURIComponent(w.id)).join(",");
      const exportUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${exportIds}&format=png&scale=2`;
      console.log("[figma-parse] export URL:", exportUrl);

      const exportRes = await fetch(exportUrl, { headers: { "X-Figma-Token": FIGMA_TOKEN } });
      console.log("[figma-parse] export status:", exportRes.status);

      if (exportRes.ok) {
        const exportData = await exportRes.json();
        const imageUrls = exportData.images as Record<string, string | null>;
        console.log("[figma-parse] imageUrls keys:", Object.keys(imageUrls));

        const sb = createAdminClient();

        await Promise.all(allWfs.map(async (wf, i) => {
          const dashId = wf.id.replace(/:/g, "-");
          const imgUrl = imageUrls[wf.id] ?? imageUrls[dashId] ?? null;
          console.log(`[figma-parse] wf[${i}] id=${wf.id} dashId=${dashId} url=${imgUrl ? "OK" : "null"}`);
          if (!imgUrl) return;
          try {
            const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(25000) });
            console.log(`[figma-parse] img download status[${i}]:`, imgRes.status, imgRes.headers.get("content-type"));
            if (!imgRes.ok) return;
            const buf = await imgRes.arrayBuffer();
            const mimeType = imgRes.headers.get("content-type") ?? "image/png";
            const ext = mimeType.split("/")[1]?.split(";")[0] ?? "png";
            console.log(`[figma-parse] img size[${i}]:`, buf.byteLength, "bytes");

            // 서버사이드 Supabase 업로드 (service role → RLS 우회)
            const storagePath = `figma/${fileKey}/${dashId}-${Date.now()}.${ext}`;
            const { error: upErr } = await sb.storage
              .from("wireframes")
              .upload(storagePath, Buffer.from(buf), { contentType: mimeType, upsert: true });

            if (upErr) {
              console.error(`[figma-parse] Supabase upload failed[${i}]:`, upErr.message);
              // fallback: base64 반환
              sections[i] = { ...sections[i], imageBase64: Buffer.from(buf).toString("base64"), imageMimeType: mimeType };
            } else {
              const { data: urlData } = sb.storage.from("wireframes").getPublicUrl(storagePath);
              console.log(`[figma-parse] Supabase upload OK[${i}]:`, urlData.publicUrl);
              sections[i] = { ...sections[i], imageUrl: urlData.publicUrl, imageMimeType: mimeType };
            }
          } catch (e) { console.error(`[figma-parse] Image download failed[${i}]:`, wf.name, e); }
        }));
      } else {
        const errBody = await exportRes.json().catch(() => ({}));
        exportError = `Figma export ${exportRes.status}: ${JSON.stringify(errBody)}`;
        console.error("[figma-parse]", exportError);
      }
    } catch (e) {
      exportError = String(e);
      console.error("[figma-parse] Batch image export failed:", e);
    }
  }

  return NextResponse.json({
    // 하위 호환 (단건 모드)
    wireframeName: sections[0]?.name ?? "",
    wireframeCount: sections.length,
    imageUrl: sections[0]?.imageUrl ?? "",
    imageBase64: sections[0]?.imageBase64 ?? "",
    imageMimeType: sections[0]?.imageMimeType ?? "image/png",
    // 공통 텍스트
    descriptions,
    policyNote,
    uiNote,
    considerationNote,
    // 구조화 데이터
    tables,
    flowHints,
    // 전체 섹션 (N:1 벌크 임포트)
    sections,
    // 디버그
    _debug: {
      wireframesFound: allWfs.length,
      mainCount: mainWireframes.length,
      modalCount: modalWireframes.length,
      tablesFound: tables.length,
      flowHints: flowHints.length,
      exportError,
    },
  });
}
