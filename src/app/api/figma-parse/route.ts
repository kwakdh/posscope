import { NextRequest, NextResponse } from "next/server";

const FIGMA_TOKEN = process.env.FIGMA_ACCESS_TOKEN;

interface FigmaBox { x: number; y: number; width: number; height: number }
interface FigmaNode {
  id: string; name: string; type: string;
  characters?: string;
  absoluteBoundingBox?: FigmaBox;
  children?: FigmaNode[];
}

function allTextNodes(node: FigmaNode): FigmaNode[] {
  if (node.type === "TEXT") return [node];
  return (node.children ?? []).flatMap(allTextNodes);
}

function extractText(node: FigmaNode, skipPattern?: RegExp): string {
  return allTextNodes(node)
    .map(n => n.characters?.trim() ?? "")
    .filter(t => {
      if (!t || /^[-─—━⸻]+$/.test(t)) return false;
      if (skipPattern?.test(t)) return false;
      return true;
    })
    .join("\n");
}

const ROW_GAP_THRESHOLD = 30;

function extractDescriptions(frame: FigmaNode): string[] {
  const box = frame.absoluteBoundingBox;
  const texts = allTextNodes(frame);

  const relX = box ? (n: FigmaNode) => (n.absoluteBoundingBox?.x ?? 0) - box.x : () => 999;
  const absY = (n: FigmaNode) => n.absoluteBoundingBox?.y ?? 0;

  const rightTexts = texts
    .filter(n => {
      const rx = relX(n);
      if (box && rx < 50) return false;
      const c = (n.characters ?? "").trim();
      return c.length > 0
        && !/^(No\.?|Descriptions?\s*\/\s*Policies?)$/i.test(c)
        && !/^[-─—━⸻]+$/.test(c);
    })
    .sort((a, b) => absY(a) - absY(b));

  if (rightTexts.length === 0) return [];

  const rows: string[] = [];
  let currentGroup: string[] = [rightTexts[0].characters!.trim()];

  for (let i = 1; i < rightTexts.length; i++) {
    const gap = absY(rightTexts[i]) - absY(rightTexts[i - 1]);
    if (gap > ROW_GAP_THRESHOLD) {
      if (currentGroup.length) rows.push(currentGroup.join("\n"));
      currentGroup = [];
    }
    const t = rightTexts[i].characters?.trim();
    if (t) currentGroup.push(t);
  }
  if (currentGroup.length) rows.push(currentGroup.join("\n"));
  return rows;
}

type BadgeMark = { id: string; number: number; x: number; y: number };

function extractBadges(wireframeNode: FigmaNode): BadgeMark[] {
  const box = wireframeNode.absoluteBoundingBox;
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
      const numTexts = allTextNodes(node)
        .map(n => (n.characters ?? "").trim())
        .filter(t => /^\d+$/.test(t));
      if (numTexts.length === 1) num = parseInt(numTexts[0], 10);
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

  (wireframeNode.children ?? []).forEach(scan);

  const seen = new Set<number>();
  return results
    .sort((a, b) => a.number - b.number)
    .filter(b => { if (seen.has(b.number)) return false; seen.add(b.number); return true; });
}

function isLargeUIFrame(node: FigmaNode): boolean {
  if (!["FRAME", "COMPONENT", "INSTANCE"].includes(node.type)) return false;
  const box = node.absoluteBoundingBox;
  if (!box || box.width < 300 || box.height < 400) return false;
  if (/descriptions?|policies|정책|고려사항|참고사항|tag|connector|slice|vector|group\s*\d/i.test(node.name)) return false;
  return true;
}

type FoundFrames = {
  wireframes: FigmaNode[];
  description: FigmaNode | null;
  policy: FigmaNode | null;
  uiNote: FigmaNode | null;
  consideration: FigmaNode | null;
};

