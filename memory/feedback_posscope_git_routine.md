---
name: feedback-posscope-git-routine
description: "POSSCOPE 작업 시 하루 시작/종료 git 루틴 - 종료 시 push, 시작 시 확인 질문"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c64829f1-e86c-44f0-b514-ba7c87b12792
---

POSSCOPE([[project_posscope]]) 작업 시 다음 루틴을 지킬 것:

- 사용자가 "오늘 업무 끝낼게" 등 작업 종료를 알리면, 그날 변경된 내용을 정리해서 git add/commit/push까지 진행한다 (커밋 메시지는 작업 내용 요약).
- 사용자가 그날 처음 대화를 시작하면(아침 등), 먼저 `git pull` 했는지 / 최신 상태인지 확인하는 질문을 한다. (CLAUDE.md의 "작업 시작 전 git pull, 종료 후 git push 필수" 규칙과 연결)

Why: 집/회사 PC 두 곳에서 작업하므로 git 동기화를 빠뜨리면 충돌이나 작업 누락이 생길 수 있음.
How to apply: POSSCOPE 작업 디렉토리(`C:\Users\곽다희\Desktop\클로드`)에서 작업할 때, 대화 시작/종료 시점을 감지해 위 루틴을 능동적으로 제안/수행한다.
