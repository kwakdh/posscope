// ── 위키 타입 정의 ────────────────────────────────────────────────────────────
//
// 아래 SQL을 Supabase SQL Editor에서 실행하여 테이블을 생성하세요:
//
// CREATE TABLE wiki_menus (
//   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   title TEXT NOT NULL DEFAULT '새 문서',
//   parent_id UUID REFERENCES wiki_menus(id) ON DELETE CASCADE,
//   sort_order INTEGER NOT NULL DEFAULT 0,
//   icon TEXT,
//   created_at TIMESTAMPTZ DEFAULT NOW(),
//   updated_at TIMESTAMPTZ DEFAULT NOW()
// );
// ALTER TABLE wiki_menus ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "auth read"   ON wiki_menus FOR SELECT USING (auth.role() = 'authenticated');
// CREATE POLICY "auth insert" ON wiki_menus FOR INSERT WITH CHECK (auth.role() = 'authenticated');
// CREATE POLICY "auth update" ON wiki_menus FOR UPDATE USING (auth.role() = 'authenticated');
// CREATE POLICY "auth delete" ON wiki_menus FOR DELETE USING (auth.role() = 'authenticated');
//
// CREATE TABLE wiki_docs (
//   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   menu_id UUID NOT NULL REFERENCES wiki_menus(id) ON DELETE CASCADE,
//   title TEXT NOT NULL DEFAULT '제목 없음',
//   blocks JSONB NOT NULL DEFAULT '[]',
//   author_name TEXT,
//   version_major INTEGER NOT NULL DEFAULT 0,
//   version_minor INTEGER NOT NULL DEFAULT 1,
//   is_locked BOOLEAN NOT NULL DEFAULT FALSE,
//   change_log TEXT NOT NULL DEFAULT '',
//   figma_url TEXT,
//   updated_at TIMESTAMPTZ DEFAULT NOW(),
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );
//
// 기존 테이블에 figma_url 컬럼 추가 (이미 테이블이 있는 경우):
// ALTER TABLE wiki_docs ADD COLUMN IF NOT EXISTS figma_url TEXT;
// ALTER TABLE wiki_docs ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "auth read"   ON wiki_docs FOR SELECT USING (auth.role() = 'authenticated');
// CREATE POLICY "auth insert" ON wiki_docs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
// CREATE POLICY "auth update" ON wiki_docs FOR UPDATE USING (auth.role() = 'authenticated');
// CREATE POLICY "auth delete" ON wiki_docs FOR DELETE USING (auth.role() = 'authenticated');

export type BlockType =
  | "paragraph" | "h1" | "h2" | "h3"
  | "bullet" | "numbered"
  | "quote" | "divider" | "callout";

export type Block = {
  id: string;
  type: BlockType;
  content: string;
};

export type WikiMenu = {
  id: string;
  title: string;
  parent_id: string | null;
  sort_order: number;
  icon: string | null;
  created_at: string;
  updated_at: string;
};

export type WikiDoc = {
  id: string;
  menu_id: string;
  title: string;
  blocks: Block[];
  author_name: string | null;
  version_major: number;
  version_minor: number;
  is_locked: boolean;
  change_log: string;
  updated_at: string | null;
  created_at: string;
  figma_url?: string | null;
};
