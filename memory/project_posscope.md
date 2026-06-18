---
name: project-posscope
description: "POSSCOPE - KCP POS+ 기획서 통합 관리 웹앱 프로젝트 (Next.js+Supabase), 작업 폴더 위치 및 구조"
metadata: 
  node_type: memory
  type: project
  originSessionId: c64829f1-e86c-44f0-b514-ba7c87b12792
---

POSSCOPE는 피그마에 파편화된 KCP POS+ 기획서를 하나의 웹페이지에서 통합 관리하는 내부 웹 애플리케이션.
작업 폴더: `C:\Users\곽다희\Desktop\클로드\` (CLAUDE.md 위치, 현재 kcp_push_admin.html 등 HTML 시안 파일 존재)

**기술 스택**: Next.js (App Router) + Supabase (PostgreSQL/Auth/Realtime/Storage) + Vercel 배포 + GitHub 버전관리

**서비스 구조**: 로그인(코드+사용자ID) → 포스앱/베리포스/파트너 3개 탭 → 각 탭의 서비스 메뉴 리스트 → 기능 상세 페이지

**기능 상세 페이지 구성**: 현재 운영 와이어프레임(좌) + 신규 기획 와이어프레임(우) + 정책 설명 + 버전 히스토리 + 실시간 코멘트(다중 접속) + 다운로드(HTML/PNG/PDF)

**권한**: 기획자(편집+다운로드) / 개발자(다운로드) / 열람자(보기)

**두레이(Dooray) Webhook 연동**: 배포완료 처리 시 POST /api/dooray-webhook → 해당 기능 상태 업데이트 → 현재 와이어프레임은 히스토리로, 신규 와이어프레임이 현재로 승격

**Supabase 테이블(초안)**: products, features, wireframes, policies, comments, users

**개발 우선순위**: 1.로그인+레이아웃 → 2.기능메뉴리스트 → 3.기능상세페이지 → 4.코멘트(Realtime) → 5.버전히스토리 → 6.두레이Webhook → 7.다운로드

**작업 규칙**:
- .env.local은 절대 GitHub에 올리지 않음 (.gitignore 포함), 집/회사 PC 각각 별도 생성 필요
- 작업 시작 전 `git pull`, 종료 후 `git push` 필수
- 와이어프레임은 HTML 또는 이미지 업로드 가능

Why: 곽다희([[user_profile]])가 기획서 관리를 위해 새로 시작하는 사이드 프로젝트.
How to apply: 이 프로젝트 폴더에서 작업 시 위 구조/스택/우선순위를 기준으로 코드 작성, git pull/push 습관 리마인드.

**참고**: Figma 하이퍼링크는 `file://` URL을 거부함(http/https만 허용) — 로컬 HTML 프로토타입을 기획서에서 바로 열게 하려면 POSSCOPE를 Vercel에 배포한 뒤 공개 URL로 연결해야 함. 그 전까지는 기획서에 파일명만 텍스트로 안내.

**진행 현황 (2026-06-12 기준)**:
- 완료: Next.js 스캐폴드, Supabase 클라이언트, 인증/가입승인 시스템 전체 구현 (`/login`, `/signup`, `/pending`, `/admin/users`, middleware 라우트 가드)
- 인증 방식 변경: 이메일+비밀번호(Supabase Auth), `@kcp.co.kr` 도메인만 가입 가능 + 관리자 승인 필요. 최초 admin = kwakdh19@gmail.com (도메인 예외, 자동승인)
- 로고 적용: `public/logo-mark.svg`(아이콘), `public/logo-wordmark.svg`(워드마크), `src/app/icon.svg`(파비콘) - POS 단말기+스코프 뷰파인더 모양, 현재 zinc-900/흰색 톤
- **브랜드 컬러: #2196F3** (사용자가 명시적으로 지정, 로고/UI 전반에 적용 예정)
- users 테이블 마이그레이션(0001_add_user_email_status.sql) 적용 완료. 비밀번호 재설정(/forgot-password, /reset-password) 기능 추가 완료
- **⚠️ TODO (Vercel 배포 시 필수)**: Supabase 대시보드 → Authentication → URL Configuration → Redirect URLs에 배포 주소의 `/reset-password` (예: `https://<배포주소>/reset-password`) 추가해야 비밀번호 재설정 메일 링크가 정상 동작함. 현재는 `http://localhost:3000/reset-password`만 등록됨. 배포 작업 시 반드시 사용자에게 리마인드할 것

