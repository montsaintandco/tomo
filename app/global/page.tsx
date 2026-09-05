import { createServerSupabase } from "@/lib/supabase/server";
import { getViewerOrGuest } from "@/lib/listings";
import ExternalItemCard, { type ExternalCardItem } from "@/components/ExternalItemCard";
import { TomoSymbol } from "@/components/Brand";
import { searchMarkets } from "@/lib/market/search";
import { LIVE_SOURCES, SOURCE_CURRENCY, type MarketSource, type SearchFilters } from "@/lib/market/types";
import { t, otherCountry, type Lang } from "@/lib/i18n";
import Link from "next/link";
import { redirect } from "next/navigation";
import { parseMarketUrl } from "@/lib/market/url";
import SourceLogo from "@/components/SourceLogo";
import { withTranslatedTitles } from "@/lib/market/translate-items";

export const dynamic = "force-dynamic"; // 외부 검색은 요청 시점 조회

// 해외직구 = 상대국 마켓만. 내 나라 마켓은 TOMO가 더해줄 게 없다(대행 불필요) — 한국 뷰어는 메루카리·야후옥션, 일본 뷰어는 당근·중고나라
function sourcesFor(country: "KR" | "JP"): MarketSource[] {
  return LIVE_SOURCES.filter((s) => SOURCE_CURRENCY[s] === (country === "KR" ? "JPY" : "KRW"));
}

