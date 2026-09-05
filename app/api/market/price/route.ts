import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { searchMarkets } from "@/lib/market/search";
import { SOURCE_CURRENCY, type MarketSource } from "@/lib/market/types";

export const runtime = "nodejs";

// 판매 마법사: 제목으로 4마켓을 검색해 같은 통화 상품의 시세(중앙값·범위)를 돌려준다.
// 경매(현재가)는 제외. 결과는 10분 캐시 — 같은 제목을 여러 번 눌러도 파서를 다시 돌리지 않는다
const priceStats = (q: string, currency: "KRW" | "JPY") =>
  unstable_cache(async () => {
    const { items } = await searchMarkets(q, "all");
    const prices = items
      .filter((it) => it.currency === currency && !it.auction && !it.soldOut && it.price > 0)
      .map((it) => it.price)
      .sort((a, b) => a - b);
    if (prices.length === 0) return { count: 0, sources: [] as MarketSource[] };
    // 양끝 10%씩 잘라 극단값(부품·세트 묶음) 완화
    const trim = Math.floor(prices.length * 0.1);
    const core = prices.slice(trim, prices.length - trim) as number[];
    const arr = core.length ? core : prices;
    const median = arr[Math.floor(arr.length / 2)];
    const sources = Array.from(new Set(items.filter((it) => it.currency === currency).map((it) => it.source)));
    return { count: prices.length, median, min: arr[0], max: arr[arr.length - 1], sources };
  }, ["price-stats", "v1", currency, q.toLowerCase()], { revalidate: 600 })();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const currency = url.searchParams.get("currency") === "JPY" ? "JPY" : "KRW";
  if (q.length < 2) return NextResponse.json({ error: "query too short" }, { status: 400 });
  // 통화에 맞는 소스만 의미 있음 (KRW=당근·중고나라, JPY=메루카리·야후)
  const relevant = (Object.keys(SOURCE_CURRENCY) as MarketSource[]).filter((s) => SOURCE_CURRENCY[s] === currency);
  try {
    const stats = await priceStats(q, currency);
    return NextResponse.json({ ...stats, sources: stats.sources.filter((s) => relevant.includes(s)) });
  } catch {
    return NextResponse.json({ count: 0, sources: [] });
  }
}
