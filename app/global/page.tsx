import { createServerSupabase } from "@/lib/supabase/server";
import { getViewerOrGuest } from "@/lib/listings";
import ExternalItemCard, { type ExternalCardItem } from "@/components/ExternalItemCard";
import { mercariSearch } from "@/lib/market/mercari";
import { yahooAuctionSearch } from "@/lib/market/yahoo-auction";
import { translateQueryToJa } from "@/lib/translate";
import { SOURCE_LABEL, LIVE_SOURCES, type MarketSource, type MarketItem } from "@/lib/market/types";
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
  let translated = "";

  if (q && liveSource) {
    // 실시간 검색 (한글 검색어는 일본어로 번역해 조회)
    translated = await translateQueryToJa(q);
    const tasks: Promise<MarketItem[]>[] = [];
    if (source === "all" || source === "mercari") tasks.push(mercariSearch(translated).catch(() => []));
    if (source === "all" || source === "yahoo_auction") tasks.push(yahooAuctionSearch(translated).catch(() => []));
    const results = await Promise.all(tasks);
    const max = Math.max(0, ...results.map((r) => r.length));
    for (let i = 0; i < max && items.length < 60; i++) {
      for (const r of results) if (r[i]) items.push(r[i] as ExternalCardItem);
    }
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

  const rate = viewer.currency === "KRW" ? viewer.rate : 1; // JPY 상품 → 뷰어 통화

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-tomo-navy">해외직구 · 海外直購</h1>
        {viewer.guest && (
          <Link href="/login" className="rounded-full bg-tomo-coral px-4 py-1.5 text-sm font-bold text-white">
            로그인
          </Link>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500">
        일본 마켓 상품을 대신 구매해 드려요 · 견적 확인 후 결제
      </p>

      <form className="mb-3">
        <input name="q" defaultValue={q} placeholder="검색어를 한국어로 입력하세요"
          className="w-full rounded-full border px-4 py-2 text-sm" />
        {source !== "all" && <input type="hidden" name="source" value={source} />}
      </form>

      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        {TABS.map((s) => {
          const params = new URLSearchParams();
          if (s !== "all") params.set("source", s);
          if (q) params.set("q", q);
          const qs = params.toString();
          const live = s === "all" || LIVE_SOURCES.includes(s as MarketSource);
          return (
            <Link key={s} href={qs ? `/global?${qs}` : "/global"}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                source === s ? "bg-tomo-navy text-white" : "border bg-white text-gray-600"}`}>
              {s === "all" ? "전체" : SOURCE_LABEL[s as MarketSource]}
              {!live && <span className="ml-1 font-normal text-gray-400">준비중</span>}
            </Link>
          );
        })}
      </div>

      {translated && translated !== q && (
        <p className="mb-2 text-xs text-gray-400">일본어 검색어: {translated}</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {items.map((it) => (
          <ExternalItemCard key={`${it.source}-${it.sourceId}`} item={it}
            rate={rate} viewerCurrency={viewer.currency} />
        ))}
      </div>

      {items.length === 0 && (
        <p className="mt-16 text-center text-sm text-gray-400">
          {!liveSource
            ? "이 마켓은 연동 준비 중이에요"
            : q ? "검색 결과가 없어요" : "검색어를 입력해 일본 마켓을 둘러보세요"}
        </p>
      )}
    </main>
  );
}