function walkTree(node: FigmaNode, found: FoundFrames) {
  const name = node.name.trim();

  if (/descriptions?\s*\/\s*policies?/i.test(name)) { found.description ??= node; return; }
  if (/^정책$|^\[정책\]/.test(name) || name === "정책") { found.policy ??= node; return; }
  if (/UI\s*참고사항|UI팀\s*참고|★\s*UI/i.test(name)) { found.uiNote ??= node; return; }
  if (/^확인$|고려사항|★\s*고려/i.test(name)) { found.consideration ??= node; return; }

  if (isLargeUIFrame(node)) {
    found.wireframes.push(node);
    // continue recursing — circled children (①②③) may be nested inside a larger parent frame
  }

  (node.children ?? []).forEach(child => walkTree(child, found));
}

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

  const found: FoundFrames = { wireframes: [], description: null, policy: null, uiNote: null, consideration: null };
  walkTree(root, found);

  // Prefer circled-number frames (①②③...) — these are the main screen wireframes
  const circled = found.wireframes.filter(w => /[①②③④⑤⑥⑦⑧⑨⑩]/.test(w.name));
  if (circled.length > 0) found.wireframes = circled;
  found.wireframes.sort((a, b) => (a.absoluteBoundingBox?.x ?? 0) - (b.absoluteBoundingBox?.x ?? 0));

  const descriptions = found.description ? extractDescriptions(found.description) : [];
  const policyNote = found.policy ? extractText(found.policy, /^정책$/) : "";
  const uiNote = found.uiNote ? extractText(found.uiNote, /^(UI\s*참고사항|★\s*UI\s*참고사항)$/i) : "";
  const considerationNote = found.consideration ? extractText(found.consideration, /^(확인|고려사항|★\s*고려사항)$/i) : "";

  // Batch export all wireframe images in a single Figma API call
  type WireframeSection = { name: string; imageBase64: string; imageMimeType: string; badges: BadgeMark[] };
  const sections: WireframeSection[] = found.wireframes.map(wf => ({
    name: wf.name, imageBase64: "", imageMimeType: "image/png", badges: extractBadges(wf),
  }));

  let exportError: string | null = null;

  if (found.wireframes.length > 0) {
    try {
      // Figma API expects raw node IDs (e.g. "123:456") separated by commas
      const exportIds = found.wireframes.map(w => w.id).join(",");
      const exportUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${exportIds}&format=png&scale=2`;
      const exportRes = await fetch(exportUrl, { headers: { "X-Figma-Token": FIGMA_TOKEN } });

      if (exportRes.ok) {
        const exportData = await exportRes.json();
        const imageUrls = exportData.images as Record<string, string>;

        // Download all images in parallel
        await Promise.all(found.wireframes.map(async (wf, i) => {
          const imgUrl = imageUrls[wf.id] ?? imageUrls[wf.id.replace(":", "-")];
          if (!imgUrl) return;
          try {
            const imgRes = await fetch(imgUrl);
            if (!imgRes.ok) return;
            const buf = await imgRes.arrayBuffer();
            sections[i] = {
              name: wf.name,
              imageBase64: Buffer.from(buf).toString("base64"),
              imageMimeType: imgRes.headers.get("content-type") ?? "image/png",
              badges: sections[i].badges,
            };
          } catch (e) {
            console.error("Image download failed:", wf.name, e);
          }
        }));
      } else {
        const errBody = await exportRes.json().catch(() => ({}));
        exportError = `Figma export API ${exportRes.status}: ${JSON.stringify(errBody)}`;
        console.error("Figma export failed:", exportError);
      }
    } catch (e) {
      exportError = String(e);
      console.error("Batch image export failed:", e);
    }
  }

  return NextResponse.json({
    // Backwards compat (single wireframe mode)
    wireframeName: sections[0]?.name ?? "",
    wireframeCount: sections.length,
    imageBase64: sections[0]?.imageBase64 ?? "",
    imageMimeType: sections[0]?.imageMimeType ?? "image/png",
    // Shared content
    descriptions,
    policyNote,
    uiNote,
    considerationNote,
    // All wireframes (for bulk import)
    sections,
    // Debug info
    _debug: {
      wireframesFound: found.wireframes.length,
      wireframeNames: found.wireframes.map(w => ({ name: w.name, id: w.id, w: w.absoluteBoundingBox?.width, h: w.absoluteBoundingBox?.height })),
      exportError,
    },
  });
}
