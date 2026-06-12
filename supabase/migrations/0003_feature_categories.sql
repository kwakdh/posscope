-- 기능 메뉴 리스트: 카테고리 테이블 추가 + features 테이블 보강 + 포스앱 메뉴 시드 데이터
-- Supabase SQL Editor에서 실행

create table if not exists feature_categories (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table features add column if not exists category_id uuid references feature_categories(id) on delete set null;
alter table features add column if not exists sort_order int not null default 0;
alter table features alter column slug drop not null;

-- RLS: 로그인한 사용자는 전체 조회 가능
alter table products enable row level security;
alter table feature_categories enable row level security;
alter table features enable row level security;

drop policy if exists "authenticated users can view products" on products;
create policy "authenticated users can view products"
  on products for select
  using (auth.role() = 'authenticated');

drop policy if exists "authenticated users can view feature categories" on feature_categories;
create policy "authenticated users can view feature categories"
  on feature_categories for select
  using (auth.role() = 'authenticated');

drop policy if exists "authenticated users can view features" on features;
create policy "authenticated users can view features"
  on features for select
  using (auth.role() = 'authenticated');

-- 제품 데이터 (없으면 추가)
insert into products (name, slug) values
  ('포스앱', 'pos-app'),
  ('베리포스', 'berrypos'),
  ('파트너', 'partner')
on conflict (slug) do nothing;

-- 포스앱 카테고리 시드
insert into feature_categories (product_id, name, sort_order)
select p.id, c.name, c.sort_order
from products p
join (values
  ('상품', 1),
  ('테이블', 2),
  ('주문 현황', 3),
  ('마이페이지', 4),
  ('결제', 5),
  ('모드 변경 (키오스크 모드)', 6)
) as c(name, sort_order) on true
where p.slug = 'pos-app';

-- 포스앱 기능 시드
insert into features (product_id, category_id, name, status, sort_order)
select p.id, fc.id, f.name, 'draft', f.sort_order
from products p
join feature_categories fc on fc.product_id = p.id
join (values
  ('상품', '상품 찾기', 1),
  ('상품', '기능', 2),
  ('상품', '임시저장', 3),
  ('상품', '-/+ 버튼', 4),
  ('상품', '상품 별 할인', 5),
  ('상품', '추가금액 입력', 6),
  ('테이블', '홈', 1),
  ('테이블', '테이블 정보', 2),
  ('테이블', '기능', 3),
  ('테이블', '테이블 선택', 4),
  ('테이블', '추가금액 입력', 5),
  ('주문 현황', '장비 설정 퀵버튼', 1),
  ('주문 현황', '접수 내역 (홈)', 2),
  ('주문 현황', '접수 목록 선택', 3),
  ('주문 현황', '완료 내역 (홈)', 4),
  ('주문 현황', '완료 목록 선택', 5),
  ('주문 현황', '취소 내역 (홈)', 6),
  ('주문 현황', '취소 목록 선택', 7),
  ('마이페이지', '공지사항', 1),
  ('마이페이지', '결제 내역', 2),
  ('마이페이지', '우리 매장 분석', 3),
  ('마이페이지', '회원 관리', 4),
  ('마이페이지', '네이버 플레이스', 5),
  ('마이페이지', '모드별 설정 (QR, 배달)', 6),
  ('마이페이지', '상품 옵션 관리 (재고, 옵션)', 7),
  ('마이페이지', '사용자 관리', 8),
  ('마이페이지', '장비 설정', 9),
  ('마이페이지', '기본 설정', 10),
  ('마이페이지', '이용 가이드', 11),
  ('마이페이지', '매장 설정', 12),
  ('결제', '결제 화면 구성', 1),
  ('모드 변경 (키오스크 모드)', '관리자 설정', 1),
  ('모드 변경 (키오스크 모드)', '홈', 2),
  ('모드 변경 (키오스크 모드)', '상품 선택', 3),
  ('모드 변경 (키오스크 모드)', '결제', 4)
) as f(category_name, name, sort_order)
  on f.category_name = fc.name
where p.slug = 'pos-app';
