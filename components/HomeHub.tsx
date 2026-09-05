import { Suspense, cache } from "react";
import Link from "next/link";
import type { ViewerOrGuest } from "@/lib/listings";
import { getTrendingSections, type TrendingSection } from "@/lib/market/trending";
import { getThemes } from "@/lib/market/themes";
import { t, otherCountry, type Lang } from "@/lib/i18n";
import type { FeedListing } from "@/components/ListingRow";
import SectionHeader from "@/components/SectionHeader";
import MarketCarousel, { CarouselSkeleton } from "@/components/MarketCarousel";
import ListingCard from "@/components/ListingCard";
import { TomoSymbol } from "@/components/Brand";
import CategoryChips from "@/components/CategoryChips";

// 한 요청 안에서 두 Suspense 블록이 같은 프로미스를 공유한다 (테마 캐시는 별도로 1h)
const getSections = cache((country: "KR" | "JP") => getTrendingSections(country));

function ThemeBlock({ section, viewer }: { section: TrendingSection; viewer: ViewerOrGuest }) {
  const lang: Lang = viewer.language;
  return (
    <div>
      <SectionHeader level={3} lang={lang} title={lang === "ja" ? section.theme.labelJa : section.theme.label}
        href={`/global?q=${encodeURIComponent(lang === "ja" ? section.theme.labelJa : section.theme.label)}`} />
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

// 히어로 (게스트만) — 경쟁사 종합: 메루카리처럼 사진이 히어로, 당근 웹처럼 한 줄 헤드라인+CTA, 사조처럼 한 줄 신뢰. 배너·박스 없음.
// 사진은 상대국 인기 테마의 실제 상품 4장 (탭하면 그 상품으로). 로그인 사용자는 이 블록 없이 바로 상품
async function HomeHero({ viewer }: { viewer: ViewerOrGuest }) {
  const lang = viewer.language;
  const other = otherCountry(viewer.country);
  const otherName = t(lang, `market.${other}`);
  const sections = await getSections(viewer.country);
  const photos = sections.flatMap((s) => s.items).filter((it) => it.thumb && !it.soldOut).slice(0, 3); // 3장: 세로 1 + 정사각 2 (4장이면 한 장이 아래로 밀려 히어로가 길어진다)
  const [line1, line2] = t(lang, "hero.title", { other: otherName }).split("\n");
  return (
    <section className="grid gap-6 md:grid-cols-[1fr_minmax(0,28rem)] md:items-center md:gap-10 md:py-6" aria-label={line1}>
      <div>
        <h1 className="text-[28px] font-extrabold leading-[1.15] tracking-[-0.03em] text-ink md:text-[40px]">
          {line1}<br />{line2}
        </h1>
        <p className="mt-3 max-w-[38ch] text-[14px] leading-relaxed text-ink-soft md:text-[15px]">{t(lang, "hero.sub")}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/global" className="btn bg-tomo-coral-deep px-5 py-3 text-sm text-white">{t(lang, "hero.ctaBuy", { other: otherName })}</Link>
          <Link href="/sell" className="btn border border-tomo-navy/15 bg-white px-5 py-3 text-sm text-ink">{t(lang, "hero.ctaSell")}</Link>
        </div>
      </div>
      {photos.length >= 2 && (
        <ul className="grid grid-cols-2 gap-2" aria-label={t(lang, "hero.photosAria", { other: otherName })}>
          {photos.map((it, i) => (
            <li key={`${it.source}:${it.sourceId}`} className={i === 0 && photos.length >= 3 ? "row-span-2" : ""}>
              <Link href={`/global/${it.source}/${it.sourceId}`} className="press group block h-full overflow-hidden rounded-card bg-tomo-navy/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.thumb} alt="" loading={i === 0 ? "eager" : "lazy"}
                  className={`h-full w-full object-cover transition-transform duration-200 ease-out fine:group-hover:scale-[1.03] ${i === 0 && photos.length >= 3 ? "aspect-[3/4] md:aspect-auto" : "aspect-square"}`} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HeroSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_minmax(0,28rem)] md:items-center md:py-6" aria-hidden>
      <div><div className="skeleton h-8 w-3/4 rounded" /><div className="skeleton mt-2 h-8 w-1/2 rounded" /><div className="skeleton mt-4 h-4 w-2/3 rounded" /></div>
      <div className="grid grid-cols-2 gap-2"><div className="skeleton row-span-2 aspect-[3/4] rounded-card" /><div className="skeleton aspect-square rounded-card" /><div className="skeleton aspect-square rounded-card" /></div>
    </div>
  );
}

// 첫 테마 하나 — TOMO 상품 위에 "상대국에서 지금 인기"의 맛보기 (사기)
async function TrendingLead({ viewer }: { viewer: ViewerOrGuest }) {
  const sections = await getSections(viewer.country);
  if (sections.length === 0) return null;
  const lang = viewer.language;
  const other = otherCountry(viewer.country);
  const title = t(lang, "hub.trending", { market: t(lang, `market.${other}`) });
  return (
    <section className="mt-8" aria-label={title}>
      <SectionHeader lang={lang} title={title} sub={t(lang, "hub.trendingSub", { sources: t(lang, `sources.${other}`) })} />
      <ThemeBlock section={sections[0]} viewer={viewer} />
    </section>
  );
}

// 나머지 테마 — TOMO 상품·팔기·여행 직거래 아래
async function TrendingRest({ viewer }: { viewer: ViewerOrGuest }) {
  const sections = (await getSections(viewer.country)).slice(1);
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
      {/* 게스트 = 히어로(헤드라인·CTA·상품 사진). 로그인 = 메루카리처럼 바로 상품 — 신뢰 3항목은 상세의 "안심 거래"가 맡는다 */}
      {viewer.guest && (
        <div className="mb-6 md:mb-8">
          <Suspense fallback={<HeroSkeleton />}><HomeHero viewer={viewer} /></Suspense>
        </div>
      )}

      <div className={viewer.guest ? "" : "mt-2"}>
        <CategoryChips lang={lang} />
      </div>

      <Suspense fallback={
        <section className="mt-8" aria-hidden>
          <SectionHeader lang={lang} title={t(lang, "hub.trending", { market: otherName })}
            sub={t(lang, "hub.trendingSub", { sources: t(lang, `sources.${other}`) })} />
          <ThemeSkeleton rows={1} />
        </section>
      }>
        <TrendingLead viewer={viewer} />
      </Suspense>

      <section className="mt-8" aria-label={t(lang, "hub.own")}>
        {/* 게스트에게 "내 동네"는 로그인 벽 — 게스트는 전체 리스트로 */}
        <SectionHeader lang={lang} title={t(lang, "hub.own")} sub={t(lang, "hub.ownSub")}
          href={viewer.guest ? "/?tab=all" : "/?tab=local"} linkLabel={viewer.guest ? t(lang, "hub.more") : t(lang, "hub.ownLink")} />
        {listings.length > 0 ? (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-4 md:gap-x-5 md:gap-y-7">
            {listings.map((l) => <li key={l.id}><ListingCard listing={l} viewer={viewer} /></li>)}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <TomoSymbol />
            <p className="text-sm text-ink-soft">{t(lang, "empty.none")}</p>
          </div>
        )}
      </section>

      <SellPrompt viewer={viewer} />

      {travel.length > 0 && (
        <section className="mt-8" aria-label={t(lang, "hub.travel", { market: otherName })}>
          <SectionHeader lang={lang} title={t(lang, "hub.travel", { market: otherName })} sub={t(lang, "hub.travelSub")}
            href="/?tab=travel" linkLabel={t(lang, "hub.all")} />
          <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0">
            {travel.map((l) => <li key={l.id} className="w-[140px] shrink-0"><ListingCard listing={l} viewer={viewer} /></li>)}
          </ul>
        </section>
      )}

      <Suspense fallback={<section className="mt-8" aria-hidden><ThemeSkeleton rows={3} /></section>}>
        <TrendingRest viewer={viewer} />
      </Suspense>
    </div>
  );
}
