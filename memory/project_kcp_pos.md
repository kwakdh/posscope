---
name: project-kcp-pos
description: "KCP POS 서비스 구조 — 앱 종류, 백오피스, 사용자 타입 등 핵심 컨텍스트"
metadata: 
  node_type: memory
  type: project
  originSessionId: cdacbe02-2b5f-41d0-b61a-68093107f400
---

## 서비스 구조

**KCP POS** — 하드웨어 POS 앱 (2종)

| 제품 | 설명 |
|---|---|
| KCP POS+ | 메인. 온라인 스마트스토어에서 하드웨어 직판 방식 |
| KCP POS pro | 대리점 전용. 모든 기능 동일, 대리점 코드로 회원가입 필요 |

## KCP POS 앱 플랫폼

**클라우드 방식** — 동일 앱이 아래 모든 하드웨어에서 구동됨:
- AOS (안드로이드)
- iOS (아이패드/아이폰)
- WIN (윈도우 PC/노트북)
- P1000 (KCP 전용 안드로이드 단말기)

## 베리포스 (BerryPOS)

- KCP POS 앱의 **세로형(portrait) 버전**
- 안드로이드 단말기 내장 앱
- KCP POS 기능의 **60~70%** 포함 (일부 기능 미지원)
- **기능 추가·수정 시 KCP POS 앱과 베리포스 앱 둘 다 기획 필요**

**How to apply:** 포스앱 기획 요청이 오면 "베리포스도 함께 기획할까요?" 확인할 것

**백오피스 이름: 파트너**
- 사용자 타입: 어드민 / 매장관리자 / 브랜드관리자 / 대리점관리자

**메인 홈페이지:** https://kcp.kpos.store/  
**상점 관리자(백오피스):** https://plus.kpos.store  
**회사:** NHN KCP Corp. / 브랜드: LYNK

## How to apply

- 기능 기획 시 "어드민 전용" / "매장관리자 전용" 등 대상 명시가 중요
- 백오피스(파트너)의 기능 기획서 작성 시 적용 사용자 타입 항상 표기
- KCP POS+와 KCP POS pro는 기능 동일하나 가입 방식 상이 — 기획서에서 구분 필요 시 명시
