import { NextRequest, NextResponse } from "next/server";
import type { BlockType } from "@/types/wiki";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!ANTHROPIC_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." }, { status: 500 });
  }

  const { rawText, menuTitle } = await req.json() as {
    rawText: string;
    menuTitle?: string;
  };

  if (!rawText?.trim()) {
    return NextResponse.json({ error: "rawText가 필요합니다." }, { status: 400 });
  }

  const systemPrompt = `당신은 서비스 기획서 정책 문서를 노션(Notion) 스타일의 구조화된 위키로 변환하는 전문가입니다.
피그마에서 수집된 날것의 텍스트를 입력받아, 아래 규칙에 따라 완성된 비즈니스 정책 가이드 문서로 변환하세요.

[변환 규칙]
1. 개요(Summary): 해당 화면/기능의 목적과 핵심 인터랙션을 2~3줄로 요약. paragraph 타입 사용.
2. 핵심 기능 및 정책(Core Policies): 중요 항목·★ 표시를 분석하여 계층형 불릿 구조로 정리.
   - 섹션 제목은 h2 타입, 각 정책 항목은 bullet 타입.
   - 하위 규칙이 있으면 bullet 타입으로 들여쓰기 표현.
3. 예외 및 UI 참고사항: UI 참고사항, 고려사항, 예외 케이스를 callout 타입으로 분리 배치.
4. 중복 제거: 동일하거나 유사한 문장은 최초 1개만 남기고 나머지 무시.
5. 내용 없음 처리: 정책으로 분류할 내용이 없는 섹션은 생략.
6. 번호/기호 제거: 원문의 "1.", "★", "・" 같은 기호는 제거하고 텍스트만 남겨.
7. 한국어로 자연스럽게 서술. 원문의 어색한 표현을 다듬어 완성된 문장으로.

[허용된 type 값]
paragraph, h1, h2, h3, bullet, numbered, quote, callout, divider

[응답 형식]
반드시 아래 JSON 형식으로만 응답하세요 (코드블록 포함):

\`\`\`json
{
  "blocks": [
    {"type": "paragraph", "content": "개요 텍스트..."},
    {"type": "h2", "content": "핵심 기능 및 정책"},
    {"type": "bullet", "content": "정책 항목 내용"},
    {"type": "bullet", "content": "또 다른 정책 항목"},
    {"type": "h2", "content": "예외 및 참고사항"},
    {"type": "callout", "content": "예외 또는 주의 사항 내용"}
  ]
}
\`\`\``;

  const userMessage = `[화면/기능명]
${menuTitle ?? "알 수 없음"}

[피그마 원본 텍스트]
${rawText}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: AbortSignal.timeout(55000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return NextResponse.json({ error: err.error?.message ?? "AI 호출 실패" }, { status: res.status });
    }

    const json = await res.json() as { content: { type: string; text: string }[] };
    const rawResponse = json.content.find(c => c.type === "text")?.text ?? "";
    const codeMatch = rawResponse.match(/```json\s*([\s\S]*?)```/);
    const parsed = JSON.parse(codeMatch?.[1]?.trim() ?? rawResponse.trim()) as {
      blocks: { type: BlockType; content: string }[];
    };

    if (!Array.isArray(parsed.blocks) || parsed.blocks.length === 0) {
      return NextResponse.json({ error: "AI가 유효한 블록을 생성하지 못했습니다." }, { status: 422 });
    }

    return NextResponse.json({ blocks: parsed.blocks });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "AI 구조화 중 오류가 발생했습니다." }, { status: 500 });
  }
}
