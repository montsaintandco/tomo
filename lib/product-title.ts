import { translateTexts } from "@/lib/translate";
import type { Lang } from "@/lib/i18n";
import { translateWithGlossary } from "@/lib/goods-glossary";

// 상품 제목 번역 — 일→한은 용어집(보호→번역→복원)을 거친다. 그 밖 방향은 번역기 그대로. 실패하면 null(화면은 원문 + 「번역 준비 중」)
export async function translateProductTitle(title: string, from: Lang, to: Lang): Promise<string | null> {
  if (!title.trim() || from === to) return null;
  if (from !== "ja" || to !== "ko") return (await translateTexts([title], from, to))?.[0] ?? null;
  let failed = false;
  const out = await translateWithGlossary(title.slice(0, 300), async (s) => {
    const r = (await translateTexts([s], "ja", "ko"))?.[0];
    if (!r) failed = true;
    return r ?? s;
  });
  return failed && out === title ? null : out;
}
