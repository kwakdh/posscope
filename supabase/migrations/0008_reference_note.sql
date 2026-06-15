-- 정책 외 추가 메모 영역: UI 참고사항 / 고려사항 (선택적으로 노출되는 보조 메모)
-- Supabase SQL Editor에서 실행

alter table policies
  add column if not exists ui_note text not null default '',
  add column if not exists consideration_note text not null default '';
