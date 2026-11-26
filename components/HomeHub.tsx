import { Suspense } from "react";
import Link from "next/link";
import type { ViewerOrGuest } from "@/lib/listings";
import type { TrendingSection } from "@/lib/market/trending";
import { getThemes } from "@/lib/market/themes";
import { t, otherCountry } from "@/lib/i18n";
import type { FeedListing } from "@/components/ListingRow";
import SectionHeader from "@/components/SectionHeader";
import MarketCarousel, { CarouselSkeleton } from "@/components/MarketCarousel";
import ListingCard from "@/components/ListingCard";
import { TomoSymbol } from "@/components/Brand";
import BannerStrip from "@/components/BannerStrip";
import CategoryCircles, { CategoryCirclesSkeleton } from "@/components/home/CategoryCircles";
import RecentViewed from "@/components/home/RecentViewed";
import { getHomeRows } from "@/lib/home/rows";
import { getPopularTerms } from "@/lib/home/data";
import { mergeKeywords } from "@/lib/home/popular";

// 홈 순서(04T7·03#7): 짧은 히어로(제목·인기 검색어) → 원형 카테고리 → 첫 인기 줄(첫 화면에 걸친다) → 최근 본 상품 → 배너 → 토모 상품 → 팔기 → 여행 → 나머지 인기 줄.
// 검색창은 하나다: 데스크톱은 헤더(GNB), 모바일은 페이지 위 검색창. 인기 줄은 lib/home/rows 가 거르고 중복을 뺀다.

function ThemeBlock({ section, viewer }: { section: TrendingSection; viewer: ViewerOrGuest }) {
  const lang = viewer.language;
  const label = lang === "ja" ? section.theme.labelJa : section.theme.label;
  return (
    <div>
      <SectionHeader level={3} lang={lang} title={label} href={`/global?q=${encodeURIComponent(label)}`} />
      <MarketCarousel items={section.items} rate={viewer.rate} viewerCurrency={viewer.currency} lang={lang} />
    </div>
  );
}

function ThemeSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-6">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i}>
          <div className="skeleton mb-3 h-4 w-24 rounded" aria-hidden />
          <CarouselSkeleton />
        </div>
      ))}
    </div>
  );
}

// 히어로 — 제목 한 줄과 인기 검색어만. 큰 사진 타일은 없앴다(첫 화면을 상품 줄에 준다, 04T7)
function HomeHero({ viewer }: { viewer: ViewerOrGuest }) {
  const lang = viewer.language;
  const otherName = t(lang, `market.${otherCountry(viewer.country)}`);
  const [line1, line2] = t(lang, "hero.title", { other: otherName }).split("\n");
  return (
    <section aria-label={`${line1} ${line2}`} className="md:pt-6">
      <h1 className="text-[20px] font-extrabold leading-[1.3] tracking-[-0.015em] text-ink md:text-[28px]">{line1} {line2}</h1>
      <p className="mt-1 text-[13px] leading-snug text-ink-soft md:text-[14px]">{t(lang, "hero.sub")}</p>
      {/* 한 줄 높이를 미리 잡는다 — 검색어가 늦게 와도 아래가 밀리지 않는다 */}
      <div className="mt-2 min-h-[1.75rem]">
        <Suspense fallback={null}><Keywords viewer={viewer} /></Suspense>
      </div>
    </section>
  );
}

// 인기 검색어 — 관리자 큐레이션(/admin/trending) 먼저, 그 뒤에 검색 로그 집계(정제·최소 건수). 한 줄만 보이고 넘치면 옆으로 넘긴다
async function Keywords({ viewer }: { viewer: ViewerOrGuest }) {
  const lang = viewer.language;
  const [themes, popular] = await Promise.all([getThemes(viewer.country).catch(() => []), getPopularTerms(lang)]);
  const words = mergeKeywords(themes.map((th) => (lang === "ja" ? th.labelJa : th.label)), popular);
  if (words.length === 0) return null;
  return (
    <p className="-mx-4 flex items-center gap-x-3 overflow-x-auto whitespace-nowrap px-4 text-[13px] text-ink-soft [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0">
      <span className="shrink-0">{t(lang, "hero.trendingKw")}</span>
      {words.map((w) => (
        <Link key={w} href={`/global?q=${encodeURIComponent(w)}`} className="shrink-0 py-1 font-bold text-ink underline-offset-2 fine:hover:underline">{w}</Link>
      ))}
    </p>
  );
}

