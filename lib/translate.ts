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

// 키 없이 쓰는 폴백 사전 (MyMemory 무료 티어). 검색어처럼 짧은 문자열에만 사용
async function translateQueryFallback(q: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=ko|ja`,
      { signal: AbortSignal.timeout(6000), next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const j = await res.json();
    const out = String(j?.responseData?.translatedText ?? "").trim();
    // 실패 시 원문이나 경고 문자열이 돌아옴 — 일본어 문자가 있어야 채택
    if (!out || out === q || !/[ぁ-んァ-ヶ一-龯]/.test(out)) return null;
    return out;
  } catch {
    return null;
  }
}

// 검색어 ko→ja 번역 (외부 일본 마켓 검색용).
// ANTHROPIC_API_KEY 있으면 Claude, 없으면 무료 폴백. 둘 다 실패하면 원문.
export async function translateQueryToJa(q: string): Promise<string> {
  if (!/[가-힣]/.test(q)) return q; // 한글 없으면 그대로 (일본어/영어 검색)

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic();
      const res = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 100,
        messages: [{
          role: "user",
          content: `Translate this Korean marketplace search query to Japanese. Reply with ONLY the Japanese query, nothing else.\n\n${q}`,
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

  return (await translateQueryFallback(q)) ?? q;
}