**2026-06-12 추가 완료 (피그마형 실시간 협업 1단계)**:
- `middleware.ts`를 `src/middleware.ts`로 이동 (src 디렉토리 구조에서는 필수 위치, 루트에 있으면 인증 미들웨어가 동작하지 않음)
- `/admin/users`에서 관리자(admin) 계정은 역할변경/거절/삭제 불가하도록 UI+API(403) 양쪽에서 보호 (코드 작업으로만 가능)
- 실시간 접속 현황: 헤더에 온라인 사용자 아바타 표시 (`src/components/online-users.tsx`, Supabase Realtime Presence), 비접속자는 "n시간 전 접속" 표시 (`src/lib/relative-time.ts`)
- 프로필 아바타: 본인 아바타 클릭 → 이미지 업로드 → Supabase Storage `avatars` 버킷에 저장 + 즉시 반영 (`src/components/profile-avatar.tsx`)
- DB 마이그레이션 `0002_add_avatar_last_seen.sql` 적용 완료 (avatar_url, last_seen_at 컬럼 + 컬럼단위 GRANT로 본인도 role 등은 수정 불가)
- 기본 아바타 6종(산리오 캐릭터: 키티/쿠로미/마이멜로디/폼폼푸린/시나모롤/포챠코) `public/avatars/`에 추가, 회원가입/관리자 직접추가 시 랜덤 배정 (`src/lib/default-avatars.ts`)
- 관리자(kwakdh19@gmail.com) 프로필 아바타는 "시나모롤2"로 직접 변경 완료 (테스트로 포롱→시나모롤2로 교체)
- 전체 커밋 후 push 완료 (commit 71d5afe, "로그인/가입 승인, 관리자 사용자 관리, 실시간 접속현황 및 프로필 아바타 기능 추가")

**2026-06-12 추가 완료 (기능 메뉴 리스트 페이지)**:
- DB: `supabase/migrations/0003_feature_categories.sql` 적용 완료 - `feature_categories` 테이블 신규(product_id, name, sort_order), `features`에 category_id/sort_order 컬럼 추가, products/feature_categories/features RLS(인증 사용자 조회) 추가
- 포스앱 메뉴 시드 데이터: 6개 카테고리(상품/테이블/주문 현황/마이페이지/결제/모드 변경(키오스크 모드)), 총 35개 기능, 피그마 레이어 구조 기준
- `src/components/product-tabs.tsx`: 좌측 고정 사이드바 트리 메뉴로 구현 (커밋 54ddcda)
  - 상품/테이블/주문 현황: 하위 기능 없이 카테고리 자체를 단일 사이드바 항목으로 노출 (`FLAT_CATEGORY_NAMES`)
  - 마이페이지/결제/모드 변경: 기능 단위로 사이드바 항목 노출 (상태뱃지 표시)
  - 항목 클릭 시 우측 main에 이름+상태뱃지+"기능 상세 페이지가 여기에 표시됩니다." placeholder
  - 베리포스/파트너: 데이터 없음 → "아직 등록된 기능 메뉴가 없습니다" 빈 상태
- 전체 커밋/push 완료 (54ddcda, "포스앱 기능 메뉴를 좌측 사이드바 트리 구조로 변경")

**다음 작업 (남음)**: CLAUDE.md 개발 우선순위 3번 - "기능 상세 페이지 (와이어프레임 + 정책)" 구현. 현재 사이드바 항목 클릭 시 main에 placeholder만 표시됨. 피그마형 협업 요구사항 중 디스크립션 실시간 동시편집/와이어프레임 자동반영도 이 단계에서 함께 진행 예정.

**집 PC에서 이어가기**: git pull (최신 커밋 54ddcda) 후 `.env.local` 파일을 별도로 생성해야 함 (Supabase URL/anon key/service role key 등, .gitignore로 제외되어 push 안 됨). `npm install` → `npm run dev`로 실행.

**2026-06-16 추가 완료 (에디터 권한 제한)**:
- 기능 상세 페이지의 모든 편집 기능(제목/정책/UI참고사항/고려사항/와이어프레임 업로드·교체·삭제/번호배지/안건 추가·삭제)을 `admin`/`planner` 권한만 사용 가능하도록 변경, `developer`/`viewer`는 읽기 전용
- `page.tsx`에서 `canEdit = isAdmin || profile?.role === "planner"` 계산 후 `ProductTabs` → `FeatureDetail` → `PolicyCard`로 prop 전달 (prop-drilling 패턴)
- 패턴: 편집 버튼/메뉴는 `{canEdit && (...)}`로 감싸고, textarea/input은 `readOnly={!canEdit}` + 조건부 hover/focus 스타일 제거
- 커밋 8f7617f ("에디터 기능을 기획자/관리자 권한으로 제한") push 완료
- "다운로드(HTML/PNG/PDF)" 기능은 아직 미구현 (CLAUDE.md에 명시된 계획 단계, 개발자 권한용 읽기+다운로드 기능)

