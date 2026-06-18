---
name: feedback-posscope-brand-style
description: "POSSCOPE UI 버튼/브랜드 컬러 규칙 - 항상 #2196F3(brand) 사용"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: e18760fa-66d5-430e-ad9f-2bceef5c619b
---

POSSCOPE([[project_posscope]]) UI에서 버튼(primary action) 색상은 항상 브랜드 컬러를 사용할 것.

- 브랜드 컬러: `#2196F3` (hover: `#1976D2`)
- Tailwind 설정: `src/app/globals.css`의 `@theme inline`에 `--color-brand: #2196f3`, `--color-brand-hover: #1976d2` 정의됨 → `bg-brand`, `hover:bg-brand-hover` 클래스로 사용
- 로고(`public/logo-mark.svg`, `public/logo-wordmark.svg`)도 동일 브랜드 컬러 기반 (귀여운 블롭 캐릭터 + 망원경 + 크로스헤어 타겟 컨셉)

Why: 사용자가 명시적으로 "앞으로 버튼색은 다 브랜드색으로 진행해줘"라고 요청.
How to apply: 새 페이지/컴포넌트에서 primary 버튼을 만들 때 `bg-zinc-900` 등 임의 색상 대신 `bg-brand`/`hover:bg-brand-hover` 사용.
