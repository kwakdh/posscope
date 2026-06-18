---
name: feedback-posscope-uiux-apple-style
description: POSSCOPE 전반의 UI/UX는 토스(Toss) 느낌의 미니멀한 디자인으로 계속 발전시켜야 함 (구 애플 스타일 → 토스 스타일로 전환)
metadata: 
  node_type: memory
  type: feedback
  originSessionId: bc1d4df6-efe9-4c26-99c2-d25ff9632228
---

POSSCOPE([[project_posscope]])의 UI/UX 전반을 토스(Toss) 스타일처럼 미니멀하고 정제된 느낌으로 지속적으로 개선/발전시켜야 함. (기존 애플 스타일 방향성을 대체)

- 페이지 배경은 라이트 그레이(#F2F4F6, `bg-surface` 토큰), 그 위에 올라가는 카드/패널은 화이트 `rounded-3xl`로 레이어감을 줄 것
- 상단 탭/내비게이션은 세그먼트 필 컨트롤 형태(`rounded-full bg-zinc-100` 컨테이너 + 활성 항목은 흰 배경 `bg-white shadow-sm`)로 구성
- 타이포그래피는 굵은 폰트(`font-bold`/`font-semibold`) 위주, 텍스트 컬러는 `text-ink`(#191F28, 진한 잉크블랙)와 `text-ink-muted`(#8B95A1, 연한 그레이) 토큰을 zinc 계열 대신 사용
- 버튼/배지 등은 `rounded-full` 또는 `rounded-2xl`로 둥글게, 인터랙션(호버/포커스/트랜지션)은 계속 신경 쓸 것
- [[feedback_posscope_brand_style]]의 브랜드 컬러(#2196F3, `--color-brand`)는 변경 없이 유지 — 토스 블루(#3182F6)로 바꾸지 않음
- 색상 토큰은 `src/app/globals.css`의 `@theme inline`에 정의된 `--color-surface`, `--color-ink`, `--color-ink-muted`, `--color-brand`를 재사용

Why: 사용자가 "ui를 전반적으로 토스느낌으로 바꿔줘"라고 요청, 기존 애플 스타일 방향성을 토스 스타일로 대체할지 확인(AskUserQuestion)한 결과 "네, 토스 스타일로 변경"으로 명시적 확정 — 일회성이 아닌 앞으로의 모든 UI 작업에 적용되는 지속적 방향성.

How to apply: POSSCOPE 관련 모든 UI 작업(신규 기능, 수정, 리팩토링) 시 기본 디자인 기준으로 적용. 새 화면/컴포넌트도 surface 배경 + 화이트 카드 + 세그먼트 필 탭 + ink 컬러 톤으로 통일.
