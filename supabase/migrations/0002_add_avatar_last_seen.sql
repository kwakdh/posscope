-- 프로필 이미지 + 마지막 접속 시간 컬럼 추가
-- Supabase SQL Editor에서 실행

alter table users add column if not exists avatar_url text;
alter table users add column if not exists last_seen_at timestamptz;

-- 사용자가 본인 row의 avatar_url / last_seen_at 만 갱신할 수 있도록 허용
-- (컬럼 단위 GRANT로 role/status 등 다른 컬럼은 본인도 수정 불가)
grant update (avatar_url, last_seen_at) on users to authenticated;

drop policy if exists "users can update own profile" on users;
create policy "users can update own profile"
  on users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 아바타 이미지를 저장할 Storage 버킷 (공개 읽기, 본인 폴더에만 업로드/수정 가능)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar images are publicly accessible" on storage.objects;
create policy "avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "users can upload own avatar" on storage.objects;
create policy "users can upload own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users can update own avatar" on storage.objects;
create policy "users can update own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
