import { mercariSearch } from "./mercari";
import { yahooAuctionSearch } from "./yahoo-auction";
import { daangnSearch } from "./daangn";
import { joongnaSearch } from "./joongna";
import { translateQueryTo } from "@/lib/translate";
import { LIVE_SOURCES, SOURCE_CURRENCY, type MarketItem, type MarketSource } from "./types";

const SEARCHERS: Record<MarketSource, (q: string) => Promise<MarketItem[]>> = {
  mercari: mercariSearch,
  yahoo_auction: yahooAuctionSearch,
  daangn: daangnSearch,
  joongna: joongnaSearch,
};

// 소스 언어 그대로 검색 (번역 없음). 비슷한 상품처럼 검색어가 이미 그 나라 말일 때
export function searchSource(source: MarketSource, q: string): Promise<MarketItem[]> {
  return SEARCHERS[source](q).catch(() => [] as MarketItem[]);
}

/**
 * 외부 마켓 통합 검색.
 * 소스별로 그 나라 언어로 검색어를 번역해 조회하고(일본 소스=ja, 한국 소스=ko),
 * 한 소스가 실패해도 나머지는 살린다. 결과는 소스별로 번갈아 배치.
 */
export async function searchMarkets(q: string, source: MarketSource | "all"): Promise<{
  items: MarketItem[];
  queries: Partial<Record<MarketSource, string>>;
}> {
  const targets = (source === "all" ? LIVE_SOURCES : [source]).filter(
    (s) => LIVE_SOURCES.includes(s as MarketSource)) as MarketSource[];
  if (targets.length === 0 || !q) return { items: [], queries: {} };

  // 소스 언어별 번역은 한 번씩만 (ja용 1회, ko용 1회)
  const needJa = targets.some((s) => SOURCE_CURRENCY[s] === "JPY");
  const needKo = targets.some((s) => SOURCE_CURRENCY[s] === "KRW");
  const [ja, ko] = await Promise.all([
    needJa ? translateQueryTo(q, "ja") : Promise.resolve(q),
    needKo ? translateQueryTo(q, "ko") : Promise.resolve(q),
  ]);

  const queries: Partial<Record<MarketSource, string>> = {};
  const results = await Promise.all(targets.map((s) => {
    const term = SOURCE_CURRENCY[s] === "JPY" ? ja : ko;
    queries[s] = term;
    return SEARCHERS[s](term).catch(() => [] as MarketItem[]);
  }));

  // 인터리브 — 한 소스가 목록을 도배하지 않게
  const items: MarketItem[] = [];
  const max = Math.max(0, ...results.map((r) => r.length));
  for (let i = 0; i < max && items.length < 60; i++) {
    for (const r of results) if (r[i]) items.push(r[i]);
  }
  return { items, queries };
}
