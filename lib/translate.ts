// 번역: 구글 무료 엔드포인트(clients5, dict-chrome-ex 클라이언트) 사용 — API 키 불필요.
// 실패 시 null 반환으로 graceful (발송·등록은 항상 성공, 스펙 §9). 검색어는 MyMemory 2차 폴백.

type Lang = "ko" | "ja";

// 여러 문자열을 한 요청으로 번역. 응답은 입력 순서대로의 배열.
async function googleTranslate(texts: string[], from: Lang, to: Lang): Promise<string[] | null> {
  try {
    const body = new URLSearchParams();
    for (const t of texts) body.append("q", t);
    const res = await fetch(
      `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${from}&tl=${to}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const j: unknown = await res.json();
    if (!Array.isArray(j)) return null;
    // 항목은 보통 문자열, sl=auto 계열 변형에선 [번역, 감지언어] 배열일 수 있음
    const out = j.map((item) =>
      typeof item === "string" ? item : Array.isArray(item) && typeof item[0] === "string" ? item[0] : ""
    );
    if (out.length !== texts.length || out.some((s) => s.trim().length === 0)) return null;
    return out.map((s) => s.trim());
  } catch {
    return null;
  }
}

export async function translateListing(input: {
  title: string; description: string; from: Lang;
}): Promise<{ title: string; description: string } | null> {
  const to = input.from === "ko" ? "ja" : "ko";
  const out = await googleTranslate([input.title, input.description], input.from, to);
  return out ? { title: out[0], description: out[1] } : null;
}

export async function translateMessage(body: string, from: Lang): Promise<string | null> {
  const to = from === "ko" ? "ja" : "ko";
  const out = await googleTranslate([body], from, to);
  return out ? out[0] : null;
}

const HANGUL = /[가-힣]/;
const JAPANESE = /[ぁ-んァ-ヶ一-龯]/;

// 2차 폴백 (MyMemory 무료 티어). 검색어처럼 짧은 문자열에만 사용
async function translateQueryFallback(q: string, to: Lang): Promise<string | null> {
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
// 구글 무료 번역 → MyMemory 폴백 → 원문 순.
export async function translateQueryTo(q: string, to: Lang): Promise<string> {
  const from = to === "ja" ? "ko" : "ja";
  const sourceScript = from === "ko" ? HANGUL : JAPANESE;
  if (!sourceScript.test(q)) return q; // 번역할 원문 문자가 없으면 그대로 (영어 등)

  const g = await googleTranslate([q], from, to);
  if (g) return g[0];
  return (await translateQueryFallback(q, to)) ?? q;
}

// 하위 호환 별칭 (일본 마켓 검색)
export const translateQueryToJa = (q: string) => translateQueryTo(q, "ja");
