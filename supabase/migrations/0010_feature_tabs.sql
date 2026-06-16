-- 커스텀 탭 지원: kind 제약 해제 + feature_tabs 테이블 추가
-- Supabase SQL Editor에서 실행

-- kind 컬럼의 check 제약 제거 (custom tab ID를 kind로 사용)
ALTER TABLE policies DROP CONSTRAINT IF EXISTS policies_kind_check;

-- 커스텀 탭 메타데이터 테이블
CREATE TABLE IF NOT EXISTS feature_tabs (
  id        text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  item_type text NOT NULL,
  item_id   uuid NOT NULL,
  name      text NOT NULL DEFAULT '새 탭',
  figma_url text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feature_tabs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated users can view feature_tabs" ON feature_tabs;
CREATE POLICY "authenticated users can view feature_tabs" ON feature_tabs
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated users can insert feature_tabs" ON feature_tabs;
CREATE POLICY "authenticated users can insert feature_tabs" ON feature_tabs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated users can update feature_tabs" ON feature_tabs;
CREATE POLICY "authenticated users can update feature_tabs" ON feature_tabs
  FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated users can delete feature_tabs" ON feature_tabs;
CREATE POLICY "authenticated users can delete feature_tabs" ON feature_tabs
  FOR DELETE USING (auth.role() = 'authenticated');
