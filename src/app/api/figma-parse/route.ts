import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const FIGMA_TOKEN = process.env.FIGMA_ACCESS_TOKEN;

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface FigmaBox { x: number; y: number; width: number; height: number }
interface FigmaFill { type: string; color?: { r: number; g: number; b: number; a?: number } }
interface FigmaNode {
  id: string; name: string; type: string;
  characters?: string;
  absoluteBoundingBox?: FigmaBox;
  absoluteRenderBounds?: FigmaBox;
  fills?: FigmaFill[];
  children?: FigmaNode[];
}

type BadgeMark = { id: string; pinNumber: string; x: number; y: number; w?: number; h?: number };
type TableData = { id: string; caption: string; headers: string[]; rows: string[][] };
type DescSubItem = { pinNumber: string; text: string };
type DescGroup = { id: string; pinNumber: string; title: string; subItems: DescSubItem[] };

// ── 텍스트 유틸 ───────────────────────────────────────────────────────────────

function allTextNodes(node: FigmaNode): FigmaNode[] {
  if (node.type === "TEXT") return [node];
  return (node.children ?? []).flatMap(allTextNodes);
}

function extractAllText(node: FigmaNode, skipPattern?: RegExp): string {
  return allTextNodes(node)
    .map(n => n.characters?.trim() ?? "")
    .filter(t => t && !/^[-─—━⸻]+$/.test(t) && !(skipPattern?.test(t) ?? false))
    .join("\n");
}

// ── 배지 감지 ─────────────────────────────────────────────────────────────────

