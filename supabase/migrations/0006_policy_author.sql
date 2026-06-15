-- 기획서 카드에 작성자 이름 기록 (현행/신규 기획 구분은 kind로 이미 존재, 버전은 코드에서 kind 기반으로 표시)
-- Supabase SQL Editor에서 실행

alter table policies add column if not exists author_name text;
