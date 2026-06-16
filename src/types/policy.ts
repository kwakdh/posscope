// ── 공유 데이터 타입 ──────────────────────────────────────────────────────────

export type PolicyMode = "image" | "figma" | "ai";

/** 이미지 위 번호 배지 또는 바운딩 박스 */
export type BadgeMark = {
  id: string;
  number: number;
  x: number;   // % (0~100) of wireframe width
  y: number;   // % (0~100) of wireframe height
  w?: number;  // % width  (바운딩 박스일 때만)
  h?: number;  // % height (바운딩 박스일 때만)
};

/** N:1 구조의 와이어프레임 항목 */
export type WireframeItem = {
  id: string;
  url: string | null;      // Storage public URL
  name: string;
  badges: BadgeMark[];
  isModal: boolean;        // true면 팝업/모달 처리
  modalFor: string | null; // 어느 WireframeItem 위에 올라가는 모달인지 (ID)
  order: number;
};

/** 와이어프레임 사이의 화면 흐름 */
export type FlowStep = {
  id: string;
  from: string;   // WireframeItem.id
  to: string;     // WireframeItem.id
  label: string;  // "Step 1", "로그인 성공" 등
};

/** 우측 설명 영역 표(Table) */
export type TableData = {
  id: string;
  caption: string;
  headers: string[];
  rows: string[][];
};

/** AI 모드 - 생성된 HTML 화면 */
export type AIScreen = {
  id: string;
  name: string;
  html: string;
  order: number;
  flowTo: string[]; // 다음으로 이동할 AIScreen.id 배열
};

/** 정책/기획서 메인 데이터 (DB policies 테이블 row) */
export type Policy = {
  id: string;
  item_type: string;
  item_id: string;
  kind: string;           // 탭 ID ("current" | "proposal" | custom UUID)
  title: string;
  mode: PolicyMode;
  // ── N:1 와이어프레임 ──
  wireframes: WireframeItem[];
  flow_steps: FlowStep[];
  // ── 우측 설명 영역 ──
  description_items: string[];
  policy_note: string;
  ui_note: string;
  consideration_note: string;
  tables: TableData[];
  // ── AI 모드 ──
  ai_screens: AIScreen[];
  // ── 레거시 (하위 호환) ──
  wireframe_url: string | null;
  image_badges: BadgeMark[];
  // ── 메타 ──
  sort_order: number;
  author_name: string | null;
  updated_at: string | null;
};

/** DB row를 클라이언트 Policy 타입으로 정규화 (레거시 단일 이미지 → wireframes 배열) */
export function normalizePolicy(raw: Record<string, unknown>): Policy {
  const p = raw as Policy;
  let wireframes: WireframeItem[] = Array.isArray(p.wireframes) && p.wireframes.length > 0
    ? p.wireframes
    : p.wireframe_url
      ? [{
          id: `legacy-${p.id}`,
          url: p.wireframe_url,
          name: p.title || "화면",
          badges: Array.isArray(p.image_badges) ? p.image_badges : [],
          isModal: false,
          modalFor: null,
          order: 0,
        }]
      : [];

  return {
    ...p,
    mode: (p.mode as PolicyMode) || "image",
    wireframes,
    flow_steps: Array.isArray(p.flow_steps) ? p.flow_steps : [],
    tables: Array.isArray(p.tables) ? p.tables : [],
    ai_screens: Array.isArray(p.ai_screens) ? p.ai_screens : [],
    description_items: Array.isArray(p.description_items) ? p.description_items : [],
    image_badges: Array.isArray(p.image_badges) ? p.image_badges : [],
  };
}