**2026-06-17 추가 완료**:

**[1] 초록 포스트잇 기반 피그마 섹션 자동 분류 (899708e)**:
- 피그마 파일에서 초록 배경 노드(#E2F2D1 계열)를 섹션 앵커로 감지 → 텍스트를 섹션 타이틀 추출
- 근접도(유클리드 거리) 기반으로 와이어프레임/desc/policy 노드를 각 포스트잇 섹션에 배정
- 빨간 수정범위 박스(v.0.x) 자동 필터링
- `figmaSections[]` 형식으로 반환: 섹션당 1 Policy + 다수 wireframe[]
- `[현행]` 탭 Figma URL: DB 변경 없이 localStorage `posscope_fig_{itemType}_{itemId}` 키 사용
- `[현행]` 탭은 읽기전용 배너 표시, 섹션 추가/편집 불가

**[2] 버그 수정 (08344c8, e34bac9)**:
- `[현행]` 탭 기획서 삭제 안 되는 버그 수정 (onDelete 조건에서 current 제외 조건 제거)
- 포스앱/베리포스/파트너 첫화면 itemId 공유 버그 수정: `home` → `home_${activeSlug}` (제품별 분리)

**[3] [현행] 탭 캔버스 UI 표시 (605f1a2)**:
- `displayPolicies`: [현행]도 데이터 없으면 emptyPolicy 표시 → 캔버스 레이아웃 렌더
- 모드 스위처(🖼️ 시안 불러오기 / ✨ AI 생성): canEdit 조건 제거, 읽기전용 시 pointer-events-none
- 🔒 배너: displayPolicies → activePolicies 기준으로 변경 (실제 DB 데이터 있을 때만 표시)

**[4] Vercel 서버리스 타임아웃 해결 (f4ef3c4)**:
- `allTextNodes`: 재귀→반복문 DFS, visible:false 즉시 스킵
- `extractBadges.scan`: 재귀→반복문 DFS (scanIterative)
- `findGreenStickyNotes.scan`: 재귀→BFS 큐
- `findParentSectionId`: depth=6→**3**, timeout=20s→**2.5s** (최대 병목 제거)
- 이미지 export: scale=2→**1**, timeout 7s 추가
- 이미지 개별 fetch timeout: 25s→**7s**
- MAX_WIREFRAMES=**12** 상한
- 모든 console.log 전면 제거 (서버리스 I/O 병목 해소)
- 예상 실행시간: **3~7초** (Vercel 무료 10초 이내)

**2026-06-18 버그 수정 4건 (aee6a6d, 3e04695, e60fbd4, 11ef5b9)**:
- `classifyNode` No. 오분류 버그 수정: 와이어프레임 내 "NO" 텍스트 때문에 포트레이트 Frame이 description으로 분류되던 문제 제거 (해당 필터는 landscape 경로에만 있었음 — 실제로는 아무 영향 없었으나 코드 정리)
- `classifyChildren` 서클 번호 필터 제거 (①②③ 이름인 프레임만 남기던 로직 — 원형 번호 없는 디자인에서 모든 와이어프레임 유실 방지)
- **Figma 이미지 파이프라인 완전 복구 (e60fbd4)**:
  - Supabase admin 업로드 실패 시 imageBase64만 저장하던 3단계 폴백에 `imageUrl = figmaS3Url`도 함께 보존 → 클라이언트 base64 업로드 실패해도 S3 URL로 이미지 표시 가능
  - Figma images API timeout: 12s → 25s
  - `figmaSectionGroups`에 wireframe 없으면 일반 분류 경로로 폴백
  - `console.log` 추가 — Vercel Functions 로그에서 `[figma-parse]` 검색으로 분류/이미지 결과 확인 가능
- **프론트엔드 S3 URL 폴백 누락 수정 (11ef5b9)**: 단건 import의 S3 URL 재업로드 시 `resp.ok = false` 분기 누락 → HTTP 오류(403/404)에도 `finalUrl = null`이 되던 버그 수정
- **⚠️ 여전히 미검증**: 위 수정 후 테스트 필요. 여전히 이미지 안 나오면 Vercel 대시보드 → Functions → `figma-parse` 로그에서 `[figma-parse] classified wfs:` / `images API keys:` 줄 확인할 것
- 베리포스 첫화면 node `2839:6368` (3997×1033): 직접 자식에 포트레이트 POS 화면 2개(2839:6447, 2839:6506 각 414×736)와 Descriptions/Policies 패널 2개 포함 확인
