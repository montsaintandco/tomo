import { mercariSearchPage } from "./mercari";
import { yahooAuctionSearch } from "./yahoo-auction";
import { yahooFleaSearch } from "./yahoo-flea";
import { daangnSearch } from "./daangn";
import { joongnaSearch } from "./joongna";
import { translateQueryTo } from "../translate";
import { widenCandidates } from "../search-widen";
import { cached } from "../scrape-cache";
import { UNBUYABLE_AUCTION } from "../unbuyable";
import { LIVE_SOURCES, SOURCE_CURRENCY, type MarketItem, type MarketSource, type SearchFilters } from "./types";
import type { CatScope } from "../categories";

type Page = { items: MarketItem[]; next?: string };

// 당근·중고나라는 검색 파라미터가 없어 필터를 받은 뒤 거른다(applyFilters). ponytail: 두 사이트 검색 API 확인되면 서버 필터로 승격
const SEARCHERS: Record<MarketSource, (q: string, f: SearchFilters, token?: string) => Promise<Page>> = {
  mercari: (q, f, token) => mercariSearchPage(q, f, token),
  yahoo_auction: (q, f) => yahooAuctionSearch(q, f).then((items) => ({ items })),
  yahoo_flea: (q, f) => yahooFleaSearch(q, f).then((items) => ({ items })),
  daangn: (q, f) => daangnSearch(q, f.krCat || undefined).then((items) => ({ items })),
  joongna: (q, f) => joongnaSearch(q, f.krCat || undefined).then((items) => ({ items })),
};

// 같은 검색은 2분 동안 다시 부르지 않고, 마켓이 막히면 30분 안의 옛 결과로 버틴다(lib/scrape-cache). 그래도 실패면 빈 결과
function fetchSource(s: MarketSource, term: string, f: SearchFilters, token = ""): Promise<Page> {
  return cached(`${s}|${term}|${JSON.stringify(f)}|${token}`, () => SEARCHERS[s](term, f, token)).catch(() => ({ items: [] }));
}

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

/** 살 수 없는 출품(専用·取り置き·예약중 등)은 excluded 로 빼고, 경매(구경만)는 남기되 맨 뒤로 */
export function splitUnbuyable(items: MarketItem[]): { items: MarketItem[]; excluded: MarketItem[] } {
  const buyable: MarketItem[] = [], auctions: MarketItem[] = [], excluded: MarketItem[] = [];
  for (const it of items) (!it.unbuyable ? buyable : it.unbuyable === UNBUYABLE_AUCTION ? auctions : excluded).push(it);
  return { items: [...buyable, ...auctions], excluded };
}

// 소스 언어 그대로 검색 (번역 없음). 비슷한 상품처럼 검색어가 이미 그 나라 말일 때. 살 수 없는 출품은 뺀다
export async function searchSource(source: MarketSource, q: string): Promise<MarketItem[]> {
  return (await fetchSource(source, q, {})).items.filter((i) => !i.unbuyable);
}

export type MercariMore = { token: string; term: string; f: SearchFilters };

export type SearchResult = {
  items: MarketItem[];       // 살 수 있는 것(경매는 맨 뒤)
  excluded: MarketItem[];    // 살 수 없는 출품 — 화면 「제외 N건 보기」로 되살린다
  queries: Partial<Record<MarketSource, string>>; // 소스별로 실제 결과를 낸 검색어
  widenedFrom?: string;      // 0건이라 넓혔을 때 원래(번역된) 검색어
  mercariMore?: MercariMore; // 메루카리 다음 페이지(있으면 「더 보기」). f 는 소스 통화(엔)
};

/**
 * 외부 마켓 통합 검색.
 * 소스별로 그 나라 언어로 검색어를 번역해 조회하고(일본 소스=ja, 한국 소스=ko),
 * 한 소스가 실패해도 나머지는 살린다. 결과는 소스별로 번갈아 배치. 전부 0건이면 표현을 넓혀 최대 3번 다시 찾는다.
 */
