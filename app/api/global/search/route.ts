import { NextResponse } from "next/server";
import { searchMarkets, searchMercariMore } from "@/lib/market/search";
import { withTranslatedTitles } from "@/lib/market/translate-items";
import type { MarketSource, SearchFilters } from "@/lib/market/types";
import { allow, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

// 외부 마켓 통합 검색 (공개). 소스별 언어로 번역해 조회하고, 실패한 소스는 건너뛴다.
// mt(메루카리 다음 페이지 토큰)가 있으면 메루카리만 다음 36건 — term·필터(소스 통화)는 첫 페이지가 쓴 그대로 받는다.
export async function GET(req: Request) {
  if (!allow(`search:${clientIp(req)}`, 30)) return NextResponse.json({ error: "too many requests" }, { status: 429 });
  const { searchParams: p } = new URL(req.url);
  const lang = p.get("lang") === "ja" ? "ja" : "ko";
  const mt = (p.get("mt") ?? "").slice(0, 200);
  if (mt) {
    const term = (p.get("term") ?? "").trim().slice(0, 80);
    if (!term) return NextResponse.json({ items: [], excluded: [] });
    const num = (k: string) => { const n = Number(p.get(k)); return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined; };
    const f: SearchFilters = {
      min: num("min"), max: num("max"),
      sort: (["rec", "new", "price_asc", "price_desc"] as const).find((x) => x === p.get("sort")) ?? "rec",
      cond: p.get("cond") === "new" || p.get("cond") === "used" ? (p.get("cond") as "new" | "used") : undefined,
      sold: p.get("sold") === "1",
    };
    const r = await searchMercariMore(term, f, mt);
    return NextResponse.json({ items: await withTranslatedTitles(r.items, lang), excluded: await withTranslatedTitles(r.excluded, lang), next: r.mercariMore?.token ?? null });
  }
  const q = (p.get("q") ?? "").trim().slice(0, 80);
  const source = (p.get("source") ?? "all") as MarketSource | "all";
  if (!q) return NextResponse.json({ items: [], queries: {} });
  const { items, queries, excluded, widenedFrom } = await searchMarkets(q, source);
  return NextResponse.json({ items, queries, excludedCount: excluded.length, widenedFrom: widenedFrom ?? null });
}