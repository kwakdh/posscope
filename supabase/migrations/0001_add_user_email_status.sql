-- 기존 users 테이블에 email/status 컬럼 추가, role에 admin 허용
-- Supabase SQL Editor에서 실행

alter table users add column if not exists email text;
alter table users add column if not exists status text not null default 'pending';

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('admin', 'planner', 'developer', 'viewer'));

alter table users drop constraint if exists users_status_check;
alter table users add constraint users_status_check
  check (status in ('pending', 'approved', 'rejected'));

alter table users add constraint users_email_key unique (email);

-- RLS
alter table users enable row level security;

drop policy if exists "users can view own row" on users;
create policy "users can view own row"
  on users for select
  using (auth.uid() = id);

drop policy if exists "service role manages users" on users;
create policy "service role manages users"
  on users for all
  using (auth.role() = 'service_role');
