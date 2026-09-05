import { translateTexts } from "@/lib/translate";
import { SOURCE_CURRENCY, type MarketItem } from "./types";

type Lang = "ko" | "ja";
const TIMEOUT_MS = 4000;

// 원칙 2 "번역은 투명하게": 뷰어 언어와 다른 나라 소스의 제목을 한 요청으로 번역해 titleTranslated에 담는다.
// 카드가 번역 제목 + 원문 한 줄을 보인다. 실패·타임아웃이면 원문 그대로 (오류 아님)
export async function withTranslatedTitles<T extends MarketItem>(items: T[], lang: Lang): Promise<T[]> {
  const idx = items.map((it, i) => ((SOURCE_CURRENCY[it.source] === "JPY" ? "ja" : "ko") !== lang && !it.titleTranslated && it.title.trim() ? i : -1)).filter((i) => i >= 0);
  if (idx.length === 0) return items;
  const out = await Promise.race([
    translateTexts(idx.map((i) => items[i].title), lang === "ko" ? "ja" : "ko", lang),
    new Promise<null>((r) => setTimeout(() => r(null), TIMEOUT_MS)),
  ]);
  if (!out) return items;
  const res = items.slice();
  idx.forEach((i, k) => { res[i] = { ...res[i], titleTranslated: out[k] }; });
  return res;
}
