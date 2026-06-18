---
name: feedback-spec-screenshot-fullpage
description: 기획서 캡처본 작성 시 스크롤이 있는 화면은 반드시 풀페이지 캡처
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9e72b733-0212-411e-8709-69e33c77cc98
---

기획서에 화면 캡처본을 넣을 때, 스크롤이 있는 화면이면 스크롤 내용 전체를 포함해서 캡처해야 한다.

**Why:** 스크롤 가능한 화면을 viewport 크기로만 찍으면 하단 콘텐츠가 잘려서 기획서에 누락됨.

**How to apply:**
- Playwright로 HTML 목업 촬영 시 `fullPage: true` 옵션 사용
- overflow hidden/scroll CSS를 제거(height: auto, overflow: visible)한 뒤 찍기
- 이미지 rect 크기는 실제 이미지 비율에 맞게 조정
