import { mercariSearch } from "./mercari";
import { yahooAuctionSearch } from "./yahoo-auction";
import { daangnSearch } from "./daangn";
import { joongnaSearch } from "./joongna";
import { translateQueryTo } from "@/lib/translate";
import { LIVE_SOURCES, SOURCE_CURRENCY, type MarketItem, type MarketSource, type SearchFilters } from "./types";

// 당근·중고나라는 검색 파라미터가 없어 필터를 받은 뒤 거른다(applyFilters). ponytail: 두 사이트 검색 API 확인되면 서버 필터로 승격
const SEARCHERS: Record<MarketSource, (q: string, f: SearchFilters) => Promise<MarketItem[]>> = {
  mercari: mercariSearch,
  yahoo_auction: yahooAuctionSearch,
  daangn: (q) => daangnSearch(q),
  joongna: (q) => joongnaSearch(q),
};

// 소스가 서버에서 못 거른 것을 결과에서 한 번 더 — 4곳이 같은 규칙으로 보이게 (상태는 목록에 정보가 없어 소스 필터에만 의존)
export function applyFilters(items: MarketItem[], f: SearchFilters, toSource: (s: MarketSource) => (v: number) => number): MarketItem[] {
  let out = items.filter((it) => {
    const conv = toSource(it.source);
    if (!f.sold && it.soldOut) return false;
    if (f.min && it.price < conv(f.min)) return false;
    if (f.max && it.price > conv(f.max)) return false;
    return true;
  });
  if (f.sort === "price_asc" || f.sort === "price_desc") {
    const sign = f.sort === "price_asc" ? 1 : -1;
    out = out.slice().sort((a, b) => sign * (a.price / (toSource(a.source)(1) || 1) - b.price / (toSource(b.source)(1) || 1)));
  }
  return out;
}

// 소스 언어 그대로 검색 (번역 없음). 비슷한 상품처럼 검색어가 이미 그 나라 말일 때
export function searchSource(source: MarketSource, q: string): Promise<MarketItem[]> {
  return SEARCHERS[source](q, {}).catch(() => [] as MarketItem[]);
}

/**
 * 외부 마켓 통합 검색.
 * 소스별로 그 나라 언어로 검색어를 번역해 조회하고(일본 소스=ja, 한국 소스=ko),
 * 한 소스가 실패해도 나머지는 살린다. 결과는 소스별로 번갈아 배치.
 */
// filters의 가격은 뷰어 통화. rate = 외화→뷰어 통화 환율(viewer.rate)이라 소스 통화로는 나눈다
export async function searchMarkets(q: string, source: MarketSource | "all" | MarketSource[], filters: SearchFilters = {}, viewerCurrency: "KRW" | "JPY" = "KRW", rate = 1): Promise<{
  items: MarketItem[];
  queries: Partial<Record<MarketSource, string>>;
}> {
  const targets = (Array.isArray(source) ? source : source === "all" ? LIVE_SOURCES : [source]).filter(
    (s) => LIVE_SOURCES.includes(s as MarketSource)) as MarketSource[];
  if (targets.length === 0 || !q) return { items: [], queries: {} };

  // 소스 언어별 번역은 한 번씩만 (ja용 1회, ko용 1회)
  const needJa = targets.some((s) => SOURCE_CURRENCY[s] === "JPY");
  const needKo = targets.some((s) => SOURCE_CURRENCY[s] === "KRW");
  const [ja, ko] = await Promise.all([
    needJa ? translateQueryTo(q, "ja") : Promise.resolve(q),
    needKo ? translateQueryTo(q, "ko") : Promise.resolve(q),
  ]);

  const toSource = (s: MarketSource) => (v: number) => SOURCE_CURRENCY[s] === viewerCurrency ? v : Math.round(v / (rate || 1));
  const queries: Partial<Record<MarketSource, string>> = {};
  const results = await Promise.all(targets.map((s) => {
    const term = SOURCE_CURRENCY[s] === "JPY" ? ja : ko;
    queries[s] = term;
    const conv = toSource(s);
    const f: SearchFilters = { ...filters, min: filters.min ? conv(filters.min) : undefined, max: filters.max ? conv(filters.max) : undefined };
    return SEARCHERS[s](term, f).catch(() => [] as MarketItem[]);
  }));

  // 인터리브 — 한 소스가 목록을 도배하지 않게
  const items: MarketItem[] = [];
  const max = Math.max(0, ...results.map((r) => r.length));
  for (let i = 0; i < max && items.length < 60; i++) {
    for (const r of results) if (r[i]) items.push(r[i]);
  }
  return { items: applyFilters(items, filters, toSource), queries };
}
