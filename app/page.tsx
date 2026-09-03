import { createServerSupabase } from "@/lib/supabase/server";
import { getViewerOrGuest } from "@/lib/listings";
import ListingRow, { type FeedListing } from "@/components/ListingRow";
import { Wordmark, TomoSymbol } from "@/components/Brand";
import HomeHub from "@/components/HomeHub";
import LangToggle from "@/components/LangToggle";
import CategoryChips, { isCategory } from "@/components/CategoryChips";
import { t } from "@/lib/i18n";
import Link from "next/link";

// 구매 루트: 전체 / 내 동네 직거래 / 상대국 여행 중 직거래 (해외 대행구매는 /global)
const TABS = [["all", "tab.all"], ["local", "tab.local"], ["travel", "tab.travel"]] as const;
const FEED_LIMIT = 40;
const FEED_SELECT = "id, title, price, currency, source_language, country, region, status, images, created_at, trade_method, cross_border_enabled, listing_translations(language, title)";

export default async function Home(props: { searchParams: Promise<{ tab?: string; q?: string; cat?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = await createServerSupabase();
  const viewer = await getViewerOrGuest(supabase);
  const tab = searchParams.tab ?? "all";
  const q = searchParams.q?.trim();
  const cat = isCategory(searchParams.cat) ? searchParams.cat : undefined;
  const localNeedsLogin = tab === "local" && viewer.guest;
  const lang = viewer.language;
  // 파라미터 없는 첫 진입 = 허브. 검색·탭·카테고리는 기존 리스트 모드
  const hub = !q && !searchParams.tab && !cat;

  // 판매중 → 예약중 → 거래완료 순으로 노출 (당근·메루카리 관행: 끝난 거래는 뒤로)
  let query = supabase.from("listings")
    .select(FEED_SELECT)
    .order("status", { ascending: true })   // active < reserved < sold (enum 정의 순)
    .order("bumped_at", { ascending: false })
    .limit(FEED_LIMIT);

  if (cat) query = query.eq("category", cat);
  if (tab === "local" && !viewer.guest) {
    query = query.eq("country", viewer.country).eq("region", viewer.region).in("trade_method", ["direct", "both"]);
  } else if (tab === "travel") {
    // 상대국에서 직접 만나 거래할 수 있는 상품 (여행 갔을 때). 게스트는 KR 기준으로 일본 상품
    query = query.neq("country", viewer.country).in("trade_method", ["direct", "both"]);
  }

  if (q) {
    const pattern = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const [tRes, oRes] = await Promise.all([
      supabase.from("listing_translations").select("listing_id").ilike("title", pattern).limit(60),
      supabase.from("listings").select("id").ilike("title", pattern).limit(60),
    ]);
    const ids = Array.from(new Set([
      ...(tRes.data ?? []).map((t) => t.listing_id),
      ...(oRes.data ?? []).map((o) => o.id),
    ]));
    query = query.in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }

  const { data: listings, error: feedError } = localNeedsLogin || hub
    ? { data: [], error: null }
    : await query;

  // 허브용 데이터 — 국내 판매중 최신 12 + 상대국 직거래 가능 최신 8 (병렬)
  const [hubOwn, hubTravel] = hub
    ? await Promise.all([
        supabase.from("listings").select(FEED_SELECT).eq("status", "active")
          .eq("country", viewer.country).order("bumped_at", { ascending: false }).limit(12),
        supabase.from("listings").select(FEED_SELECT).eq("status", "active")
          .neq("country", viewer.country).in("trade_method", ["direct", "both"])
          .order("bumped_at", { ascending: false }).limit(8),
      ])
    : [null, null];

  return (
    <main className="mx-auto max-w-md md:max-w-6xl md:px-6">
      {/* 워드마크 행은 스크롤과 함께 흘러간다 — 고정 크롬은 검색+탭만 (피드가 제품이다) */}
      <div className="flex items-center justify-between px-4 pb-2 pt-3 md:hidden">
        <Link href="/" className="press"><Wordmark /></Link>
        <div className="flex items-center gap-3">
          <LangToggle lang={lang} label={t(lang, "lang.toggle")} />
          {viewer.guest && (
            <Link href="/login" className="btn bg-tomo-navy px-4 py-2 text-sm text-white">{t(lang, "nav.login")}</Link>
          )}
        </div>
      </div>
      <header className="sticky top-0 z-20 bg-white/95 px-4 pb-3 pt-2 backdrop-blur md:static md:bg-transparent md:px-0 md:pb-4 md:pt-8 md:backdrop-blur-0">
        <form className="mb-3 md:max-w-xl" role="search">
          <label htmlFor="feed-q" className="sr-only">{t(lang, "search.label")}</label>
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint md:left-4 md:h-[18px] md:w-[18px]" aria-hidden>
              <circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" />
            </svg>
            {/* 16px 고정 — 14px 이하 입력은 iOS 사파리가 포커스 시 뷰포트를 확대한다 */}
            <input id="feed-q" name="q" type="search" enterKeyHint="search" autoComplete="off" defaultValue={q ?? ""} placeholder={t(lang, "search.placeholder")}
              className={`w-full rounded-full bg-tomo-ivory py-2.5 pl-10 text-base placeholder:text-ink-soft md:py-3.5 md:pl-12 ${q ? "pr-11" : "pr-4"}`} />
            {q && (
              <Link href={tab !== "all" ? `/?tab=${tab}` : "/"} aria-label={t(lang, "search.clear")}
                className="press absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft hover:text-ink">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                  strokeLinecap="round" className="h-4 w-4" aria-hidden>
                  <path d="m7 7 10 10M17 7 7 17" />
                </svg>
              </Link>
            )}
          </div>
          {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
          {cat && <input type="hidden" name="cat" value={cat} />}
        </form>

        {!hub && (
        <nav className="flex gap-1.5" aria-label={t(lang, "tab.aria")}>
          {TABS.map(([v, l]) => {
            const params = new URLSearchParams();
            if (v !== "all") params.set("tab", v);
            if (q) params.set("q", q);
            if (cat) params.set("cat", cat);
            const qs = params.toString();
            return (
              <Link key={v} href={qs ? `/?${qs}` : "/"} aria-current={tab === v ? "page" : undefined}
                className={`press rounded-full px-3.5 py-3 text-[13px] font-bold transition-colors md:px-5 md:py-2 md:text-sm ${
                  tab === v ? "bg-tomo-navy text-white shadow-soft" : "bg-white text-ink-soft hover:text-ink"}`}>
                {t(lang, l)}
              </Link>
            );
          })}
        </nav>
        )}
      </header>

      {hub ? (
        <HomeHub viewer={viewer}
          listings={(hubOwn?.data ?? []) as unknown as FeedListing[]}
          travel={(hubTravel?.data ?? []) as unknown as FeedListing[]} />
      ) : (
      <div className="px-4 pb-6 pt-1 md:px-0 md:pb-16">
        {/* 카테고리 칩 — 리스트 모드에서도 한 탭 거리 */}
        <div className="mb-3">
          <CategoryChips lang={lang} active={cat} q={q} />
        </div>

        {/* 피드 섹션 헤딩 — 히어로 다음 스크롤 리듬 (데스크톱 전용) */}
        {!feedError && !localNeedsLogin && (listings ?? []).length > 0 && (
          <div className="mb-5 hidden items-baseline justify-between md:flex">
            <h2 className="text-lg font-bold text-ink">
              {q ? t(lang, "feed.results", { q }) : tab === "local" ? t(lang, "feed.localTitle") : tab === "travel" ? t(lang, "feed.travelTitle") : cat ? t(lang, `cat.${cat}`) : t(lang, "feed.latest")}
            </h2>
            <p className="text-xs text-ink-soft">{t(lang, "feed.legend")}</p>
          </div>
        )}

        {feedError ? (
          <div role="alert" className="mt-12 flex flex-col items-center px-6 text-center">
            <TomoSymbol />
            <p className="mt-3 text-sm font-bold text-ink">
              {t(lang, "feed.error")}
            </p>
            <p className="mt-1 text-xs text-ink-soft">{t(lang, "feed.errorSub")}</p>
            <Link href={`/?${new URLSearchParams({ ...(tab !== "all" && { tab }), ...(q && { q }) })}`}
              className="btn mt-4 inline-block bg-tomo-navy px-6 py-2.5 text-sm text-white">
              {t(lang, "feed.retry")}
            </Link>
          </div>
        ) : localNeedsLogin ? (
          <div className="mt-12 flex flex-col items-center gap-3 px-6 text-center">
            <TomoSymbol />
            <p className="text-sm leading-relaxed text-ink-soft">
              {t(lang, "empty.localGuest")}
            </p>
            <Link href="/login?next=/?tab=local" className="btn bg-tomo-navy px-6 py-2.5 text-sm text-white">
              {t(lang, "empty.localCta")}
            </Link>
          </div>
        ) : (listings ?? []).length > 0 ? (
          <>
            <ul className="flex flex-col md:grid md:grid-cols-3 md:gap-x-5 md:gap-y-8 lg:grid-cols-4">
              {(listings ?? []).map((l) => (
                <ListingRow key={l.id} listing={l as unknown as FeedListing} viewer={viewer} />
              ))}
            </ul>
            {/* 엔드캡 — 마지막 인상이 회색 거래완료 행이 아니라 브랜드로 끝난다.
                ponytail: 40개 캡에 걸리면 "다 봤어요"는 거짓이므로 정직하게 캡을 말한다 — 상품이 40개를 넘기면 커서 페이지네이션 */}
            <div className="mb-4 mt-10 flex flex-col items-center gap-2">
              <TomoSymbol className="h-12 w-[4.5rem] opacity-70" />
              <p className="text-xs font-bold text-ink-soft">
                {(listings ?? []).length < FEED_LIMIT ? t(lang, "feed.end") : t(lang, "feed.cap", { n: FEED_LIMIT })}
              </p>
            </div>
          </>
        ) : (
          <div className="mt-12 flex flex-col items-center px-6 text-center">
            <TomoSymbol />
            <p className="mt-3 text-sm text-ink-soft">
              {q ? t(lang, "empty.search", { q })
                : tab === "travel" ? t(lang, "empty.travel")
                : t(lang, "empty.none")}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              {q ? t(lang, "empty.searchSub")
                : tab === "travel" ? t(lang, "empty.travelSub")
                : t(lang, "empty.sellFirst")}
            </p>
            <Link href={q ? `/global?q=${encodeURIComponent(q)}` : tab === "travel" ? "/global" : "/sell"}
              className="btn mt-4 inline-block bg-tomo-coral-deep px-6 py-2.5 text-sm text-white">
              {q || tab === "travel" ? t(lang, "empty.globalCta") : t(lang, "empty.sellCta")}
            </Link>
          </div>
        )}
      </div>
      )}
    </main>
  );
}
