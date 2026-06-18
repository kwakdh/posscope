---
name: feedback-policy-version-label
description: "기획서 카드의 버전 표기 규칙 - 현행은 v1.0, 신규 기획은 v0.1로 고정 표기"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: bc1d4df6-efe9-4c26-99c2-d25ff9632228
---

POSSCOPE([[project_posscope]])의 기능 상세 페이지에서 정책/기획서 카드(PolicyCard)에 버전 배지를 표시할 때:

- 현행(badge "현행", kind: "current") → 항상 "v1.0"
- 신규 기획(badge "신규 기획", kind: "proposal") → 항상 "v0.1"

각 카드에는 버전 배지 외에도 올린 사람 이름(author_name)과 올린 날짜(updated_at)를 함께 표기한다.

Why: 사용자가 "버전도 같이 적어주고. 현행은 v.1.0으로 적어주고 신규 기획으로 기획할 경우 v.0.1으로 적어줘 꼭기억해"라고 명시적으로 요청. 증가하는 버전 히스토리가 아니라 kind 기반의 고정 라벨임.

How to apply: 새로운 정책/기획서 관련 UI를 만들거나 수정할 때 이 고정 버전 라벨 규칙을 기본값으로 유지. `feature-detail.tsx`의 `VERSION_LABEL` 상수가 이 규칙의 구현 위치.
