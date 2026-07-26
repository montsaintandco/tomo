import { NextResponse } from "next/server";
import { mercariSearch } from "@/lib/market/mercari";
import { yahooAuctionSearch } from "@/lib/market/yahoo-auction";
import { translateQueryToJa } from "@/lib/translate";
import type { MarketItem, MarketSource } from "@/lib/market/types";

export const runtime = "nodejs";

// 외부 마켓 통합 검색 (공개 — 게스트 열람 스펙과 동일). 파서 실패는 해당 소스만 빈 결과
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 80);
  const source = (searchParams.get("source") ?? "all") as MarketSource | "all";
  if (!q) return NextResponse.json({ items: [], query: "" });

  const ja = await translateQueryToJa(q);

  const tasks: Promise<MarketItem[]>[] = [];
  if (source === "all" || source === "mercari") tasks.push(mercariSearch(ja).catch(() => []));
  if (source === "all" || source === "yahoo_auction") tasks.push(yahooAuctionSearch(ja).catch(() => []));
  // daangn/joongna: 공개 API 없음 — 어드민 수동 등록분은 피드(external_items)에서 노출

  const results = await Promise.all(tasks);
  // 소스 인터리브 (전체 탭에서 한 소스가 도배하지 않게)
  const items: MarketItem[] = [];
  const max = Math.max(0, ...results.map((r) => r.length));
  for (let i = 0; i < max && items.length < 60; i++) {
    for (const r of results) if (r[i]) items.push(r[i]);
  }
  return NextResponse.json({ items, query: ja });
}
