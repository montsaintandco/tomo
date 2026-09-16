import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { mercariSearch } from "./mercari";
import { yahooAuctionSearch } from "./yahoo-auction";
import { yahooFleaSearch } from "./yahoo-flea";
import { daangnSearch } from "./daangn";
import { joongnaSearch } from "./joongna";
import { translateTexts } from "@/lib/translate";
import { pickTrendingItems, TRENDING, type TrendingTheme } from "./trending-data";
import { getThemes } from "./themes";
import { LIVE_SOURCES, SOURCE_CURRENCY, type MarketItem, type MarketSource } from "./types";

export type TrendingSection = { theme: TrendingTheme; items: MarketItem[] };

const SEARCHERS: Record<MarketSource, (q: string) => Promise<MarketItem[]>> = {
  mercari: mercariSearch,
  yahoo_auction: yahooAuctionSearch,
  yahoo_flea: yahooFleaSearch,
  daangn: daangnSearch,
  joongna: joongnaSearch,
};

// 홈은 첫 화면이다 — 파서 하나가 느려도 4초 넘게 붙잡지 않는다 (파서 내부 재시도는 그대로 둠)
const SOURCE_TIMEOUT_MS = 4000;
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

async function fetchTheme(theme: TrendingTheme): Promise<MarketItem[]> {
  const results = await Promise.all(theme.sources.filter((s) => LIVE_SOURCES.includes(s)).map((s) =>
    withTimeout(SEARCHERS[s](theme.term).catch(() => [] as MarketItem[]), SOURCE_TIMEOUT_MS, [] as MarketItem[])
  ));
  const picked = pickTrendingItems(results);
  // 빈 결과를 1시간 캐시하면 안 되므로 throw → 캐시 저장 안 됨, 호출부가 []로 받는다
  if (picked.length === 0) throw new Error(`trending:${theme.key}: empty`);
  return picked;
}

// ponytail: Next 데이터 캐시(1h, stale-while-revalidate). service role 키가 생기면 external_items 쓰기-스루로 승격
const cachedTheme = (theme: TrendingTheme) =>
  unstable_cache(() => fetchTheme(theme), ["trending", "v3", theme.key], { revalidate: 3600 })()
    .catch(() => [] as MarketItem[]);

// 원칙 2 "번역은 투명하게": 제목을 뷰어 언어로 한 번에 번역한다.
// 상품 캐시와 분리한 이유 — 같이 담으면 번역이 한 번 실패한 순간 원문 제목이 1시간 굳어
// 일본 사용자 홈에 한국어 제목이 그대로 보였다. 번역 캐시는 성공만 저장(실패는 throw)하고 다음 요청에 재시도한다.
async function withTitles(items: MarketItem[], theme: TrendingTheme): Promise<MarketItem[]> {
  if (items.length === 0) return items;
  const from = SOURCE_CURRENCY[theme.sources[0]] === "JPY" ? "ja" : "ko";
  const to = from === "ja" ? "ko" : "ja";
  const titles = items.map((i) => i.title);
  const key = createHash("sha1").update(titles.join("\u0000")).digest("hex").slice(0, 16);
  const out = await withTimeout(
    unstable_cache(async () => {
      const r = await translateTexts(titles, from, to);
      if (!r) throw new Error(`trending-tr:${theme.key}`); // 실패는 캐시하지 않는다
      return r;
    }, ["trending-tr", "v1", to, key], { revalidate: 86400 })().catch(() => null),
    SOURCE_TIMEOUT_MS, null);
  return out ? items.map((it, i) => (out[i] ? { ...it, titleTranslated: out[i] } : it)) : items;
}

async function sectionsFor(themes: TrendingTheme[]): Promise<TrendingSection[]> {
  const items = await Promise.all(themes.map(cachedTheme));
  const withTr = await Promise.all(themes.map((theme, i) => withTitles(items[i], theme)));
  return themes.map((theme, i) => ({ theme, items: withTr[i] }));
}

export async function getTrendingSections(country: "KR" | "JP", limitThemes = 4): Promise<TrendingSection[]> {
  const sections = await sectionsFor((await getThemes(country)).slice(0, limitThemes));
  return sections.filter((s) => s.items.length > 0);
}

// 홈 히어로용 고정 키워드 — DB·캐시와 무관하게 코드 테이블(TRENDING) 순서 그대로, 상품이 0건이어도 키워드·타일은 남긴다
export const getFixedSections = (country: "KR" | "JP", limitThemes = 4) =>
  sectionsFor(TRENDING[country].slice(0, limitThemes));
