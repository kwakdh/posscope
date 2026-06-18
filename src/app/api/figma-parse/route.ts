import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const FIGMA_TOKEN = process.env.FIGMA_ACCESS_TOKEN;

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface FigmaBox { x: number; y: number; width: number; height: number }
interface FigmaFill { type: string; color?: { r: number; g: number; b: number; a?: number } }
interface FigmaNode {
  id: string; name: string; type: string;
  visible?: boolean;
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

// ── 텍스트 유틸: 반복문 DFS (visible:false 즉시 스킵) ────────────────────────

function allTextNodes(node: FigmaNode): FigmaNode[] {
  const result: FigmaNode[] = [];
  const stack: FigmaNode[] = [node];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur.visible === false) continue;
    if (cur.type === "TEXT") {
      result.push(cur);
    } else {
      const ch = cur.children;
      if (ch) for (let i = ch.length - 1; i >= 0; i--) stack.push(ch[i]);
    }
  }
  return result;
}

function extractAllText(node: FigmaNode, skipPattern?: RegExp): string {
  return allTextNodes(node)
    .map(n => n.characters?.trim() ?? "")
    .filter(t => t && !/^[-─—━⸻]+$/.test(t) && !(skipPattern?.test(t) ?? false))
    .join("\n");
}

// ── 배지 감지 (반복문 DFS) ────────────────────────────────────────────────────

function extractBadges(wfNode: FigmaNode, parentNode?: FigmaNode): BadgeMark[] {
  const box = wfNode.absoluteBoundingBox;
  if (!box || box.width === 0 || box.height === 0) return [];
  const wfBox = box; // 클로저 내 non-null 보장
  const results: BadgeMark[] = [];

  function parsePin(name: string): string | null {
    const m = name.trim().match(/^(?:No\.?\s*|#|Badge\s*|callout[-\s]*|항목\s*|pin\s*)?(\d+(?:-\d+)?)$/i);
    return m ? m[1] : null;
  }

  function hasRedFill(node: FigmaNode): boolean {
    return (node.fills ?? []).some(f => {
      if (f.type !== "SOLID" || !f.color) return false;
      const { r, g, b } = f.color;
      return r > 0.55 && g < 0.45 && b < 0.45; // 빨강 계열만 허용
    });
  }

  function scanIterative(roots: FigmaNode[]) {
    const stack = [...roots].reverse();
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.visible === false) continue;
      const nb = node.absoluteBoundingBox;
      if (!nb) {
        const ch = node.children;
        if (ch) for (let i = ch.length - 1; i >= 0; i--) stack.push(ch[i]);
        continue;
      }
      if (node.type === "TEXT") continue;

      const isSmallEnough = nb.width <= 120 && nb.height <= 120;
      if (!isSmallEnough) {
        const ch = node.children;
        if (ch) for (let i = ch.length - 1; i >= 0; i--) stack.push(ch[i]);
        continue;
      }

      let pin = parsePin(node.name);
      if (pin === null) {
        const textContents = allTextNodes(node)
          .map(n => (n.characters ?? "").trim())
          .filter(t => /^\d+(?:-\d+)?$/.test(t));
        if (textContents.length === 1) pin = textContents[0];
      }

      if (pin !== null) {
        const isRed = hasRedFill(node) || (node.children ?? []).some(c => hasRedFill(c));
        if (isRed) {
          const cx = ((nb.x + nb.width / 2 - wfBox.x) / wfBox.width) * 100;
          const cy = ((nb.y + nb.height / 2 - wfBox.y) / wfBox.height) * 100;
          if (cx >= -5 && cx <= 105 && cy >= -5 && cy <= 105) {
            results.push({ id: node.id, pinNumber: pin, x: Math.max(0, Math.min(100, cx)), y: Math.max(0, Math.min(100, cy)) });
            continue;
          }
        }
      }

      const ch = node.children;
      if (ch) for (let i = ch.length - 1; i >= 0; i--) stack.push(ch[i]);
    }
  }

  // 1차: 와이어프레임 내부
  scanIterative(wfNode.children ?? []);

  // 2차: 부모의 형제 노드 (배지가 별도 레이어인 경우)
  if (results.length === 0 && parentNode) {
    const pad = 60;
    const nearSiblings = (parentNode.children ?? []).filter(s => {
      if (s.id === wfNode.id) return false;
      const sb = s.absoluteBoundingBox;
      if (!sb) return false;
      return sb.x < box.x + box.width + pad && sb.x + sb.width > box.x - pad &&
             sb.y < box.y + box.height + pad && sb.y + sb.height > box.y - pad;
    });
    scanIterative(nearSiblings);
  }

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
      const text = sorted.map(n => n.characters?.trim() ?? "").filter(Boolean).join(" ");
      if (text && !/^(\d+(?:-\d+)?)$/.test(text)) rawRows.push({ pin: String(++autoPin), text });
    }
  }

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

