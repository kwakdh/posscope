# POSSCOPE - KCP POS 기획 허브

## 프로젝트 개요
KCP POS+ 서비스의 기획서를 한눈에 관리하는 내부 웹 애플리케이션.
피그마에 파편화된 기획서를 하나의 웹페이지에서 통합 관리한다.

## 기술 스택
- **Frontend:** Next.js (App Router)
- **Backend/DB:** Supabase (PostgreSQL + Auth + Realtime + Storage)
- **배포:** Vercel
- **버전관리:** GitHub

## 서비스 구조
```
POSSCOPE
├── 로그인 / 회원가입 (이메일 + 비밀번호)
├── 포스앱 탭
│   └── 서비스 메뉴 리스트
│       └── 기능 상세 페이지
├── 베리포스 탭
│   └── 서비스 메뉴 리스트
│       └── 기능 상세 페이지
└── 파트너 탭
    └── 서비스 메뉴 리스트
        └── 기능 상세 페이지
```

## 인증 / 가입 승인 구조
- **로그인 방식**: Supabase Auth (이메일 + 비밀번호)
- **회원가입 제한**: `@kcp.co.kr` 이메일만 가입 가능 (`src/lib/supabase/middleware.ts`의 `ALLOWED_EMAIL_DOMAIN`)
- **가입 승인 플로우**: 가입 시 `users.status = 'pending'` → `/pending` 화면으로 이동 → 관리자가 `/admin/users`에서 승인(`approved`)해야 메인 화면 접근 가능
- **관리자(admin)**:
  - `ADMIN_EMAILS` (`src/lib/supabase/middleware.ts`)에 등록된 이메일은 도메인 제한과 무관하게 가입 가능 + 자동 승인
  - 최초 관리자: `kwakdh19@gmail.com` (곽다희)
  - 관리자는 `/admin/users`에서 가입 승인/거절, 권한(역할) 변경, 사용자 직접 추가/삭제 가능 (직접 추가 시 즉시 `approved`)
- **라우트 보호**: 루트 `middleware.ts`가 비로그인 사용자를 `/login`으로, 미승인 사용자를 `/pending`으로 리다이렉트
- **새 관리자/팀원 추가 시**:
  - 회사 도메인 직원 → 본인이 `/signup`으로 가입 후 관리자가 승인
  - 외부 협업자 등 도메인 예외 필요 시 → `/admin/users`에서 관리자가 직접 추가

## 기능 상세 페이지 구성
- 현재 운영 와이어프레임 (좌)
- 신규 기획 와이어프레임 (우)
- 정책 설명 (와이어프레임 옆)
- 버전 히스토리 (이전 버전 보관)
- 코멘트 스레드 (실시간, 다중 접속 지원)
- 다운로드 (HTML / PNG / PDF)

## 주요 기능
- **로그인:** 이메일 + 비밀번호, 가입 시 관리자 승인 필요 (위 "인증 / 가입 승인 구조" 참고)
- **권한:** 관리자(전체 관리) / 기획자(편집+다운로드) / 개발자(다운로드) / 열람자(보기)
- **실시간 코멘트:** Supabase Realtime 활용, 동시 다중 접속 지원
- **버전 관리:** 배포 완료 시 현재 버전 → 히스토리로 이동, 신규 버전이 현재로 승격
- **두레이 연동:** 두레이 배포완료 처리 시 Webhook → POSSCOPE 자동 업데이트

## 두레이 Webhook 흐름
```
두레이에서 배포완료 처리
→ Webhook 발송 (POST /api/dooray-webhook)
→ 해당 기능 상태 업데이트
→ 현재 와이어프레임 → 히스토리 이동
→ 신규 와이어프레임 → 현재로 승격
```

## Supabase 테이블 구조 (초안)
```
products        - 포스앱 / 베리포스 / 파트너
features        - 서비스 메뉴 (기능 목록)
wireframes      - 와이어프레임 (버전 포함)
policies        - 정책 설명 텍스트
comments        - 코멘트 (realtime)
users           - 사용자 (Auth 연동)
```

## 환경변수 (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DOORAY_WEBHOOK_SECRET=
```

## 개발 우선순위
1. 로그인 + 기본 레이아웃 (탭 구조)
2. 기능 메뉴 리스트 페이지
3. 기능 상세 페이지 (와이어프레임 + 정책)
4. 코멘트 기능 (Realtime)
5. 버전 히스토리
6. 두레이 Webhook 연동
7. 다운로드 기능 (HTML / PNG / PDF)

## 피그마형 실시간 협업 요구사항 (추가)
- **실시간 접속 현황**: 현재 접속 중인 사용자 표시 + 비접속자는 "n시간 전 접속"으로 마지막 접속 시간 표시 (구현 중, [src/components/online-users.tsx](src/components/online-users.tsx))
- **프로필 이미지**: 사용자별 아바타 이미지 설정 (구현 중, Supabase Storage `avatars` 버킷)
- **디스크립션/정책 실시간 동시편집**: Figma처럼 정책/디스크립션을 여러 명이 동시에 실시간 수정 (추후 진행, 기능 상세 페이지 작업 시 함께)
- **정책 변경 시 와이어프레임 자동 반영**: 디스크립션/정책 수정 시 와이어프레임 UI도 그에 맞춰 자동 변경 (추후 진행, 1차는 "변경 필요 영역 하이라이트" 수준으로 시작 후 AI 자동생성으로 확장)

## 작업 시 주의사항
- 와이어프레임은 HTML 파일 또는 이미지로 업로드 가능
- .env.local은 절대 GitHub에 올리지 않음 (.gitignore에 포함)
- 집/회사 PC 모두 .env.local 파일 별도 생성 필요
- 작업 시작 전 `git pull`, 종료 후 `git push` 필수

## 관련 서비스 정보
- 회사: NHN KCP
- 서비스: KCP POS+ (포스앱 / 베리포스 / 파트너)
- 프로젝트 관리 도구: 두레이 (Dooray)
- 대상 사용자: 기획팀, 개발팀, 관련 팀원