// filters의 가격은 뷰어 통화. rate = 외화→뷰어 통화 환율(viewer.rate)이라 소스 통화로는 나눈다
// cat = 카테고리 범위(lib/categories.ts catScope). 메루카리는 categoryId 로 거르고(+mq), 번호가 없는 소스는 검색어가 없을 때만 cat.ja·cat.ko 로 찾는다
export async function searchMarkets(q: string, source: MarketSource | "all" | MarketSource[], filters: SearchFilters = {}, viewerCurrency: "KRW" | "JPY" = "KRW", rate = 1, cat?: CatScope): Promise<SearchResult> {
  let targets = (Array.isArray(source) ? source : source === "all" ? LIVE_SOURCES : [source]).filter(
    (s) => LIVE_SOURCES.includes(s as MarketSource)) as MarketSource[];
  // 카테고리를 고르고 여러 소스(「전체」)면, 번호로 거를 수 있는 메루카리가 있을 때 메루카리만 — 키워드로 찾은 다른 소스가 섞이면 분류가 흐려진다.
  // 소스 탭을 직접 고르면(한 곳) 그 소스는 키워드로 찾는다. 한국 소스만 보는 일본 사용자는 전부 키워드
  if (cat && targets.length > 1 && targets.includes("mercari")) targets = ["mercari"];
  if (targets.length === 0 || (!q && !cat)) return { items: [], excluded: [], queries: {} };

  // 소스 언어별 번역은 한 번씩만 (ja용 1회, ko용 1회). 검색어가 없으면(카테고리만) 번역하지 않는다
  const needJa = !!q && targets.some((s) => SOURCE_CURRENCY[s] === "JPY");
  const needKo = !!q && targets.some((s) => SOURCE_CURRENCY[s] === "KRW");
  const [ja, ko] = await Promise.all([
    needJa ? translateQueryTo(q, "ja") : Promise.resolve(q),
    needKo ? translateQueryTo(q, "ko") : Promise.resolve(q),
  ]);

  const toSource = (s: MarketSource) => (v: number) => SOURCE_CURRENCY[s] === viewerCurrency ? v : Math.round(v / (rate || 1));
  const plainTerm = (s: MarketSource, j: string, k: string) => (SOURCE_CURRENCY[s] === "JPY" ? j : k);
  // 실제로 마켓에 보낼 말 — 메루카리+카테고리는 검색어(없으면 빈 말) + mq, 번호 없는 소스는 검색어가 없으면 카테고리 이름
  const termOf = (s: MarketSource, j: string, k: string) => {
    const t = plainTerm(s, j, k);
    if (!cat) return t;
    if (s === "mercari") return [t, cat.mq].filter(Boolean).join(" ");
    return t || (SOURCE_CURRENCY[s] === "JPY" ? cat.ja : cat.ko);
  };
  const fOf = (s: MarketSource): SearchFilters => {
    const conv = toSource(s);
    return {
      ...filters, min: filters.min ? conv(filters.min) : undefined, max: filters.max ? conv(filters.max) : undefined,
      ...(cat && s === "mercari" ? { catIds: cat.mercari } : {}),
      // 한국 마켓 카테고리 번호(lib/categories.ts KR_MARKET_CAT, 2026-11-26 실측). 0·없음이면 키워드만
      ...(cat && s === "joongna" && cat.jn ? { krCat: cat.jn } : {}),
      ...(cat && s === "daangn" && cat.dg ? { krCat: cat.dg } : {}),
    };
  };
  const run = (srcs: MarketSource[], j: string, k: string) => Promise.all(srcs.map((s) => fetchSource(s, termOf(s, j, k), fOf(s))));

  let results = await run(targets, ja, ko);
  let used = { ja, ko };
  let widenedFrom: string | undefined;
  if (q && results.every((r) => r.items.length === 0)) {
    const jaC = needJa ? widenCandidates(ja) : [], koC = needKo ? widenCandidates(ko) : [];
    for (let i = 0; i < Math.max(jaC.length, koC.length); i++) {
      const j = jaC[i] ?? ja, k = koC[i] ?? ko;
      const srcs = targets.filter((s) => (SOURCE_CURRENCY[s] === "JPY" ? jaC[i] : koC[i]));
      const r = await run(srcs, j, k);
      if (r.some((x) => x.items.length > 0)) {
        results = r; used = { ja: j, ko: k };
        widenedFrom = Array.from(new Set(srcs.map((s) => plainTerm(s, ja, ko)))).join(" · ");
        targets.splice(0, targets.length, ...srcs);
        break;
      }
    }
  }

  const queries: Partial<Record<MarketSource, string>> = {};
  for (const s of targets) queries[s] = plainTerm(s, used.ja, used.ko); // 번역 검색어만(카테고리 말은 빼고) — 화면 「번역 검색어」 칩

  // 인터리브 — 한 소스가 목록을 도배하지 않게. 80건 = 메루카리 36 + 플리마 40 이 다 들어가는 크기(메루카리 2페이지가 빈틈없이 이어지게)
  const items: MarketItem[] = [];
  const max = Math.max(0, ...results.map((r) => r.items.length));
  for (let i = 0; i < max && items.length < 80; i++) {
    for (const r of results) if (r.items[i]) items.push(r.items[i]);
  }
  const token = results[targets.indexOf("mercari")]?.next;
  const mercariMore = token ? { token, term: termOf("mercari", used.ja, used.ko), f: fOf("mercari") } : undefined;
  return { ...splitUnbuyable(applyFilters(items, filters, toSource)), queries, widenedFrom, mercariMore };
}

/** 메루카리 다음 페이지 — term·필터는 첫 페이지가 쓴 그대로(소스 통화) 넘긴다 */
export async function searchMercariMore(term: string, f: SearchFilters, token: string): Promise<SearchResult> {
  const r = await fetchSource("mercari", term, f, token);
  return { ...splitUnbuyable(r.items.filter((i) => f.sold || !i.soldOut)), queries: { mercari: term }, mercariMore: r.next ? { token: r.next, term, f } : undefined };
}