const WIREFRAME_NAME_RE = /화면|screen|홈|메인|키패드|설정|관리|현행|신규|before|after|keypad|home|main|[①②③④⑤⑥⑦⑧⑨⑩]/i;

function classifyNode(node: FigmaNode): NodeClass {
  const name = node.name.trim();
  const box = node.absoluteBoundingBox;

  if (["CONNECTOR", "ARROW", "LINE", "VECTOR", "STAR", "BOOLEAN_OPERATION"].includes(node.type)) return "skip";
  if (!["FRAME", "COMPONENT", "INSTANCE", "GROUP", "SECTION", "TEXT"].includes(node.type)) return "skip";
  if (!box || box.width < 80 || box.height < 80) return "skip";

  if (isVersionMarkupNode(node)) return "skip";

  if (/descriptions?\s*\/\s*policies?/i.test(name)) return "description";
  if (/^정책$|^\[정책\]/i.test(name))              return "policy";
  if (/UI\s*참고사항|★\s*UI/i.test(name))          return "uiNote";
  if (/고려사항|★\s*고려/i.test(name))             return "consideration";
  if (/★|☆/i.test(name))                           return "consideration";
  if (node.type === "TEXT") return "skip";

  const isPortrait  = box.height > box.width * 1.1;
  const isLandscape = box.width  > box.height * 1.3;

  if (isPortrait && box.height >= 300) return "wireframe";

  if (isLandscape || (!isPortrait && box.width >= 300)) {
    const texts = allTextNodes(node).map(n => (n.characters ?? "").trim()).filter(Boolean);
    if (texts.some(t => /descriptions?\s*\/\s*policies?/i.test(t))) return "description";
    if (texts.some(t => /^no\.?$/i.test(t)))                         return "description";
    if (texts.some(t => /^고려사항$|^참고사항$/i.test(t)))           return "consideration";
    if (texts.some(t => /^정책$/i.test(t)))                          return "policy";
    if (texts.some(t => /^UI\s*참고사항$/i.test(t)))                 return "uiNote";
    if (WIREFRAME_NAME_RE.test(name)) return "wireframe";
    if (box.width >= 600 && box.height >= 400) return "wireframe";
    return "skip";
  }

  return "skip";
}

// ── 자식 노드 분류 ────────────────────────────────────────────────────────────

type Classified = {
  wireframes: FigmaNode[];
  descNodes: FigmaNode[];
  policyNodes: FigmaNode[];
  uiNoteNodes: FigmaNode[];
  considerNodes: FigmaNode[];
};

function classifyChildren(root: FigmaNode): Classified {
  const result: Classified = { wireframes: [], descNodes: [], policyNodes: [], uiNoteNodes: [], considerNodes: [] };

  function pushNode(cls: NodeClass, node: FigmaNode) {
    if      (cls === "wireframe")      result.wireframes.push(node);
    else if (cls === "description")    result.descNodes.push(node);
    else if (cls === "policy")         result.policyNodes.push(node);
    else if (cls === "uiNote")         result.uiNoteNodes.push(node);
    else if (cls === "consideration")  result.considerNodes.push(node);
  }

  for (const child of (root.children ?? [])) {
    if (child.visible === false) continue;
    const cls = classifyNode(child);
    if (cls !== "skip") {
      pushNode(cls, child);
    } else if (["FRAME", "GROUP", "SECTION", "COMPONENT", "INSTANCE"].includes(child.type)) {
      const box = child.absoluteBoundingBox;
      if (box && box.width >= 200 && box.height >= 200) {
        for (const grandchild of (child.children ?? [])) {
          if (grandchild.visible === false) continue;
          const gcls = classifyNode(grandchild);
          if (gcls !== "skip") pushNode(gcls, grandchild);
        }
      }
    }
  }

  if (result.wireframes.length > 0 && root.type === "FRAME" && root.absoluteBoundingBox) {
    const rootBox = root.absoluteBoundingBox;
    if (isDeviceSizedScreen(rootBox)) {
      const rootArea = rootBox.width * rootBox.height;
      const allSubComponents = result.wireframes.every(wf => {
        const wfBox = wf.absoluteBoundingBox;
        return !wfBox || wfBox.width * wfBox.height < rootArea * 0.65;
      });
      if (allSubComponents) result.wireframes = [root];
    }
  }

  if (result.wireframes.length === 0 && root.absoluteBoundingBox) {
    result.wireframes.push(root);
  }

  const circled = result.wireframes.filter(w => /[①②③④⑤⑥⑦⑧⑨⑩]/.test(w.name));
  if (circled.length > 0) result.wireframes = circled;

  result.wireframes.sort((a, b) => (a.absoluteBoundingBox?.x ?? 0) - (b.absoluteBoundingBox?.x ?? 0));
  return result;
}

