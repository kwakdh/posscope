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
├── 로그인 (코드 + 사용자 ID)
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

## 기능 상세 페이지 구성
- 현재 운영 와이어프레임 (좌)
- 신규 기획 와이어프레임 (우)
- 정책 설명 (와이어프레임 옆)
- 버전 히스토리 (이전 버전 보관)
- 코멘트 스레드 (실시간, 다중 접속 지원)
- 다운로드 (HTML / PNG / PDF)

## 주요 기능
- **로그인:** 암호 코드 + 사용자 ID 입력 방식
- **권한:** 기획자(편집+다운로드) / 개발자(다운로드) / 열람자(보기)
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
