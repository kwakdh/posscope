-- 와이어프레임 이미지 위에 배치하는 번호 배지 (위치/번호 정보)
-- Supabase SQL Editor에서 실행

alter table policies
  add column if not exists image_badges jsonb not null default '[]'::jsonb;
