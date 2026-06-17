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

// parentNode: 피그마에서 배지가 와이어프레임 외부(형제 레이어)에 있는 패턴 대응용
function extractBadges(wfNode: FigmaNode, parentNode?: FigmaNode): BadgeMark[] {
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
        // 약간의 여유(±5%)를 두고 와이어프레임 범위 내 배지만 포함
        if (cx >= -5 && cx <= 105 && cy >= -5 && cy <= 105) {
          results.push({ id: node.id, pinNumber: pin, x: Math.max(0, Math.min(100, cx)), y: Math.max(0, Math.min(100, cy)) });
          return;
        }
      }
    }

    (node.children ?? []).forEach(scan);
  }

  // 1차: 와이어프레임 내부 자식 스캔
  (wfNode.children ?? []).forEach(scan);

  // 2차: 내부에서 배지를 못 찾은 경우, 부모의 형제 노드 중 이 와이어프레임과
  //      겹치는 노드를 스캔 (배지가 별도 annotation 레이어에 있는 패턴 대응)
  if (results.length === 0 && parentNode) {
    const pad = 60; // 약간의 여유 margin (픽셀)
    for (const sibling of (parentNode.children ?? [])) {
      if (sibling.id === wfNode.id) continue;
      const sb = sibling.absoluteBoundingBox;
      if (!sb) continue;
      const overlapsX = sb.x < box.x + box.width + pad && sb.x + sb.width > box.x - pad;
      const overlapsY = sb.y < box.y + box.height + pad && sb.y + sb.height > box.y - pad;
      if (overlapsX && overlapsY) {
        scan(sibling);
      }
    }
  }

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

  // 빨간 수정범위 마크업 필터 (v.0.x 수정범위 박스 등)
  if (isVersionMarkupNode(node)) return "skip";

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

  // ── 루트가 디바이스 화면 크기인데 찾은 wireframe들이 전부 그 하위 컴포넌트인 경우 →
  //    루트 자체를 wireframe으로 사용 (키패드·버튼 등 서브 컴포넌트가 wireframe으로 잘못 분류되는 버그 방지)
  if (result.wireframes.length > 0 && root.type === "FRAME" && root.absoluteBoundingBox) {
    const rootBox = root.absoluteBoundingBox;
    if (isDeviceSizedScreen(rootBox)) {
      const rootArea = rootBox.width * rootBox.height;
      const allSubComponents = result.wireframes.every(wf => {
        const wfBox = wf.absoluteBoundingBox;
        if (!wfBox) return true;
        return wfBox.width * wfBox.height < rootArea * 0.65;
      });
      if (allSubComponents) {
        result.wireframes = [root];
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

// ── 부모 섹션 ID 탐색 (단건 URL → 상위 섹션 자동 확장) ─────────────────────

async function findParentSectionId(fileKey: string, targetNodeId: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.figma.com/v1/files/${fileKey}?depth=6`,
      { headers: { "X-Figma-Token": token }, signal: AbortSignal.timeout(20000) }
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
  const isPortrait = box.height > box.width * 1.1;
  const isLandscape = box.width > box.height * 1.3;
  return (
    (isPortrait && box.height >= 600 && box.width >= 300) ||
    (isLandscape && box.width >= 800 && box.width <= 2400 && box.height >= 500)
  );
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

// ── 버전 마크업(빨간 수정범위 박스) 감지 ─────────────────────────────────────

function isVersionMarkupNode(node: FigmaNode): boolean {
  const fills = node.fills ?? [];
  const hasRedFill = fills.some(f => {
    if (f.type !== "SOLID" || !f.color) return false;
    const { r, g, b } = f.color;
    return r > 0.55 && g < 0.45 && b < 0.45 && r > g * 1.4 && r > b * 1.4;
  });
  if (!hasRedFill) return false;
  const nameHit = /수정\s*범위|v\.\s*\d+\.\d+\s*수정/i.test(node.name);
  const textHit = allTextNodes(node).some(n => /수정\s*범위|v\.\s*\d+\.\d+/i.test(n.characters ?? ""));
  return nameHit || textHit;
}

// ── 초록 포스트잇(Green Sticky Note) 감지 ────────────────────────────────────

function hasGreenStickyFill(node: FigmaNode): boolean {
  return (node.fills ?? []).some(f => {
    if (f.type !== "SOLID" || !f.color) return false;
    const { r, g, b } = f.color;
    // 연녹색 계열 (#E2F2D1 = 0.886/0.949/0.820 등)
    // 녹색 채널이 r·b보다 지배적 + 전체적으로 밝음
    const isGreenDominant = g > r && g > b;
    const isBright = (r + g + b) / 3 > 0.55;
    const greenness = g - Math.max(r, b);
    return isGreenDominant && isBright && greenness > 0.03 && g > 0.55;
  });
}

type StickyNote = { id: string; title: string; box: FigmaBox };

function findGreenStickyNotes(root: FigmaNode): StickyNote[] {
  const notes: StickyNote[] = [];
  const seen = new Set<string>();

  function scan(node: FigmaNode, depth: number) {
    if (depth > 3) return;
    const box = node.absoluteBoundingBox;
    if (!box) {
      if (depth < 2) (node.children ?? []).forEach(c => scan(c, depth + 1));
      return;
    }
    // 포스트잇 조건: 디바이스 화면 크기가 아님 + 적당한 크기 + 녹색 fill + 텍스트 있음
    const isReasonableSize = box.width <= 700 && box.height <= 450;
    const notTiny = box.width >= 30 && box.height >= 18;
    if (
      isReasonableSize && notTiny &&
      !seen.has(node.id) &&
      !isDeviceSizedScreen(box) &&
      ["FRAME", "RECTANGLE", "GROUP", "COMPONENT", "INSTANCE"].includes(node.type) &&
      hasGreenStickyFill(node)
    ) {
      const text = allTextNodes(node)
        .map(n => (n.characters ?? "").trim()).filter(Boolean).join(" ").trim();
      if (text.length >= 1 && text.length <= 300) {
        notes.push({ id: node.id, title: text, box });
        seen.add(node.id);
        return; // 내부 재탐색 안 함
      }
    }
    if (depth < 2) (node.children ?? []).forEach(c => scan(c, depth + 1));
  }

  (root.children ?? []).forEach(c => scan(c, 0));
  return notes;
}

// ── 포스트잇 기반 섹션 그룹화 ────────────────────────────────────────────────

type FigmaSectionGroup = {
  sectionTitle: string;
  noteBox: FigmaBox;
  wireframeNodes: FigmaNode[];
  descNodes: FigmaNode[];
  policyNodes: FigmaNode[];
  uiNoteNodes: FigmaNode[];
  considerNodes: FigmaNode[];
};

function centerDist(a: FigmaBox, b: FigmaBox): number {
  const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2, by = b.y + b.height / 2;
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

function groupByStickyNotes(
  notes: StickyNote[],
  wireframes: FigmaNode[],
  descNodes: FigmaNode[],
  policyNodes: FigmaNode[],
  uiNoteNodes: FigmaNode[],
  considerNodes: FigmaNode[],
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
  let classified = classifyChildren(root);
  let effectiveRoot = root;

  // ── 단건 프레임 폴백 감지 → 상위 섹션 자동 확장 ────────────────────────
  const rootBbox = root.absoluteBoundingBox;
  // classifyChildren 폴백 = root 자체가 유일한 와이어프레임 → 상위 섹션으로 확장 시도
  const isSingleFrameFallback =
    classified.wireframes.length === 1 &&
    classified.wireframes[0].id === root.id;

  if (isSingleFrameFallback) {
    console.log("[figma-parse] single-frame fallback detected, searching for parent section...");
    const parentId = await findParentSectionId(fileKey, nodeId, FIGMA_TOKEN!);
    if (parentId) {
      console.log("[figma-parse] found parent section:", parentId);
      const parentRes = await fetch(
        `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(parentId)}`,
        { headers: { "X-Figma-Token": FIGMA_TOKEN! }, signal: AbortSignal.timeout(30000) }
      );
      if (parentRes.ok) {
        const parentData = await parentRes.json();
        const parentNode: FigmaNode | undefined = parentData.nodes?.[parentId]?.document;
        if (parentNode) {
          const parentBox = parentNode.absoluteBoundingBox;

          // 부모 자체가 디바이스 화면 크기(POS / 모바일)이면 그대로 사용
          if (parentBox && isDeviceSizedScreen(parentBox)) {
            console.log("[figma-parse] parent IS a device screen, using directly:", parentNode.name, `${parentBox.width}x${parentBox.height}`);
            effectiveRoot = parentNode;
            classified = {
              wireframes: [parentNode],
              descNodes: [], policyNodes: [], uiNoteNodes: [], considerNodes: [],
            };
          } else {
            // 부모가 컨테이너 섹션인 경우 → 자녀 분류
            const parentClassified = classifyChildren(parentNode);
            if (parentClassified.wireframes.length >= 1 && parentClassified.wireframes.length <= 30) {
              console.log("[figma-parse] expanded to parent:", parentClassified.wireframes.length, "wireframes");
              effectiveRoot = parentNode;
              classified = parentClassified;
            }
          }
        }
      }
    }
  }

  const { wireframes: rawWfNodes, descNodes, policyNodes, uiNoteNodes, considerNodes } = classified;

  // 빨간 수정범위 마크업 필터 (classifyNode에서도 걸러지지만 이중 보호)
  const wfNodes = rawWfNodes.filter(w => !isVersionMarkupNode(w));

  console.log("[figma-parse] wireframes:", wfNodes.map(w => `"${w.name}" ${w.absoluteBoundingBox?.width}x${w.absoluteBoundingBox?.height}`));
  console.log("[figma-parse] descNodes:", descNodes.map(n => `"${n.name}"`));
  console.log("[figma-parse] policyNodes:", policyNodes.map(n => `"${n.name}"`));

  // ── 초록 포스트잇 섹션 감지 ──────────────────────────────────────────────
  const greenNotes = findGreenStickyNotes(effectiveRoot);
  console.log("[figma-parse] green notes:", greenNotes.map(n => `"${n.title}"`));

  let figmaSectionGroups: FigmaSectionGroup[] = [];
  if (greenNotes.length >= 1) {
    figmaSectionGroups = groupByStickyNotes(
      greenNotes, wfNodes, descNodes, policyNodes, uiNoteNodes, considerNodes
    );
    console.log("[figma-parse] section groups:", figmaSectionGroups.map(g =>
      `"${g.sectionTitle}" (wf:${g.wireframeNodes.length} desc:${g.descNodes.length})`
    ));
  }

  // ── allWfs: 섹션 모드면 섹션별 wireframe 합산, 아니면 기존 모달분리 ────────
  const rootBox = effectiveRoot.absoluteBoundingBox;
  const modalWfsSet = new Set<string>();
  let allWfs: FigmaNode[];

  if (figmaSectionGroups.length > 0) {
    allWfs = figmaSectionGroups.flatMap(g => g.wireframeNodes);
  } else {
    const mainWfs = wfNodes.filter(w => !isModalFrame(w, rootBox ?? undefined));
    const modalWfs = wfNodes.filter(w => isModalFrame(w, rootBox ?? undefined));
    modalWfs.forEach(w => modalWfsSet.add(w.id));
    allWfs = mainWfs.length > 0 ? [...mainWfs, ...modalWfs] : wfNodes;
  }

  // ── Phase 2 (40–80%): 텍스트/표 구조화 (non-sectioned fallback용) ─────────

  const descriptionGroups: DescGroup[] = descNodes.length > 0
    ? descNodes.flatMap(n => extractDescriptionGroups(n))
    : [];
  const descriptions: string[] = descriptionGroups.flatMap(g => [g.title, ...g.subItems.map(s => s.text)]).filter(Boolean);
  const policyNote = policyNodes.map(n => extractAllText(n, /^정책$/)).filter(Boolean).join("\n\n");
  const uiNote = uiNoteNodes.map(n => extractAllText(n, /^(UI\s*참고사항|★\s*UI\s*참고사항)$/i)).filter(Boolean).join("\n\n");
  const considerationNote = considerNodes.map(n => extractAllText(n, /^(확인|고려사항|★\s*고려사항)$/i)).filter(Boolean).join("\n\n");
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
    badges: extractBadges(wf, effectiveRoot),
    isModal: modalWfsSet.has(wf.id),
  }));

  // nodeId → section index 맵 (이미지 배치 후 figmaSections 구성에 사용)
  const nodeIdToIdx = new Map<string, number>(allWfs.map((wf, i) => [wf.id, i]));

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

  // ── 섹션 모드: figmaSections 구성 ────────────────────────────────────────
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
        policyNote: grp.policyNodes.map(n => extractAllText(n, /^정책$/)).filter(Boolean).join("\n\n"),
        uiNote: grp.uiNoteNodes.map(n => extractAllText(n, /^(UI\s*참고사항|★\s*UI\s*참고사항)$/i)).filter(Boolean).join("\n\n"),
        considerationNote: grp.considerNodes.map(n => extractAllText(n, /^(확인|고려사항|★\s*고려사항)$/i)).filter(Boolean).join("\n\n"),
      }))
    : [];

  return NextResponse.json({
    // 초록 포스트잇 섹션 결과 (있을 때만 non-empty)
    figmaSections: figmaSectionsResult,
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
    // 전체 섹션 (벌크 임포트 fallback)
    sections,
    _debug: {
      greenNotesFound: greenNotes.length,
      greenNoteTitles: greenNotes.map(n => n.title),
      figmaSectionsCount: figmaSectionsResult.length,
      wireframesFound: allWfs.length,
      wireframeNames: allWfs.map(w => `${w.name} (${w.absoluteBoundingBox?.width}x${w.absoluteBoundingBox?.height})`),
      descCount: descNodes.length,
      policyCount: policyNodes.length,
      considerCount: considerNodes.length,
      exportError,
    },
  });
}
