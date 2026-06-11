-- POSSCOPE 초기 스키마
-- Supabase SQL Editor에서 실행

-- 사용자 (Auth 연동)
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('planner', 'developer', 'viewer')),
  created_at timestamptz not null default now()
);

-- 제품 (포스앱 / 베리포스 / 파트너)
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

-- 서비스 메뉴 (기능 목록)
create table features (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  slug text not null,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'deployed')),
  created_at timestamptz not null default now(),
  unique (product_id, slug)
);

-- 와이어프레임 (버전 포함, 현재/신규/히스토리 구분)
create table wireframes (
  id uuid primary key default gen_random_uuid(),
  feature_id uuid not null references features(id) on delete cascade,
  version int not null,
  status text not null check (status in ('current', 'planned', 'history')),
  file_url text,
  created_at timestamptz not null default now()
);

-- 정책 설명
create table policies (
  id uuid primary key default gen_random_uuid(),
  feature_id uuid not null references features(id) on delete cascade,
  content text not null,
  updated_at timestamptz not null default now()
);

-- 코멘트 (realtime)
create table comments (
  id uuid primary key default gen_random_uuid(),
  feature_id uuid not null references features(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- realtime 활성화
alter publication supabase_realtime add table comments;
