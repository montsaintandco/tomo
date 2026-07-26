import { NextResponse } from "next/server";
import { searchMarkets } from "@/lib/market/search";
import type { MarketSource } from "@/lib/market/types";

export const runtime = "nodejs";

// 외부 마켓 통합 검색 (공개). 소스별 언어로 번역해 조회하고, 실패한 소스는 건너뛴다.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 80);
  const source = (searchParams.get("source") ?? "all") as MarketSource | "all";
  if (!q) return NextResponse.json({ items: [], queries: {} });

  const { items, queries } = await searchMarkets(q, source);
  return NextResponse.json({ items, queries });
}
