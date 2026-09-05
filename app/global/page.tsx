import { createServerSupabase } from "@/lib/supabase/server";
import { getViewerOrGuest } from "@/lib/listings";
import ExternalItemCard, { type ExternalCardItem } from "@/components/ExternalItemCard";
import { TomoSymbol } from "@/components/Brand";
import { searchMarkets } from "@/lib/market/search";
import { LIVE_SOURCES, type MarketSource } from "@/lib/market/types";
import { t, type Lang } from "@/lib/i18n";
import Link from "next/link";
import { redirect } from "next/navigation";
import { parseMarketUrl } from "@/lib/market/url";
import SourceLogo from "@/components/SourceLogo";
import { withTranslatedTitles } from "@/lib/market/translate-items";

export const dynamic = "force-dynamic"; // 외부 검색은 요청 시점 조회

const TABS: (MarketSource | "all")[] = ["all", "mercari", "yahoo_auction", "daangn", "joongna"];

export default async function GlobalPage(props: {
  searchParams: Promise<{ q?: string; source?: string }>;
}) {
  const searchParams = await props.searchParams;
  const supabase = await createServerSupabase();
  const viewer = await getViewerOrGuest(supabase);
  const lang: Lang = viewer.language;
  const q = searchParams.q?.trim() ?? "";
  // SAZO식: 상품 URL을 붙여넣으면 검색 대신 바로 외부상품 상세로
  const target = parseMarketUrl(q);
  if (target) redirect(`/global/${target.source}/${target.id}`);
  const looksLikeUrl = /^https?:\/\//i.test(q);
  const source = (TABS.includes(searchParams.source as MarketSource) ? searchParams.source : "all") as MarketSource | "all";
  const liveSource = source === "all" || LIVE_SOURCES.includes(source as MarketSource);

  let items: ExternalCardItem[] = [];
  let usedQueries: string[] = [];

  if (q && liveSource && !looksLikeUrl) {
    // 실시간 검색 — 소스별 언어로 번역해 조회
    const { items: found, queries } = await searchMarkets(q, source);
    items = (await withTranslatedTitles(found, lang)) as ExternalCardItem[]; // 상대국 소스 제목은 뷰어 언어로
    usedQueries = Array.from(new Set(Object.values(queries).filter((s): s is string => !!s && s !== q)));
  } else if (!looksLikeUrl) {
    // 검색어 없거나 한국 소스: 캐시된 상품 (어드민 수동 등록 포함). 미지원 URL은 빈 상태로 안내
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

  const clearHref = source !== "all" ? `/global?source=${source}` : "/global";

  return (
    <main className="mx-auto max-w-md md:max-w-6xl md:px-6">
      <header className="sticky top-0 z-20 bg-white/95 px-4 pb-3 pt-3 backdrop-blur md:static md:bg-transparent md:px-0 md:pb-4 md:pt-8 md:backdrop-blur-0">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[17px] font-extrabold leading-tight text-ink md:text-xl">{t(lang, "global.title")}</h1>
            <p className="mt-0.5 text-[12px] text-ink-soft md:text-sm">
              {t(lang, "global.sub", { sources: `${t(lang, "sources.JP")}·${t(lang, "sources.KR")}` })}
            </p>
          </div>
          {viewer.guest && (
            <Link href="/login" className="btn shrink-0 bg-tomo-navy px-4 py-2 text-sm text-white">{t(lang, "nav.login")}</Link>
          )}
        </div>

        <form className="mb-3 md:max-w-xl" role="search">
          <label htmlFor="global-q" className="sr-only">{t(lang, "global.searchLabel")}</label>
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint md:left-4 md:h-[18px] md:w-[18px]" aria-hidden>
              <circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" />
            </svg>
            {/* 16px 고정 — 14px 이하 입력은 iOS 사파리가 포커스 시 뷰포트를 확대한다 */}
            <input id="global-q" name="q" type="search" enterKeyHint="search" autoComplete="off" defaultValue={q}
              placeholder={t(lang, "global.placeholder")}
              className={`w-full rounded-full bg-tomo-ivory py-2.5 pl-10 text-base placeholder:text-ink-soft md:py-3.5 md:pl-12 ${q ? "pr-11" : "pr-4"}`} />
            {q && (
              <Link href={clearHref} aria-label={t(lang, "search.clear")}
                className="press absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft hover:text-ink">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                  strokeLinecap="round" className="h-4 w-4" aria-hidden>
                  <path d="m7 7 10 10M17 7 7 17" />
                </svg>
              </Link>
            )}
          </div>
          {source !== "all" && <input type="hidden" name="source" value={source} />}
          <p className="mt-1.5 px-1 text-[11px] text-ink-soft">{t(lang, "global.urlHint")}</p>
        </form>

        <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0" aria-label={t(lang, "global.searchLabel")}>
          {TABS.map((s) => {
            const params = new URLSearchParams();
            if (s !== "all") params.set("source", s);
            if (q) params.set("q", q);
            const qs = params.toString();
            const live = s === "all" || LIVE_SOURCES.includes(s as MarketSource);
            return (
              <Link key={s} href={qs ? `/global?${qs}` : "/global"} aria-current={source === s ? "page" : undefined}
                className={`press inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-3 text-[13px] font-bold transition-colors md:px-4 md:py-2 md:text-sm ${
                  source === s ? "bg-tomo-navy text-white shadow-soft" : "bg-white text-ink-soft hover:text-ink"}`}>
                {s !== "all" && live && <SourceLogo source={s as MarketSource} lang={lang} size={16} />}
                {s === "all" ? t(lang, "global.all") : t(lang, `source.${s}`)}
                {!live && <span className="ml-1 font-normal opacity-60">{t(lang, "global.comingSoon")}</span>}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="px-4 pb-6 pt-2 md:px-0 md:pb-16">
        {q && usedQueries.length > 0 && (
          <p className="mb-3 text-[12px] text-ink-soft">{t(lang, "global.translatedAs", { q: usedQueries.join(" · ") })}</p>
        )}

        {items.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 md:gap-x-5 md:gap-y-7 lg:grid-cols-5">
            {items.map((it) => (
              <ExternalItemCard key={`${it.source}-${it.sourceId}`} item={it}
                rate={viewer.rate} viewerCurrency={viewer.currency} lang={lang} />
            ))}
          </div>
        ) : (
          <div className="mt-12 flex flex-col items-center px-6 text-center">
            <TomoSymbol />
            <p className="mt-3 text-sm text-ink-soft">
              {looksLikeUrl ? t(lang, "global.urlFail") : q ? t(lang, "empty.search", { q }) : t(lang, "global.emptyIdle")}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              {looksLikeUrl ? t(lang, "global.urlHint") : q ? t(lang, "global.emptySearchSub") : t(lang, "global.emptyIdleSub")}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

export const metadata = { title: "해외직구 · 海外購入 | TOMO" };