export default async function GlobalPage(props: {
  searchParams: Promise<{ q?: string; source?: string; min?: string; max?: string; sort?: string; cond?: string; sold?: string }>;
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
  const mySources = sourcesFor(viewer.country);
  const TABS: (MarketSource | "all")[] = ["all", ...mySources];
  const source = (mySources.includes(searchParams.source as MarketSource) ? searchParams.source : "all") as MarketSource | "all";
  const liveSource = source === "all" || LIVE_SOURCES.includes(source as MarketSource);
  // 필터 (메루카리 참조: 가격·상태·정렬·판매완료). 가격은 뷰어 통화로 입력받아 소스 통화로 환산
  const num = (v?: string) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined; };
  const filters: SearchFilters = {
    min: num(searchParams.min), max: num(searchParams.max),
    sort: (["rec", "new", "price_asc", "price_desc"] as const).find((x) => x === searchParams.sort) ?? "rec",
    cond: searchParams.cond === "new" || searchParams.cond === "used" ? searchParams.cond : undefined,
    sold: searchParams.sold === "1",
  };
  const activeFilters = [filters.min, filters.max, filters.cond, filters.sold || undefined, filters.sort !== "rec" || undefined].filter(Boolean).length;
  const filterParams = new URLSearchParams();
  if (filters.min) filterParams.set("min", String(filters.min));
  if (filters.max) filterParams.set("max", String(filters.max));
  if (filters.sort !== "rec") filterParams.set("sort", filters.sort!);
  if (filters.cond) filterParams.set("cond", filters.cond);
  if (filters.sold) filterParams.set("sold", "1");

  let items: ExternalCardItem[] = [];
  let usedQueries: string[] = [];

  if (q && liveSource && !looksLikeUrl) {
    // 실시간 검색 — 소스별 언어로 번역해 조회
    const { items: found, queries } = await searchMarkets(q, source === "all" ? mySources : source, filters, viewer.currency, viewer.rate);
    items = (await withTranslatedTitles(found, lang)) as ExternalCardItem[]; // 상대국 소스 제목은 뷰어 언어로
    usedQueries = Array.from(new Set(Object.values(queries).filter((s): s is string => !!s && s !== q)));
  } else if (!looksLikeUrl) {
    // 검색어 없거나 한국 소스: 캐시된 상품 (어드민 수동 등록 포함). 미지원 URL은 빈 상태로 안내
    let cache = supabase.from("external_items")
      .select("source, source_id, title, title_translated, price, currency, images, status")
      .eq("status", "active").order("fetched_at", { ascending: false }).limit(60);
    cache = source !== "all" ? cache.eq("source", source) : cache.in("source", mySources);
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
              {t(lang, "global.sub", { sources: t(lang, `sources.${otherCountry(viewer.country)}`) })}
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
          {Array.from(filterParams.entries()).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <p className="mt-1.5 px-1 text-[11px] text-ink-soft">{t(lang, "global.urlHint", { sources: t(lang, `sources.${otherCountry(viewer.country)}`) })}</p>
        </form>

        <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0" aria-label={t(lang, "global.searchLabel")}>
          {TABS.map((s) => {
            const params = new URLSearchParams(filterParams);
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

        {/* 필터 — 메루카리 참조(가격·상태·정렬·판매완료)를 4마켓 공통으로. 네이티브 details+select, JS 없음 */}
        {q && liveSource && (
          <details className="group mt-2" open={activeFilters > 0}>
            <summary className="press inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-tomo-navy/15 bg-white px-3 py-1.5 text-[13px] font-bold text-ink [&::-webkit-details-marker]:hidden">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden><path d="M4 6h16M7 12h10M10 18h4" /></svg>
              {t(lang, "filter.title")}{activeFilters > 0 && <span className="rounded-full bg-tomo-coral-deep px-1.5 text-[11px] text-white">{activeFilters}</span>}
            </summary>
            <form className="reveal mt-2 flex flex-wrap items-end gap-x-3 gap-y-2 rounded-card border border-tomo-navy/10 bg-white p-3 text-[13px]">
              <input type="hidden" name="q" value={q} />
              {source !== "all" && <input type="hidden" name="source" value={source} />}
              <label className="flex flex-col gap-1 text-[11px] font-bold text-ink-soft">{t(lang, "filter.price")} ({viewer.currency === "KRW" ? "원" : "¥"})
                <span className="flex items-center gap-1">
                  <input name="min" type="number" inputMode="numeric" min={0} defaultValue={filters.min ?? ""} placeholder={t(lang, "filter.min")} className="w-24 rounded-[6px] border border-tomo-navy/15 px-2 py-1.5 text-base font-normal text-ink md:text-[13px]" />
                  <span aria-hidden>–</span>
                  <input name="max" type="number" inputMode="numeric" min={0} defaultValue={filters.max ?? ""} placeholder={t(lang, "filter.max")} className="w-24 rounded-[6px] border border-tomo-navy/15 px-2 py-1.5 text-base font-normal text-ink md:text-[13px]" />
                </span>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-ink-soft">{t(lang, "filter.cond")}
                <select name="cond" defaultValue={filters.cond ?? ""} className="rounded-[6px] border border-tomo-navy/15 bg-white px-2 py-1.5 text-base font-normal text-ink md:text-[13px]">
                  <option value="">{t(lang, "filter.condAll")}</option><option value="new">{t(lang, "filter.condNew")}</option><option value="used">{t(lang, "filter.condUsed")}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-ink-soft">{t(lang, "filter.sort")}
                <select name="sort" defaultValue={filters.sort} className="rounded-[6px] border border-tomo-navy/15 bg-white px-2 py-1.5 text-base font-normal text-ink md:text-[13px]">
                  <option value="rec">{t(lang, "filter.sortRec")}</option><option value="new">{t(lang, "filter.sortNew")}</option><option value="price_asc">{t(lang, "filter.sortAsc")}</option><option value="price_desc">{t(lang, "filter.sortDesc")}</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5 py-1.5 text-[13px] text-ink"><input type="checkbox" name="sold" value="1" defaultChecked={filters.sold} className="h-4 w-4 accent-[#1d4ed8]" />{t(lang, "filter.sold")}</label>
              <button type="submit" className="btn bg-tomo-navy px-4 py-2 text-[13px] text-white">{t(lang, "filter.apply")}</button>
              {activeFilters > 0 && <Link href={`/global?q=${encodeURIComponent(q)}${source !== "all" ? `&source=${source}` : ""}`} className="press py-2 text-[13px] text-ink-soft underline underline-offset-2">{t(lang, "filter.reset")}</Link>}
              <p className="basis-full text-[11px] text-ink-faint">{t(lang, "filter.note")}</p>
            </form>
          </details>
        )}
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
