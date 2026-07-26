import Anthropic from "@anthropic-ai/sdk";

const LANG_NAME = { ko: "Korean", ja: "Japanese" } as const;

export async function translateListing(input: {
  title: string; description: string; from: "ko" | "ja";
}): Promise<{ title: string; description: string } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const to = input.from === "ko" ? "ja" : "ko";
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `Translate this secondhand marketplace listing from ${LANG_NAME[input.from]} to ${LANG_NAME[to]}. Keep the tone casual and natural for a marketplace. Reply with ONLY a JSON object {"title": "...", "description": "..."} and nothing else.\n\nTitle: ${input.title}\nDescription: ${input.description}`,
      }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    const jsonText = block.text.slice(block.text.indexOf("{"), block.text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(jsonText);
    if (typeof parsed.title !== "string" || typeof parsed.description !== "string") return null;
    return { title: parsed.title, description: parsed.description };
  } catch {
    return null;
  }
}

export async function translateMessage(
  body: string, from: "ko" | "ja"
): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const to = from === "ko" ? "ja" : "ko";
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: `Translate this short secondhand-marketplace chat message from ${LANG_NAME[from]} to ${LANG_NAME[to]}. Keep it casual and natural. Reply with ONLY the translation, nothing else.\n\n${body}`,
      }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    const out = block.text.trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

const HANGUL = /[가-힣]/;
const JAPANESE = /[ぁ-んァ-ヶ一-龯]/;

// 키 없이 쓰는 폴백 (MyMemory 무료 티어). 검색어처럼 짧은 문자열에만 사용
async function translateQueryFallback(q: string, to: "ko" | "ja"): Promise<string | null> {
  const pair = to === "ja" ? "ko|ja" : "ja|ko";
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${pair}`,
      { signal: AbortSignal.timeout(6000), next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const j = await res.json();
    const out = String(j?.responseData?.translatedText ?? "").trim();
    // 실패 시 원문·경고 문자열이 돌아옴 — 목표 언어 문자가 있어야 채택
    const expect = to === "ja" ? JAPANESE : HANGUL;
    if (!out || out === q || !expect.test(out)) return null;
    return out;
  } catch {
    return null;
  }
}

// 검색어 번역 (외부 마켓 검색용). 이미 목표 언어면 그대로 반환.
// ANTHROPIC_API_KEY 있으면 Claude, 없으면 무료 폴백. 둘 다 실패하면 원문.
export async function translateQueryTo(q: string, to: "ko" | "ja"): Promise<string> {
  const from = to === "ja" ? "ko" : "ja";
  const sourceScript = from === "ko" ? HANGUL : JAPANESE;
  if (!sourceScript.test(q)) return q; // 번역할 원문 문자가 없으면 그대로 (영어 등)

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic();
      const res = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 100,
        messages: [{
          role: "user",
          content: `Translate this ${LANG_NAME[from]} marketplace search query to ${LANG_NAME[to]}. Reply with ONLY the translated query, nothing else.\n\n${q}`,
        }],
      });
      const block = res.content.find((b) => b.type === "text");
      if (block?.type === "text") {
        const out = block.text.trim();
        if (out.length > 0) return out;
      }
    } catch {
      // 키가 있어도 실패할 수 있으므로 폴백으로 진행
    }
  }

  return (await translateQueryFallback(q, to)) ?? q;
}

// 하위 호환 별칭 (일본 마켓 검색)
export const translateQueryToJa = (q: string) => translateQueryTo(q, "ja");
