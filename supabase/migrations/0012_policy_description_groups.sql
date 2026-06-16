-- 계층형 디스크립션 그룹 (핀 번호 + 하위 항목 지원)
ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS description_groups jsonb NOT NULL DEFAULT '[]';
