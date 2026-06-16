import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

type TableData = { id: string; caption: string; headers: string[]; rows: string[][] };
type AIScreen = { id: string; name: string; html: string; order: number; flowTo: string[] };

export async function POST(req: NextRequest) {
  if (!ANTHROPIC_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY가 설정되지 않았습니다. .env.local에 추가해 주세요." }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { prompt, context } = body as {
    prompt: string;
    context?: { title?: string; descriptions?: string[]; policyNote?: string; uiNote?: string; considerNote?: string };
  };

  if (!prompt?.trim()) return NextResponse.json({ error: "prompt가 필요합니다." }, { status: 400 });

  const systemPrompt = `당신은 모바일 앱 기획서를 시각적 HTML 프로토타입으로 변환하는 UX 전문가입니다.
기획 내용을 분석하여 다음 JSON 형식으로 응답하세요:

{
  "screens": [
    {
      "id": "screen-1",
      "name": "화면명",
      "order": 0,
      "flowTo": ["screen-2"],
      "html": "<!DOCTYPE html>..."
    }
  ],
  "descriptions": ["디스크립션 1", "디스크립션 2"],
  "policyNote": "정책 내용",
  "tables": [
    {
      "id": "table-1",
      "caption": "표 제목",
      "headers": ["항목", "내용"],
      "rows": [["값1", "값2"]]
    }
  ]
}

HTML 작성 규칙:
- 각 화면은 완전한 HTML 문서 (<!DOCTYPE html>부터 </html>까지)
- 모바일 화면 비율 (max-width: 390px, 실제 폰 느낌)
- Tailwind CDN 사용: <script src="https://cdn.tailwindcss.com"></script>
- 인터랙티브 요소 (토글, 탭, 버튼) JavaScript로 실제 동작하게 구현
- 화면 전환은 window.parent.postMessage({action:'navigate', to:'screen-id'}, '*') 사용
- 배경색 white, 한국어 UI, 실제 앱처럼 보이게 디자인
- 최소 1개 최대 5개 화면 생성`;

  const userMessage = `기획 내용:
${prompt}

${context?.title ? `화면 제목: ${context.title}` : ""}
${context?.descriptions?.length ? `기존 디스크립션:\n${context.descriptions.join("\n")}` : ""}
${context?.policyNote ? `정책:\n${context.policyNote}` : ""}
${context?.uiNote ? `UI 참고:\n${context.uiNote}` : ""}
${context?.considerNote ? `고려사항:\n${context.considerNote}` : ""}

위 기획을 바탕으로 인터랙티브 HTML 프로토타입 화면들과 구조화된 기획 데이터를 생성해 주세요.`;

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
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: err.error?.message ?? "AI 생성 실패" }, { status: res.status });
    }

    const data = await res.json();
    const text: string = data.content?.[0]?.text ?? "";

    // JSON 블록 파싱
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) return NextResponse.json({ error: "AI 응답 파싱 실패", raw: text.slice(0, 500) }, { status: 500 });

    let parsed: { screens?: AIScreen[]; descriptions?: string[]; policyNote?: string; tables?: TableData[] };
    try {
      parsed = JSON.parse(jsonMatch[1]);
    } catch {
      return NextResponse.json({ error: "AI 응답 JSON 파싱 실패", raw: text.slice(0, 500) }, { status: 500 });
    }

    const screens: AIScreen[] = (parsed.screens ?? []).map((s, i) => ({
      id: s.id || `screen-${i + 1}`,
      name: s.name || `화면 ${i + 1}`,
      html: s.html || "",
      order: s.order ?? i,
      flowTo: Array.isArray(s.flowTo) ? s.flowTo : [],
    }));

    return NextResponse.json({
      screens,
      descriptions: parsed.descriptions ?? [],
      policyNote: parsed.policyNote ?? "",
      tables: (parsed.tables ?? []).map((t, i) => ({
        id: t.id || `table-${i + 1}`,
        caption: t.caption || "",
        headers: Array.isArray(t.headers) ? t.headers : [],
        rows: Array.isArray(t.rows) ? t.rows : [],
      })),
    });
  } catch (e) {
    console.error("AI generate error:", e);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