function extractBadges(wfNode: FigmaNode): BadgeMark[] {
  const box = wfNode.absoluteBoundingBox;
  if (!box || box.width === 0 || box.height === 0) return [];
  const results: BadgeMark[] = [];

  // "3", "3-1", "3-2" 형식 파싱 (하이픈 포함 지원)
  function parsePin(name: string): string | null {
    const m = name.trim().match(/^(?:No\.?\s*|#|Badge\s*|callout[-\s]*|항목\s*|pin\s*)?(\d+(?:-\d+)?)$/i);
    return m ? m[1] : null;
  }

  function hasColoredFill(node: FigmaNode): boolean {
    const fills = node.fills ?? [];
    return fills.some(f => {
      if (f.type !== "SOLID" || !f.color) return false;
      const { r, g, b } = f.color;
      if (r > 0.55 && g < 0.45 && b < 0.45) return true;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      return max > 0.4 && (max - min) > 0.35;
    });
  }

  function scan(node: FigmaNode) {
    const nb = node.absoluteBoundingBox;
    if (!nb) { (node.children ?? []).forEach(scan); return; }
    if (node.type === "TEXT") { return; }

    const isSmallEnough = nb.width <= 120 && nb.height <= 120;
    if (!isSmallEnough) { (node.children ?? []).forEach(scan); return; }

    // 이름 기반 핀 번호 파싱 우선
    let pin = parsePin(node.name);

    // 이름으로 못 찾으면 단일 "숫자(−숫자)" 텍스트 자식 탐색
    if (pin === null) {
      const textContents = allTextNodes(node)
        .map(n => (n.characters ?? "").trim())
        .filter(t => /^\d+(?:-\d+)?$/.test(t));
      if (textContents.length === 1) pin = textContents[0];
    }

    if (pin !== null) {
      const isTinyBadge = nb.width <= 40 && nb.height <= 40;
      const isColoredBadge = hasColoredFill(node) ||
        (node.children ?? []).some(c => hasColoredFill(c));

      if (isTinyBadge || isColoredBadge || parsePin(node.name) !== null) {
        const cx = ((nb.x + nb.width / 2 - box!.x) / box!.width) * 100;
        const cy = ((nb.y + nb.height / 2 - box!.y) / box!.height) * 100;
        if (cx >= 0 && cx <= 100 && cy >= 0 && cy <= 100) {
          results.push({ id: node.id, pinNumber: pin, x: cx, y: cy });
          return;
        }
      }
    }

    (node.children ?? []).forEach(scan);
  }

  (wfNode.children ?? []).forEach(scan);

  // 핀 번호 기준 정렬 & 중복 제거
  const seen = new Set<string>();
  return results
    .sort((a, b) => {
      const [am, as_] = a.pinNumber.split("-").map(Number);
      const [bm, bs] = b.pinNumber.split("-").map(Number);
      return am !== bm ? am - bm : (as_ ?? 0) - (bs ?? 0);
    })
    .filter(b => { if (seen.has(b.pinNumber)) return false; seen.add(b.pinNumber); return true; });
}

// ── 표(Table) 감지 ────────────────────────────────────────────────────────────

function detectTable(node: FigmaNode): TableData | null {
  const children = node.children ?? [];
  if (children.length < 2) return null;

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

// ── 디스크립션 계층형 그룹 추출 ──────────────────────────────────────────────

const ROW_GAP = 30;

function extractDescriptionGroups(node: FigmaNode): DescGroup[] {
  const texts = allTextNodes(node);
  const absY = (n: FigmaNode) => n.absoluteBoundingBox?.y ?? 0;
  const absX = (n: FigmaNode) => n.absoluteBoundingBox?.x ?? 0;

  const meaningful = texts.filter(n => {
    const c = (n.characters ?? "").trim();
    return (
      c.length > 0 &&
      !/^(No\.?|Descriptions?\s*\/\s*Policies?)$/i.test(c) &&
      !/^[-─—━⸻]+$/.test(c)
    );
  }).sort((a, b) => absY(a) - absY(b));

  if (!meaningful.length) return [];

  // Y 근접도로 행 그룹화
  const rows: FigmaNode[][] = [];
  let currentRow = [meaningful[0]];
  for (let i = 1; i < meaningful.length; i++) {
    if (absY(meaningful[i]) - absY(meaningful[i - 1]) < ROW_GAP) {
      currentRow.push(meaningful[i]);
    } else {
      rows.push(currentRow);
      currentRow = [meaningful[i]];
    }
  }
  if (currentRow.length) rows.push(currentRow);

  // 각 행에서 핀 번호(왼쪽 셀)와 설명 텍스트(오른쪽 셀) 분리
  type RawRow = { pin: string; text: string };
  const rawRows: RawRow[] = [];
  let autoPin = 0;

  for (const row of rows) {
    const sorted = [...row].sort((a, b) => absX(a) - absX(b));
    const leftText = sorted[0].characters?.trim() ?? "";
    const pinMatch = leftText.match(/^(\d+(?:-\d+)?)\.?$/);

    if (pinMatch && sorted.length > 1) {
      const text = sorted.slice(1).map(n => n.characters?.trim() ?? "").filter(Boolean).join(" ");
      if (text) rawRows.push({ pin: pinMatch[1], text });
    } else {
      // 핀 번호 없는 행 → 자동 번호
      const text = sorted.map(n => n.characters?.trim() ?? "").filter(Boolean).join(" ");
      if (text && !/^(\d+(?:-\d+)?)$/.test(text)) {
        rawRows.push({ pin: String(++autoPin), text });
      }
    }
  }

  // DescGroup[] 구조로 집계
  const groupMap = new Map<string, DescGroup>();
  const groupOrder: string[] = [];

  for (const { pin, text } of rawRows) {
    if (pin.includes("-")) {
      const parentPin = pin.split("-")[0];
      if (!groupMap.has(parentPin)) {
        groupMap.set(parentPin, { id: `desc_group_${parentPin}`, pinNumber: parentPin, title: "", subItems: [] });
        groupOrder.push(parentPin);
      }
      groupMap.get(parentPin)!.subItems.push({ pinNumber: pin, text });
    } else {
      if (!groupMap.has(pin)) {
        groupMap.set(pin, { id: `desc_group_${pin}`, pinNumber: pin, title: text, subItems: [] });
        groupOrder.push(pin);
      } else {
        groupMap.get(pin)!.title = text;
      }
    }
  }

  return groupOrder.map(p => groupMap.get(p)!);
}

// ── 노드 분류 ─────────────────────────────────────────────────────────────────

type NodeClass = "wireframe" | "description" | "policy" | "uiNote" | "consideration" | "skip";

const DOC_NAME_RE = /descriptions?\s*\/?\s*policies?|정책|고려사항|참고사항|★|☆|UI\s*참고|ui\s*note|callout|annotation|고려\s*사항/i;
const WIREFRAME_NAME_RE = /화면|screen|홈|메인|키패드|설정|관리|현행|신규|before|after|keypad|home|main|[①②③④⑤⑥⑦⑧⑨⑩]/i;

function classifyNode(node: FigmaNode): NodeClass {
  const name = node.name.trim();
  const box = node.absoluteBoundingBox;

  // 비시각적 요소 스킵
  if (["CONNECTOR", "ARROW", "LINE", "VECTOR", "STAR", "BOOLEAN_OPERATION"].includes(node.type)) return "skip";
  if (!["FRAME", "COMPONENT", "INSTANCE", "GROUP", "SECTION", "TEXT"].includes(node.type)) return "skip";
  if (!box || box.width < 80 || box.height < 80) return "skip";

  // 이름 기반 분류 (최우선)
  if (/descriptions?\s*\/\s*policies?/i.test(name)) return "description";
  if (/^정책$|^\[정책\]/i.test(name))              return "policy";
  if (/UI\s*참고사항|★\s*UI/i.test(name))          return "uiNote";
  if (/고려사항|★\s*고려/i.test(name))             return "consideration";
  if (/★|☆/i.test(name))                           return "consideration";

  // 독립 텍스트 노드 → 스킵 (레이블/주석)
  if (node.type === "TEXT") return "skip";

  // 크기 기반 분류
  const isPortrait = box.height > box.width * 1.1;   // 세로형 = 모바일 화면
  const isLandscape = box.width > box.height * 1.3;  // 가로형 = 문서/표 가능성

  // 세로형이면서 충분히 크면 → 와이어프레임
  if (isPortrait && box.height >= 300) {
    return "wireframe";
  }

  // 가로형이거나 정방형 → 내용 기반으로 문서 여부 확인
  if (isLandscape || (!isPortrait && box.width >= 300)) {
    const texts = allTextNodes(node).map(n => (n.characters ?? "").trim()).filter(Boolean);

    if (texts.some(t => /descriptions?\s*\/\s*policies?/i.test(t))) return "description";
    if (texts.some(t => /^no\.?$/i.test(t)))                         return "description";
    if (texts.some(t => /^고려사항$|^참고사항$/i.test(t)))           return "consideration";
    if (texts.some(t => /^정책$/i.test(t)))                          return "policy";
    if (texts.some(t => /^UI\s*참고사항$/i.test(t)))                 return "uiNote";

    // 이름에 화면 관련 키워드가 있으면 와이어프레임
    if (WIREFRAME_NAME_RE.test(name)) return "wireframe";

    // 그 외 가로형이지만 충분히 크면 → 와이어프레임으로 포함 (포스기 등 가로 화면 고려)
    if (box.width >= 600 && box.height >= 400) return "wireframe";

    return "skip";
  }

  return "skip";
}

// ── 자식 노드 분류 (직접 자식 우선, 필요시 한 단계 더 탐색) ───────────────────

type Classified = {
  wireframes: FigmaNode[];
  descNodes: FigmaNode[];
  policyNodes: FigmaNode[];
  uiNoteNodes: FigmaNode[];
  considerNodes: FigmaNode[];
};

function classifyChildren(root: FigmaNode): Classified {
  const result: Classified = {
    wireframes: [], descNodes: [], policyNodes: [], uiNoteNodes: [], considerNodes: [],
  };

  function pushNode(cls: NodeClass, node: FigmaNode) {
    if (cls === "wireframe")     result.wireframes.push(node);
    else if (cls === "description") result.descNodes.push(node);
    else if (cls === "policy")      result.policyNodes.push(node);
    else if (cls === "uiNote")      result.uiNoteNodes.push(node);
    else if (cls === "consideration") result.considerNodes.push(node);
  }

  const directChildren = root.children ?? [];

  for (const child of directChildren) {
    const cls = classifyNode(child);
    if (cls !== "skip") {
      pushNode(cls, child);
    } else if (["FRAME", "GROUP", "SECTION", "COMPONENT", "INSTANCE"].includes(child.type)) {
      // 분류 안된 대형 컨테이너 → 한 단계 더 내려가서 탐색
      const box = child.absoluteBoundingBox;
      if (box && box.width >= 200 && box.height >= 200) {
        for (const grandchild of child.children ?? []) {
          const gcls = classifyNode(grandchild);
          if (gcls !== "skip") pushNode(gcls, grandchild);
        }
      }
    }
  }

  // 직접 자식에서 와이어프레임을 못 찾으면 루트 자체를 폴백
  if (result.wireframes.length === 0 && root.absoluteBoundingBox) {
    console.log("[figma-parse] fallback: using root as wireframe");
    result.wireframes.push(root);
  }

  // 순환 번호 패턴이 있으면 우선
  const circled = result.wireframes.filter(w => /[①②③④⑤⑥⑦⑧⑨⑩]/.test(w.name));
  if (circled.length > 0) result.wireframes = circled;

  // X좌표 기준 정렬
  result.wireframes.sort((a, b) => (a.absoluteBoundingBox?.x ?? 0) - (b.absoluteBoundingBox?.x ?? 0));

  return result;
}

// ── 모달 판별 ─────────────────────────────────────────────────────────────────

function isModalFrame(node: FigmaNode, parentBox?: FigmaBox): boolean {
  if (/팝업|모달|modal|alert|popup|bottom.?sheet|dialog|overlay|dim/i.test(node.name)) return true;
  const box = node.absoluteBoundingBox;
  if (!box || !parentBox) return false;
  const isSmall = box.width < parentBox.width * 0.85 && box.height < parentBox.height * 0.85;
  if (!isSmall) return false;
  const allTexts = allTextNodes(node).map(n => (n.characters ?? "").trim().toLowerCase());
  return allTexts.filter(t => /^(확인|취소|닫기|close|cancel|ok|완료|적용|다음|이전|저장)$/.test(t)).length >= 1;
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

  // ── Phase 1 (0–40%): 노드 트리 조회 및 분류 ─────────────────────────────

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

  // 직접 자식 분류
  const classified = classifyChildren(root);
  const { wireframes: wfNodes, descNodes, policyNodes, uiNoteNodes, considerNodes } = classified;

  console.log("[figma-parse] wireframes:", wfNodes.map(w => `"${w.name}" ${w.absoluteBoundingBox?.width}x${w.absoluteBoundingBox?.height}`));
  console.log("[figma-parse] descNodes:", descNodes.map(n => `"${n.name}"`));
  console.log("[figma-parse] policyNodes:", policyNodes.map(n => `"${n.name}"`));
  console.log("[figma-parse] considerNodes:", considerNodes.map(n => `"${n.name}"`));

  // 모달 분리
  const rootBox = root.absoluteBoundingBox;
  const mainWfs = wfNodes.filter(w => !isModalFrame(w, rootBox ?? undefined));
  const modalWfs = wfNodes.filter(w => isModalFrame(w, rootBox ?? undefined));
  const allWfs = mainWfs.length > 0 ? [...mainWfs, ...modalWfs] : wfNodes;

  // ── Phase 2 (40–80%): 텍스트/표 구조화 ──────────────────────────────────

  // 디스크립션 계층 그룹 추출
  const descriptionGroups: DescGroup[] = descNodes.length > 0
    ? descNodes.flatMap(n => extractDescriptionGroups(n))
    : [];

  // 레거시 flat 배열 (backward compat)
  const descriptions: string[] = descriptionGroups.flatMap(g => [g.title, ...g.subItems.map(s => s.text)]).filter(Boolean);

  // 정책 텍스트
  const policyNote = policyNodes.map(n => extractAllText(n, /^정책$/)).filter(Boolean).join("\n\n");

  // UI 참고사항
  const uiNote = uiNoteNodes.map(n => extractAllText(n, /^(UI\s*참고사항|★\s*UI\s*참고사항)$/i)).filter(Boolean).join("\n\n");

  // 고려사항
  const considerationNote = considerNodes.map(n => extractAllText(n, /^(확인|고려사항|★\s*고려사항)$/i)).filter(Boolean).join("\n\n");

  // 표 데이터
  const tables: TableData[] = [...descNodes, ...policyNodes].flatMap(n => {
    const tbl = detectTable(n);
    return tbl ? [tbl] : [];
  });

  // ── Phase 3 (80–100%): 와이어프레임 이미지 export ────────────────────────

  type WireframeSection = {
    name: string; imageUrl: string; imageBase64: string; imageMimeType: string;
    badges: BadgeMark[]; isModal: boolean;
  };

  const sections: WireframeSection[] = allWfs.map(wf => ({
    name: wf.name,
    imageUrl: "", imageBase64: "", imageMimeType: "image/png",
    badges: extractBadges(wf),
    isModal: modalWfs.includes(wf),
  }));

  let exportError: string | null = null;

  if (allWfs.length > 0) {
    try {
      const exportIds = allWfs.map(w => encodeURIComponent(w.id)).join(",");
      const exportUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${exportIds}&format=png&scale=2`;
      console.log("[figma-parse] export URL:", exportUrl);

      const exportRes = await fetch(exportUrl, { headers: { "X-Figma-Token": FIGMA_TOKEN } });
      console.log("[figma-parse] export status:", exportRes.status);

      if (exportRes.ok) {
        const exportData = await exportRes.json();
        const imageUrls = exportData.images as Record<string, string | null>;

        const sb = createAdminClient();

        await Promise.all(allWfs.map(async (wf, i) => {
          const dashId = wf.id.replace(/:/g, "-");
          const imgUrl = imageUrls[wf.id] ?? imageUrls[dashId] ?? null;
          if (!imgUrl) return;
          try {
            const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(25000) });
            if (!imgRes.ok) return;
            const buf = await imgRes.arrayBuffer();
            const mimeType = imgRes.headers.get("content-type") ?? "image/png";
            const ext = mimeType.split("/")[1]?.split(";")[0] ?? "png";

            const storagePath = `figma/${fileKey}/${dashId}-${Date.now()}.${ext}`;
            const { error: upErr } = await sb.storage
              .from("wireframes")
              .upload(storagePath, Buffer.from(buf), { contentType: mimeType, upsert: true });

            if (upErr) {
              sections[i] = { ...sections[i], imageBase64: Buffer.from(buf).toString("base64"), imageMimeType: mimeType };
            } else {
              const { data: urlData } = sb.storage.from("wireframes").getPublicUrl(storagePath);
              sections[i] = { ...sections[i], imageUrl: urlData.publicUrl, imageMimeType: mimeType };
            }
          } catch (e) { console.error(`[figma-parse] img failed[${i}]:`, wf.name, e); }
        }));
      } else {
        const errBody = await exportRes.json().catch(() => ({}));
        exportError = `Figma export ${exportRes.status}: ${JSON.stringify(errBody)}`;
        console.error("[figma-parse]", exportError);
      }
    } catch (e) {
      exportError = String(e);
      console.error("[figma-parse] export failed:", e);
    }
  }

  return NextResponse.json({
    // 단건 호환 필드
    wireframeName: sections[0]?.name ?? "",
    wireframeCount: sections.length,
    imageUrl: sections[0]?.imageUrl ?? "",
    imageBase64: sections[0]?.imageBase64 ?? "",
    imageMimeType: sections[0]?.imageMimeType ?? "image/png",
    // 우측 패널 데이터 (계층형 우선, flat 하위 호환)
    descriptionGroups,
    descriptions,
    policyNote,
    uiNote,
    considerationNote,
    tables,
    // 전체 섹션 (벌크 임포트)
    sections,
    _debug: {
      wireframesFound: allWfs.length,
      wireframeNames: allWfs.map(w => `${w.name} (${w.absoluteBoundingBox?.width}x${w.absoluteBoundingBox?.height})`),
      descCount: descNodes.length,
      policyCount: policyNodes.length,
      considerCount: considerNodes.length,
      exportError,
    },
  });
}
