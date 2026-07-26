import { createServerSupabase } from "@/lib/supabase/server";
import { getViewerOrGuest } from "@/lib/listings";
import ExternalItemCard, { type ExternalCardItem } from "@/components/ExternalItemCard";
import { searchMarkets } from "@/lib/market/search";
import { SOURCE_LABEL, LIVE_SOURCES, type MarketSource } from "@/lib/market/types";
import Link from "next/link";

export const dynamic = "force-dynamic"; // 외부 검색은 요청 시점 조회

const TABS: (MarketSource | "all")[] = ["all", "mercari", "yahoo_auction", "daangn", "joongna"];

export default async function GlobalPage({ searchParams }: {
  searchParams: { q?: string; source?: string };
}) {
  const supabase = await createServerSupabase();
  const viewer = await getViewerOrGuest(supabase);
  const q = searchParams.q?.trim() ?? "";
  const source = (TABS.includes(searchParams.source as MarketSource) ? searchParams.source : "all") as MarketSource | "all";
  const liveSource = source === "all" || LIVE_SOURCES.includes(source as MarketSource);

  let items: ExternalCardItem[] = [];
  let usedQueries: string[] = [];

  if (q && liveSource) {
    // 실시간 검색 — 소스별 언어로 번역해 조회
    const { items: found, queries } = await searchMarkets(q, source);
    items = found as ExternalCardItem[];
    usedQueries = Array.from(new Set(Object.values(queries).filter((t): t is string => !!t && t !== q)));
  } else {
    // 검색어 없거나 한국 소스: 캐시된 상품 (어드민 수동 등록 포함)
    let cache = supabase.from("external_items")
      .select("source, source_id, title, title_translated, price, currency, images, status")
      .eq("status", "active").order("fetched_at", { ascending: false }).limit(60);
    if (source !== "all") cache = cache.eq("source", source);
    const { data } = await cache;
    items = (data ?? []).map((r) => ({
      source: r.source as MarketSource, sourceId: r.source_id,
      title: r.title_translated || r.title, price: r.price,
      currency: r.currency as "KRW" | "JPY", thumb: (r.images as string[])[0] ?? "",
    }));
  }

  return (
    <main className="mx-auto max-w-md">
      <header className="sticky top-0 z-20 bg-tomo-ivory/95 px-4 pb-2 pt-3 backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="font-brand text-xl text-tomo-navy">해외직구</h1>
          {viewer.guest && (
            <Link href="/login" className="btn bg-tomo-navy px-4 py-1.5 text-sm text-white">로그인</Link>
          )}
        </div>
        <p className="mb-3 text-xs text-gray-500">일본·한국 마켓 상품을 대신 사서 보내드려요. 견적 확인 후 결제하면 됩니다.</p>

        <form className="mb-3" role="search">
          <label htmlFor="global-q" className="sr-only">해외 마켓 상품 검색</label>
          <input id="global-q" name="q" defaultValue={q} placeholder="찾는 물건을 검색하세요 (예: 필름카메라)"
            className="w-full rounded-full bg-white px-4 py-2.5 text-sm shadow-[0_1px_2px_rgba(12,68,124,0.05)] placeholder:text-gray-400" />
          {source !== "all" && <input type="hidden" name="source" value={source} />}
        </form>

        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {TABS.map((s) => {
            const params = new URLSearchParams();
            if (s !== "all") params.set("source", s);
            if (q) params.set("q", q);
            const qs = params.toString();
            const live = s === "all" || LIVE_SOURCES.includes(s as MarketSource);
            return (
              <Link key={s} href={qs ? `/global?${qs}` : "/global"}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors ${
                  source === s ? "bg-tomo-navy text-white" : "bg-white text-gray-500 hover:text-gray-800"}`}>
                {s === "all" ? "전체" : SOURCE_LABEL[s as MarketSource]}
                {!live && <span className="ml-1 font-normal opacity-60">준비중</span>}
              </Link>
            );
          })}
        </div>
      </header>

      <div className="px-4 pb-6 pt-2">
        {q && usedQueries.length > 0 && (
          <p className="mb-2 text-xs text-gray-400">번역해서 찾았어요: {usedQueries.join(" · ")}</p>
        )}

        {items.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-4">
            {items.map((it) => (
              <ExternalItemCard key={`${it.source}-${it.sourceId}`} item={it}
                rate={viewer.rate} viewerCurrency={viewer.currency} />
            ))}
          </div>
        ) : (
          <div className="mt-14 px-6 text-center">
            <p className="text-sm text-gray-500">
              {q ? `'${q}' 검색 결과가 없어요` : "찾는 물건을 검색해 보세요"}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {q ? "다른 검색어를 써보세요" : "메루카리·야후·당근·중고나라를 한 번에 찾아드려요"}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
