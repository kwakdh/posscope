-- 3-mode 확장: image / figma / ai 모드 + N:1 와이어프레임 + 플로우차트 + 표 + AI 화면
ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS mode        text    NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS wireframes  jsonb   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS flow_steps  jsonb   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS tables      jsonb   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ai_screens  jsonb   NOT NULL DEFAULT '[]';
