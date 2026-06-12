-- 기능 상세 본문: 와이어프레임 + 정책/디스크립션 ("현재" / "신규 기획" 카드)
-- Supabase SQL Editor에서 실행

-- 기존 초기 설계(schema.sql)의 policies/wireframes 테이블은 사용되지 않고 비어있으므로 제거 후 재설계
drop table if exists policies;
drop table if exists wireframes;

create table policies (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('feature', 'category')),
  item_id uuid not null,
  kind text not null default 'current' check (kind in ('current', 'proposal')),
  title text not null default '',
  content text not null default '',
  wireframe_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 항목별 "현재" 카드는 1개만 존재
create unique index if not exists policies_one_current_per_item
  on policies (item_type, item_id)
  where kind = 'current';

alter table policies enable row level security;

drop policy if exists "authenticated users can view policies" on policies;
create policy "authenticated users can view policies"
  on policies for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated users can insert policies" on policies;
create policy "authenticated users can insert policies"
  on policies for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated users can update policies" on policies;
create policy "authenticated users can update policies"
  on policies for update using (auth.role() = 'authenticated');

drop policy if exists "authenticated users can delete policies" on policies;
create policy "authenticated users can delete policies"
  on policies for delete using (auth.role() = 'authenticated');

-- 와이어프레임 이미지 저장용 Storage 버킷 (공개 읽기, 로그인 사용자 업로드/수정/삭제)
insert into storage.buckets (id, name, public)
values ('wireframes', 'wireframes', true)
on conflict (id) do nothing;

drop policy if exists "wireframe images are publicly accessible" on storage.objects;
create policy "wireframe images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'wireframes');

drop policy if exists "authenticated users can upload wireframes" on storage.objects;
create policy "authenticated users can upload wireframes"
  on storage.objects for insert
  with check (bucket_id = 'wireframes' and auth.role() = 'authenticated');

drop policy if exists "authenticated users can update wireframes" on storage.objects;
create policy "authenticated users can update wireframes"
  on storage.objects for update
  using (bucket_id = 'wireframes' and auth.role() = 'authenticated');

drop policy if exists "authenticated users can delete wireframes" on storage.objects;
create policy "authenticated users can delete wireframes"
  on storage.objects for delete
  using (bucket_id = 'wireframes' and auth.role() = 'authenticated');