// ── 부모 섹션 ID 탐색 (depth=3, 타임아웃 2.5초) ──────────────────────────────

async function findParentSectionId(fileKey: string, targetNodeId: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.figma.com/v1/files/${fileKey}?depth=3`,
      { headers: { "X-Figma-Token": token }, signal: AbortSignal.timeout(2500) }
    );
    if (!res.ok) return null;
    const { document: doc } = await res.json() as {
      document: { id: string; type?: string; children?: unknown[] }
    };

    type Entry = { node: { id: string; type?: string; children?: unknown[] }; parentId: string | null; parentType: string | null };
    const queue: Entry[] = [{ node: doc, parentId: null, parentType: null }];
    while (queue.length > 0) {
      const { node, parentId, parentType } = queue.shift()!;
      if (node.id === targetNodeId) {
        if (!parentType || parentType === "DOCUMENT" || parentType === "PAGE") return null;
        return parentId;
      }
      for (const child of (node.children ?? []) as { id: string; type?: string; children?: unknown[] }[]) {
        queue.push({ node: child, parentId: node.id, parentType: node.type ?? null });
      }
    }
    return null;
  } catch { return null; }
}

// ── 디바이스 화면 크기 판별 ───────────────────────────────────────────────────

function isDeviceSizedScreen(box: FigmaBox): boolean {
  const isPortrait  = box.height > box.width * 1.1;
  const isLandscape = box.width  > box.height * 1.3;
  return (
    (isPortrait  && box.height >= 600 && box.width >= 300) ||
    (isLandscape && box.width >= 800 && box.width <= 2400 && box.height >= 500)
  );
}

// ── 모달 판별 ─────────────────────────────────────────────────────────────────

function isModalFrame(node: FigmaNode, parentBox?: FigmaBox): boolean {
  if (/팝업|모달|modal|alert|popup|bottom.?sheet|dialog|overlay|dim/i.test(node.name)) return true;
  const box = node.absoluteBoundingBox;
  if (!box || !parentBox) return false;
  if (!(box.width < parentBox.width * 0.85 && box.height < parentBox.height * 0.85)) return false;
  const allTexts = allTextNodes(node).map(n => (n.characters ?? "").trim().toLowerCase());
  return allTexts.some(t => /^(확인|취소|닫기|close|cancel|ok|완료|적용|다음|이전|저장)$/.test(t));
}

// ── 버전 마크업(빨간 수정범위 박스) 감지 ─────────────────────────────────────

function isVersionMarkupNode(node: FigmaNode): boolean {
  const hasRedFill = (node.fills ?? []).some(f => {
    if (f.type !== "SOLID" || !f.color) return false;
    const { r, g, b } = f.color;
    return r > 0.55 && g < 0.45 && b < 0.45 && r > g * 1.4 && r > b * 1.4;
  });
  if (!hasRedFill) return false;
  if (/수정\s*범위|v\.\s*\d+\.\d+\s*수정/i.test(node.name)) return true;
  return allTextNodes(node).some(n => /수정\s*범위|v\.\s*\d+\.\d+/i.test(n.characters ?? ""));
}

// ── 초록 포스트잇 감지 (반복문 BFS, visible:false 스킵) ──────────────────────

function hasGreenStickyFill(node: FigmaNode): boolean {
  return (node.fills ?? []).some(f => {
    if (f.type !== "SOLID" || !f.color) return false;
    const { r, g, b } = f.color;
    const greenness = g - Math.max(r, b);
    return g > r && g > b && (r + g + b) / 3 > 0.55 && greenness > 0.03 && g > 0.55;
  });
}

type StickyNote = { id: string; title: string; box: FigmaBox };

function findGreenStickyNotes(root: FigmaNode): StickyNote[] {
  const notes: StickyNote[] = [];
  const seen = new Set<string>();

  type QEntry = { node: FigmaNode; depth: number };
  const queue: QEntry[] = (root.children ?? []).map(c => ({ node: c, depth: 0 }));

  while (queue.length > 0) {
    const { node, depth } = queue.shift()!;
    if (depth > 3 || node.visible === false) continue;

    const box = node.absoluteBoundingBox;
    if (
      box && !seen.has(node.id) && !isDeviceSizedScreen(box) &&
      ["FRAME", "RECTANGLE", "GROUP", "COMPONENT", "INSTANCE"].includes(node.type) &&
      box.width <= 700 && box.height <= 450 && box.width >= 30 && box.height >= 18 &&
      hasGreenStickyFill(node)
    ) {
      const text = allTextNodes(node).map(n => (n.characters ?? "").trim()).filter(Boolean).join(" ").trim();
      if (text.length >= 1 && text.length <= 300) {
        notes.push({ id: node.id, title: text, box });
        seen.add(node.id);
        continue;
      }
    }

    if (depth < 2) {
      for (const child of (node.children ?? [])) queue.push({ node: child, depth: depth + 1 });
    }
  }

  return notes;
}

// ── 포스트잇 기반 섹션 그룹화 ────────────────────────────────────────────────

type FigmaSectionGroup = {
  sectionTitle: string; noteBox: FigmaBox;
  wireframeNodes: FigmaNode[]; descNodes: FigmaNode[];
  policyNodes: FigmaNode[]; uiNoteNodes: FigmaNode[]; considerNodes: FigmaNode[];
};

function centerDist(a: FigmaBox, b: FigmaBox): number {
  const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2, by = b.y + b.height / 2;
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

function groupByStickyNotes(
  notes: StickyNote[], wireframes: FigmaNode[], descNodes: FigmaNode[],
  policyNodes: FigmaNode[], uiNoteNodes: FigmaNode[], considerNodes: FigmaNode[],
): FigmaSectionGroup[] {
  const groups = new Map<string, FigmaSectionGroup>(
    notes.map(n => [n.id, {
      sectionTitle: n.title, noteBox: n.box,
      wireframeNodes: [], descNodes: [], policyNodes: [], uiNoteNodes: [], considerNodes: [],
    }])
  );

  function assignClosest(items: FigmaNode[], key: keyof FigmaSectionGroup) {
    for (const item of items) {
      const box = item.absoluteBoundingBox;
      if (!box) continue;
      let minD = Infinity, closestId = notes[0].id;
      for (const note of notes) {
        const d = centerDist(box, note.box);
        if (d < minD) { minD = d; closestId = note.id; }
      }
      (groups.get(closestId)![key] as FigmaNode[]).push(item);
    }
  }

  assignClosest(wireframes, "wireframeNodes");
  assignClosest(descNodes, "descNodes");
  assignClosest(policyNodes, "policyNodes");
  assignClosest(uiNoteNodes, "uiNoteNodes");
  assignClosest(considerNodes, "considerNodes");

  return [...groups.values()]
    .filter(g => g.wireframeNodes.length > 0 || g.descNodes.length > 0)
    .sort((a, b) => a.noteBox.y - b.noteBox.y);
}

// ── API 핸들러 ────────────────────────────────────────────────────────────────

const MAX_WIREFRAMES = 12;

export async function POST(req: NextRequest) {
  if (!FIGMA_TOKEN) return NextResponse.json({ error: "Figma 토큰이 설정되지 않았습니다." }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const { url } = body as { url?: string };
  if (!url) return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });

  const fileKeyMatch = url.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9_-]+)/);
  const nodeIdMatch  = url.match(/node-id=([^&]+)/);
  if (!fileKeyMatch) return NextResponse.json({ error: "올바른 피그마 URL이 아닙니다." }, { status: 400 });
  if (!nodeIdMatch)  return NextResponse.json({ error: "URL에 node-id가 필요합니다." }, { status: 400 });

  const fileKey = fileKeyMatch[1];
  const nodeId  = decodeURIComponent(nodeIdMatch[1]).replace(/-/g, ":");

  // ── Phase 1: 노드 트리 조회 ────────────────────────────────────────────────

  const nodesRes = await fetch(
    `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
    { headers: { "X-Figma-Token": FIGMA_TOKEN }, signal: AbortSignal.timeout(7000) }
  );
  if (!nodesRes.ok) {
    const err = await nodesRes.json().catch(() => ({}));
    return NextResponse.json({ error: err.message ?? "피그마 노드 조회 실패" }, { status: nodesRes.status });
  }

  const nodesData = await nodesRes.json();
  const root: FigmaNode | undefined = nodesData.nodes?.[nodeId]?.document;
  if (!root) return NextResponse.json({ error: "노드를 찾을 수 없습니다." }, { status: 404 });

  let classified  = classifyChildren(root);
  let effectiveRoot = root;

  // ── 단건 프레임 폴백 → 상위 섹션 자동 확장 ─────────────────────────────────
  const rootBbox = root.absoluteBoundingBox;
  const rootIsDeviceScreen = rootBbox ? isDeviceSizedScreen(rootBbox) : false;
  const isSingleFrameFallback =
    classified.wireframes.length === 1 &&
    classified.wireframes[0].id === root.id &&
    !rootIsDeviceScreen;

  if (isSingleFrameFallback) {
    const parentId = await findParentSectionId(fileKey, nodeId, FIGMA_TOKEN!);
    if (parentId) {
      const parentRes = await fetch(
        `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(parentId)}`,
        { headers: { "X-Figma-Token": FIGMA_TOKEN! }, signal: AbortSignal.timeout(5000) }
      );
      if (parentRes.ok) {
        const parentData = await parentRes.json();
        const parentNode: FigmaNode | undefined = parentData.nodes?.[parentId]?.document;
        if (parentNode) {
          const parentBox = parentNode.absoluteBoundingBox;
          if (parentBox && isDeviceSizedScreen(parentBox)) {
            effectiveRoot = parentNode;
            classified = { wireframes: [parentNode], descNodes: [], policyNodes: [], uiNoteNodes: [], considerNodes: [] };
          } else {
            const parentClassified = classifyChildren(parentNode);
            if (parentClassified.wireframes.length >= 1 && parentClassified.wireframes.length <= MAX_WIREFRAMES) {
              effectiveRoot = parentNode;
              classified = parentClassified;
            }
          }
        }
      }
    }
  }

  const { wireframes: rawWfNodes, descNodes, policyNodes, uiNoteNodes, considerNodes } = classified;
  const wfNodes = rawWfNodes.filter(w => !isVersionMarkupNode(w));

  // ── 초록 포스트잇 섹션 감지 ──────────────────────────────────────────────
  const greenNotes = findGreenStickyNotes(effectiveRoot);

  let figmaSectionGroups: FigmaSectionGroup[] = [];
  if (greenNotes.length >= 1) {
    figmaSectionGroups = groupByStickyNotes(greenNotes, wfNodes, descNodes, policyNodes, uiNoteNodes, considerNodes);
  }

  const rootBox = effectiveRoot.absoluteBoundingBox;
  const modalWfsSet = new Set<string>();
  let allWfs: FigmaNode[];

  if (figmaSectionGroups.length > 0) {
    allWfs = figmaSectionGroups.flatMap(g => g.wireframeNodes);
  } else {
    const mainWfs  = wfNodes.filter(w => !isModalFrame(w, rootBox ?? undefined));
    const modalWfs = wfNodes.filter(w =>  isModalFrame(w, rootBox ?? undefined));
    modalWfs.forEach(w => modalWfsSet.add(w.id));
    allWfs = mainWfs.length > 0 ? [...mainWfs, ...modalWfs] : wfNodes;
  }

  // 타임아웃 방지 상한
  if (allWfs.length > MAX_WIREFRAMES) allWfs = allWfs.slice(0, MAX_WIREFRAMES);

  // ── Phase 2: 텍스트/표 구조화 ────────────────────────────────────────────

  const descriptionGroups: DescGroup[] = descNodes.length > 0
    ? descNodes.flatMap(n => extractDescriptionGroups(n))
    : [];
  const descriptions = descriptionGroups.flatMap(g => [g.title, ...g.subItems.map(s => s.text)]).filter(Boolean);
  const policyNote       = policyNodes.map(n  => extractAllText(n, /^정책$/)).filter(Boolean).join("\n\n");
  const uiNote           = uiNoteNodes.map(n  => extractAllText(n, /^(UI\s*참고사항|★\s*UI\s*참고사항)$/i)).filter(Boolean).join("\n\n");
  const considerationNote = considerNodes.map(n => extractAllText(n, /^(확인|고려사항|★\s*고려사항)$/i)).filter(Boolean).join("\n\n");
  const tables: TableData[] = [...descNodes, ...policyNodes].flatMap(n => {
    const tbl = detectTable(n); return tbl ? [tbl] : [];
  });

  // ── Phase 3: 이미지 export ────────────────────────────────────────────────

  type WireframeSection = {
    name: string; imageUrl: string; imageBase64: string; imageMimeType: string;
    badges: BadgeMark[]; isModal: boolean;
  };

  const sections: WireframeSection[] = allWfs.map(wf => ({
    name: wf.name, imageUrl: "", imageBase64: "", imageMimeType: "image/png",
    badges: extractBadges(wf, effectiveRoot),
    isModal: modalWfsSet.has(wf.id),
  }));

  const nodeIdToIdx = new Map<string, number>(allWfs.map((wf, i) => [wf.id, i]));
  let exportError: string | null = null;

  if (allWfs.length > 0) {
    try {
      const exportIds = allWfs.map(w => encodeURIComponent(w.id)).join(",");
      const exportRes = await fetch(
        `https://api.figma.com/v1/images/${fileKey}?ids=${exportIds}&format=png&scale=1`,
        { headers: { "X-Figma-Token": FIGMA_TOKEN }, signal: AbortSignal.timeout(7000) }
      );

      if (exportRes.ok) {
        const exportData = await exportRes.json();
        const imageUrls = exportData.images as Record<string, string | null>;
        const sb = createAdminClient();

        await Promise.all(allWfs.map(async (wf, i) => {
          const dashId = wf.id.replace(/:/g, "-");
          const imgUrl = imageUrls[wf.id] ?? imageUrls[dashId] ?? null;
          if (!imgUrl) return;
          try {
            const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(7000) });
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
          } catch { /* 개별 이미지 실패 시 스킵 */ }
        }));
      } else {
        const errBody = await exportRes.json().catch(() => ({}));
        exportError = `Figma export ${exportRes.status}: ${JSON.stringify(errBody)}`;
      }
    } catch (e) {
      exportError = String(e);
    }
  }

  // ── 섹션 모드 결과 구성 ───────────────────────────────────────────────────
  const figmaSectionsResult = figmaSectionGroups.length > 0
    ? figmaSectionGroups.map(grp => ({
        sectionTitle: grp.sectionTitle,
        wireframes: grp.wireframeNodes.map(wf => {
          const idx = nodeIdToIdx.get(wf.id);
          return idx !== undefined ? sections[idx] : {
            name: wf.name, imageUrl: "", imageBase64: "", imageMimeType: "image/png",
            badges: [] as BadgeMark[], isModal: false,
          };
        }),
        descriptionGroups: grp.descNodes.flatMap(n => extractDescriptionGroups(n)),
        policyNote:         grp.policyNodes.map(n  => extractAllText(n, /^정책$/)).filter(Boolean).join("\n\n"),
        uiNote:             grp.uiNoteNodes.map(n  => extractAllText(n, /^(UI\s*참고사항|★\s*UI\s*참고사항)$/i)).filter(Boolean).join("\n\n"),
        considerationNote:  grp.considerNodes.map(n => extractAllText(n, /^(확인|고려사항|★\s*고려사항)$/i)).filter(Boolean).join("\n\n"),
      }))
    : [];

  return NextResponse.json({
    figmaSections: figmaSectionsResult,
    wireframeName:  sections[0]?.name ?? "",
    wireframeCount: sections.length,
    imageUrl:       sections[0]?.imageUrl ?? "",
    imageBase64:    sections[0]?.imageBase64 ?? "",
    imageMimeType:  sections[0]?.imageMimeType ?? "image/png",
    descriptionGroups, descriptions,
    policyNote, uiNote, considerationNote, tables,
    sections,
    _debug: {
      greenNotesFound:    greenNotes.length,
      greenNoteTitles:    greenNotes.map(n => n.title),
      figmaSectionsCount: figmaSectionsResult.length,
      wireframesFound:    allWfs.length,
      wireframeNames:     allWfs.map(w => `${w.name} (${w.absoluteBoundingBox?.width}x${w.absoluteBoundingBox?.height})`),
      descCount:          descNodes.length,
      policyCount:        policyNodes.length,
      considerCount:      considerNodes.length,
      exportError,
    },
  });
}
