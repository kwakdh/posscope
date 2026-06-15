-- 정책/디스크립션 영역 분리: 정책 메모 + 표 형태로 늘어나는 디스크립션 목록
-- Supabase SQL Editor에서 실행

alter table policies
  add column if not exists policy_note text not null default '',
  add column if not exists description_items jsonb not null default '[]'::jsonb;
