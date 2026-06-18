// ── 공유 데이터 타입 ──────────────────────────────────────────────────────────

export type PolicyMode = "image" | "figma" | "ai" | "canvas";

/** 이미지 위 번호 배지 — pinNumber는 "1", "3-1", "3-2" 같은 문자열 */
export type BadgeMark = {
  id: string;
  pinNumber: string;  // "1", "3-1", "3-2" …
  x: number;         // % (0~100) of wireframe width
  y: number;         // % (0~100) of wireframe height
  w?: number;        // % width  (바운딩 박스일 때만)
  h?: number;        // % height (바운딩 박스일 때만)
};

/** N:1 구조의 와이어프레임 항목 */
export type WireframeItem = {
  id: string;
  url: string | null;
  name: string;
  badges: BadgeMark[];
  isModal: boolean;
  modalFor: string | null;
  order: number;
};

/** 와이어프레임 사이의 화면 흐름 */
export type FlowStep = {
  id: string;
  from: string;
  to: string;
  label: string;
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
  flowTo: string[];
};

/** 디스크립션 하위 항목 (3-1, 3-2 …) */
export type DescSubItem = {
  pinNumber: string;  // "3-1", "3-2" …
  text: string;
};

/** 디스크립션 그룹 (부모 번호 + 하위 항목 배열) */
export type DescGroup = {
  id: string;
  pinNumber: string;      // "1", "2", "3" … (부모)
  title: string;          // 부모 정책 텍스트
  subItems: DescSubItem[];
};

/** 정책/기획서 메인 데이터 (DB policies 테이블 row) */
export type Policy = {
  id: string;
  item_type: string;
  item_id: string;
  kind: string;
  title: string;
  mode: PolicyMode;
  wireframes: WireframeItem[];
  flow_steps: FlowStep[];
  description_groups: DescGroup[];
  description_items: string[];   // 레거시 (하위 호환)
  policy_note: string;
  ui_note: string;
  consideration_note: string;
  tables: TableData[];
  ai_screens: AIScreen[];
  wireframe_url: string | null;
  image_badges: BadgeMark[];
  sort_order: number;
  author_name: string | null;
  updated_at: string | null;
  version_major: number;
  version_minor: number;
  is_locked: boolean;
  publish_type: string | null;
  change_log: string;
  published_at: string | null;
};

/** DB row를 클라이언트 Policy 타입으로 정규화 */
export function normalizePolicy(raw: Record<string, unknown>): Policy {
  const p = raw as Policy & { description_groups?: DescGroup[] };

  // BadgeMark 레거시 number → pinNumber 마이그레이션
  function migrateBadges(badges: unknown[]): BadgeMark[] {
    return badges.map(b => {
      const badge = b as BadgeMark & { number?: number };
      return {
        ...badge,
        pinNumber: badge.pinNumber ?? String(badge.number ?? "?"),
      };
    });
  }

  let wireframes: WireframeItem[] =
    Array.isArray(p.wireframes) && p.wireframes.length > 0
      ? p.wireframes.map(wf => ({
          ...wf,
          badges: Array.isArray(wf.badges) ? migrateBadges(wf.badges) : [],
        }))
      : p.wireframe_url
      ? [{
          id: `legacy-${p.id}`,
          url: p.wireframe_url,
          name: p.title || "화면",
          badges: Array.isArray(p.image_badges) ? migrateBadges(p.image_badges) : [],
          isModal: false,
          modalFor: null,
          order: 0,
        }]
      : [];

  // description_groups: DB 값 우선, 없으면 description_items에서 변환
  let descGroups: DescGroup[] = Array.isArray(p.description_groups)
    ? p.description_groups
    : [];

  if (descGroups.length === 0 && Array.isArray(p.description_items)) {
    descGroups = p.description_items
      .filter(s => s && s.trim())
      .map((text, i) => ({
        id: `desc_group_${i + 1}`,
        pinNumber: String(i + 1),
        title: text,
        subItems: [],
      }));
  }

  return {
    ...p,
    mode: (p.mode as PolicyMode) || "image",
    wireframes,
    flow_steps: Array.isArray(p.flow_steps) ? p.flow_steps : [],
    tables: Array.isArray(p.tables) ? p.tables : [],
    ai_screens: Array.isArray(p.ai_screens) ? p.ai_screens : [],
    description_items: Array.isArray(p.description_items) ? p.description_items : [],
    description_groups: descGroups,
    image_badges: Array.isArray(p.image_badges) ? migrateBadges(p.image_badges) : [],
    version_major: (p as Policy).version_major ?? 1,
    version_minor: (p as Policy).version_minor ?? 0,
    is_locked: (p as Policy).is_locked ?? false,
    publish_type: (p as Policy).publish_type ?? null,
    change_log: (p as Policy).change_log ?? "",
    published_at: (p as Policy).published_at ?? null,
  };
}