// 첫 인기 줄 — 첫 화면 안에 걸린다
async function TrendingLead({ viewer }: { viewer: ViewerOrGuest }) {
  const sections = (await getHomeRows(viewer.country)).filter((s) => s.items.length > 0);
  if (sections.length === 0) return null;
  const lang = viewer.language;
  const other = otherCountry(viewer.country);
  const title = t(lang, "hub.trending", { market: t(lang, `market.${other}`) });
  return (
    <section className="mt-6 md:mt-8" aria-label={title}>
      <SectionHeader lang={lang} title={title} sub={t(lang, "hub.trendingSub", { sources: t(lang, `sources.${other}`) })} />
      <ThemeBlock section={sections[0]} viewer={viewer} />
    </section>
  );
}

// 나머지 인기 줄 — 토모 상품·팔기·여행 직거래 아래
async function TrendingRest({ viewer }: { viewer: ViewerOrGuest }) {
  const sections = (await getHomeRows(viewer.country)).filter((s) => s.items.length > 0).slice(1);
  if (sections.length === 0) return null;
  const lang = viewer.language;
  return (
    <section className="mt-8 flex flex-col gap-6"
      aria-label={t(lang, "hub.trendingMore", { market: t(lang, `market.${otherCountry(viewer.country)}`) })}>
      {sections.map((s) => <ThemeBlock key={s.theme.key} section={s} viewer={viewer} />)}
    </section>
  );
}

// 팔기 — 상대국 사람들이 "내 나라"에서 찾는 테마. 큐레이션 테이블을 뒤집어 쓴다: 모든 방문자는 판매자이기도 하다
async function SellPrompt({ viewer }: { viewer: ViewerOrGuest }) {
  const lang = viewer.language;
  const other = otherCountry(viewer.country);
  const themes = await getThemes(other); // 상대국 뷰어의 인기 테마 = 상대국 사람들이 내 나라 마켓에서 찾는 것
  const otherName = t(lang, `market.${other}`);
  const chipStyle = other === "JP" ? "bubble-jp" : "bubble-kr";
  return (
    <section className="mt-8" aria-label={t(lang, "hub.sell", { other: otherName, mine: t(lang, `market.${viewer.country}`) })}>
      <SectionHeader lang={lang}
        title={t(lang, "hub.sell", { other: otherName, mine: t(lang, `market.${viewer.country}`) })}
        sub={t(lang, "hub.sellSub", { other: otherName })} />
      <div className="flex flex-wrap items-center gap-2">
        {themes.map((th) => (
          <Link key={th.key} href={`/sell?hint=${encodeURIComponent(lang === "ja" ? th.labelJa : th.label)}`}
            className={`press ${chipStyle} px-3 py-2 text-[13px] font-bold`}>
            {lang === "ja" ? th.labelJa : th.label}
          </Link>
        ))}
        <Link href="/sell" className="btn ml-auto bg-tomo-navy px-4 py-2 text-sm text-white">
          {t(lang, "hub.sellCta")}
        </Link>
      </div>
    </section>
  );
}

