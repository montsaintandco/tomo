import { unstable_cache } from "next/cache";
import { mercariSearch } from "./mercari";
import { yahooAuctionSearch } from "./yahoo-auction";
import { daangnSearch } from "./daangn";
import { joongnaSearch } from "./joongna";
import { translateTexts } from "@/lib/translate";
import { pickTrendingItems, type TrendingTheme } from "./trending-data";
import { getThemes } from "./themes";
import { SOURCE_CURRENCY, type MarketItem, type MarketSource } from "./types";

export type TrendingSection = { theme: TrendingTheme; items: MarketItem[] };

const SEARCHERS: Record<MarketSource, (q: string) => Promise<MarketItem[]>> = {
  mercari: mercariSearch,
  yahoo_auction: yahooAuctionSearch,
  daangn: daangnSearch,
  joongna: joongnaSearch,
};

// 홈은 첫 화면이다 — 파서 하나가 느려도 4초 넘게 붙잡지 않는다 (파서 내부 재시도는 그대로 둠)
const SOURCE_TIMEOUT_MS = 4000;
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

async function fetchTheme(theme: TrendingTheme): Promise<MarketItem[]> {
  const results = await Promise.all(theme.sources.map((s) =>
    withTimeout(SEARCHERS[s](theme.term).catch(() => [] as MarketItem[]), SOURCE_TIMEOUT_MS, [] as MarketItem[])
  ));
  const picked = pickTrendingItems(results);
  // 빈 결과를 1시간 캐시하면 안 되므로 throw → 캐시 저장 안 됨, 호출부가 []로 받는다
  if (picked.length === 0) throw new Error(`trending:${theme.key}: empty`);

  // 원칙 2 "번역은 투명하게": 제목을 뷰어 언어로 한 번에 번역해 캐시에 같이 담는다. 실패하면 원문 그대로
  const from = SOURCE_CURRENCY[theme.sources[0]] === "JPY" ? "ja" : "ko";
  const to = from === "ja" ? "ko" : "ja";
  const translated = await withTimeout(translateTexts(picked.map((i) => i.title), from, to), SOURCE_TIMEOUT_MS, null);
  return picked.map((i, idx) => (translated?.[idx] ? { ...i, titleTranslated: translated[idx] } : i));
}

// ponytail: Next 데이터 캐시(1h, stale-while-revalidate). service role 키가 생기면 external_items 쓰기-스루로 승격
const cachedTheme = (theme: TrendingTheme) =>
  unstable_cache(() => fetchTheme(theme), ["trending", "v2", theme.key], { revalidate: 3600 })()
    .catch(() => [] as MarketItem[]);

export async function getTrendingSections(country: "KR" | "JP", limitThemes = 4): Promise<TrendingSection[]> {
  const themes = (await getThemes(country)).slice(0, limitThemes);
  const items = await Promise.all(themes.map(cachedTheme));
  return themes.map((theme, i) => ({ theme, items: items[i] })).filter((s) => s.items.length > 0);
}
