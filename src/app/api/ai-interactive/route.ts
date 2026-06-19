import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!ANTHROPIC_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { prompt, context } = body as {
    prompt: string;
    context?: { title?: string; descriptions?: string[] };
  };

  if (!prompt?.trim()) return NextResponse.json({ error: "prompt가 필요합니다." }, { status: 400 });

  const systemPrompt = `당신은 모바일 POS 앱 기획서를 실제로 클릭·조작할 수 있는 인터랙티브 HTML 프로토타입으로 만드는 UX 전문가입니다.

[반드시 지켜야 할 규칙]
1. Tailwind CSS CDN 반드시 포함: <script src="https://cdn.tailwindcss.com"></script>
2. JavaScript로 실제 인터랙션 구현 — 버튼 클릭, 탭 전환, 수량 변경, 팝업 열기/닫기, 합계 자동 계산 등
3. 모바일 화면 기준 (max-width: 390px) 으로 설계, 내부 스크롤 허용
4. 완전한 <!DOCTYPE html>…</html> 단일 파일
5. 실제 한국어 예시 데이터 사용 (상품명, 금액, 메뉴명 등)
6. 상태 변화가 화면에 즉시 반영 (장바구니 수량, 합계 금액 등)
7. 배경은 #f4f4f5(zinc-100), 카드/패널은 #ffffff, 브랜드 컬러 #2196F3

반드시 다음 JSON 형식으로만 응답하세요 (코드 블록 포함):

\`\`\`json
{
  "html": "<!DOCTYPE html>...",
  "descriptions": ["기능 설명 1", "기능 설명 2"]
}
\`\`\``;

  const userParts: { type: string; text: string }[] = [];
  if (context?.title) {
    userParts.push({ type: "text", text: `[화면 이름] ${context.title}` });
  }
  if (context?.descriptions?.length) {
    userParts.push({ type: "text", text: `[기존 정책]\n${context.descriptions.join("\n")}` });
  }
  userParts.push({ type: "text", text: `[기획 요구사항]\n${prompt}` });

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
        messages: [{ role: "user", content: userParts }],
      }),
      signal: AbortSignal.timeout(55000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return NextResponse.json({ error: err.error?.message ?? "AI 호출 실패" }, { status: res.status });
    }

    const json = await res.json() as { content: { type: string; text: string }[] };
    const rawText = json.content.find(c => c.type === "text")?.text ?? "";
    const codeMatch = rawText.match(/```json\s*([\s\S]*?)```/);
    const parsed = JSON.parse(codeMatch?.[1]?.trim() ?? rawText.trim()) as {
      html: string;
      descriptions?: string[];
    };

    return NextResponse.json({ html: parsed.html, descriptions: parsed.descriptions ?? [] });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "AI 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