export default function HomeHub({ viewer, listings, travel }: {
  viewer: ViewerOrGuest; listings: FeedListing[]; travel: FeedListing[];
}) {
  const lang = viewer.language;
  const other = otherCountry(viewer.country);
  const otherName = t(lang, `market.${other}`);
  return (
    <div className="px-4 pb-6 pt-1 md:px-0 md:pb-16">
      <HomeHero viewer={viewer} />
      <div className="mt-4 md:mt-6">
        <Suspense fallback={<CategoryCirclesSkeleton lang={lang} />}>
          <CategoryCircles country={viewer.country} lang={lang} />
        </Suspense>
      </div>

      <Suspense fallback={
        <section className="mt-6 md:mt-8" aria-hidden>
          <SectionHeader lang={lang} title={t(lang, "hub.trending", { market: otherName })}
            sub={t(lang, "hub.trendingSub", { sources: t(lang, `sources.${other}`) })} />
          <ThemeSkeleton rows={1} />
        </section>
      }>
        <TrendingLead viewer={viewer} />
      </Suspense>

      <RecentViewed lang={lang} rate={viewer.rate} viewerCurrency={viewer.currency} />
      {/* 어드민 배너 띠 — 첫 인기 줄 아래. 0건·오류면 없음 */}
      <BannerStrip country={viewer.country} lang={lang} />

      <section className="mt-8" aria-label={t(lang, "hub.own")}>
        {/* 게스트에게 "내 동네"는 로그인 벽 — 게스트는 전체 리스트로 */}
        <SectionHeader lang={lang} title={t(lang, "hub.own")} sub={t(lang, "hub.ownSub")}
          href={viewer.guest ? "/?tab=all" : "/?tab=local"} linkLabel={viewer.guest ? t(lang, "hub.more") : t(lang, "hub.ownLink")} />
        {listings.length > 0 ? (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-4 md:gap-x-5 md:gap-y-7">
            {listings.map((l) => <li key={l.id}><ListingCard listing={l} viewer={viewer} /></li>)}
          </ul>
        ) : (
          /* 출시 초기 빈 상태 — 그리드 대신 한 줄 카드: "당신의 물건이 첫 상품" 이라는 초대 */
          <Link href="/sell" className="press flex items-center gap-3 rounded-card border border-dashed border-tomo-navy/20 px-4 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tomo-navy/5"><TomoSymbol className="h-5 w-7 opacity-70" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-ink">{t(lang, "hub.ownEmpty")}</span>
              <span className="block text-[12px] text-ink-soft">{t(lang, "hub.ownEmptySub")}</span>
            </span>
            <span className="btn shrink-0 bg-tomo-navy px-3.5 py-2 text-[13px] text-white">{t(lang, "hub.sellCta")}</span>
          </Link>
        )}
      </section>

      <SellPrompt viewer={viewer} />

      <section className="mt-8" aria-label={t(lang, "hub.travel", { market: otherName })}>
        <SectionHeader lang={lang} title={t(lang, "hub.travel", { market: otherName })} sub={t(lang, "hub.travelSub")}
          href={travel.length > 0 ? "/?tab=travel" : "/travel"} linkLabel={travel.length > 0 ? t(lang, "hub.all") : t(lang, "hub.travelPlan")} />
        {travel.length > 0 ? (
          <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0">
            {travel.map((l) => <li key={l.id} className="w-[140px] shrink-0"><ListingCard listing={l} viewer={viewer} /></li>)}
          </ul>
        ) : (
          /* 직거래 상품이 아직 없어도 차별점은 보여준다 — 여행 일정 등록으로 유도하는 한 줄 카드 */
          <Link href="/travel" className="press flex items-center gap-3 rounded-card bg-accent-tint px-4 py-4">
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-ink">{t(lang, "hub.travelEmpty", { market: otherName })}</span>
              <span className="block text-[12px] text-ink-soft">{t(lang, "hub.travelEmptySub")}</span>
            </span>
            <span className="shrink-0 text-[13px] font-bold text-tomo-coral-deep">{t(lang, "hub.travelPlan")} →</span>
          </Link>
        )}
      </section>

      <Suspense fallback={<section className="mt-8" aria-hidden><ThemeSkeleton rows={3} /></section>}>
        <TrendingRest viewer={viewer} />
      </Suspense>
    </div>
  );
}
