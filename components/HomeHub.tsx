import { Suspense, cache } from "react";
import Link from "next/link";
import type { ViewerOrGuest } from "@/lib/listings";
import { getTrendingSections, type TrendingSection } from "@/lib/market/trending";
import { getThemes } from "@/lib/market/themes";
import { t, otherCountry, type Lang } from "@/lib/i18n";
import { convertPrice, formatPrice } from "@/lib/currency";
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

// 히어로 — 검색이 히어로(에어비앤비식): 키워드든 상대국 마켓 URL이든 여기 한 칸. 밑에 인기 검색어 칩 + 테마 타일 4장(대표 사진·테마명·최저가, 탭하면 그 테마 검색).
// 사진이 랜덤 상품이 아니라 "여기서 살 수 있는 것"의 지도. 로그인·게스트 공통
async function HomeHero({ viewer }: { viewer: ViewerOrGuest }) {
  const lang = viewer.language;
  const other = otherCountry(viewer.country);
  const otherName = t(lang, `market.${other}`);
  const sections = await getSections(viewer.country);
  const label = (s: TrendingSection) => (lang === "ja" ? s.theme.labelJa : s.theme.label);
  const tiles = sections.map((s) => {
    const items = s.items.filter((it) => it.thumb && !it.soldOut && !it.auction && it.price > 0); // 0원(나눔·미정)은 최저가에서 제외
    const min = items.reduce((m, it) => Math.min(m, it.price), Infinity);
    const cover = items[0] ?? s.items.find((it) => it.thumb);
    return cover ? { key: s.theme.key, label: label(s), href: `/global?q=${encodeURIComponent(label(s))}`, thumb: cover.thumb, min: Number.isFinite(min) ? min : null, currency: cover.currency } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x).slice(0, 4);
  const [line1, line2] = t(lang, "hero.title", { other: otherName }).split("\n");
  return (
    <section className="md:py-4" aria-label={line1}>
      <h1 className="text-[26px] font-extrabold leading-[1.25] tracking-[-0.015em] text-ink md:text-[34px]">{line1} <br className="md:hidden" />{line2}</h1>
      <p className="mt-2 text-[14px] text-ink-soft md:text-[15px]">{t(lang, "hero.sub")}</p>
      <form action="/global" role="search" className="relative mt-5 hidden md:block">{/* 모바일은 헤더 검색창이 바로 위에 있어 중복 — 칩·타일만 */}
        <label htmlFor="hero-q" className="sr-only">{t(lang, "search.label")}</label>
        <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-soft" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input id="hero-q" name="q" type="search" enterKeyHint="search" autoComplete="off" placeholder={t(lang, "hero.searchPlaceholder", { other: otherName })}
          className="w-full rounded-card border border-tomo-navy/15 bg-white py-3.5 pl-12 pr-28 text-[15px] shadow-soft placeholder:text-ink-soft focus:border-tomo-coral-deep focus:outline-none focus:ring-2 focus:ring-tomo-coral-deep/25 md:py-4 md:text-base" />
        <button type="submit" className="btn absolute right-1.5 top-1/2 -translate-y-1/2 bg-tomo-coral-deep px-4 py-2 text-sm text-white md:px-5">{t(lang, "hero.search")}</button>
      </form>
      {sections.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-soft">
          <span>{t(lang, "hero.trendingKw")}</span>
          {sections.map((s) => (
            <Link key={s.theme.key} href={`/global?q=${encodeURIComponent(label(s))}`} className="font-bold text-ink underline-offset-2 fine:hover:underline">{label(s)}</Link>
          ))}
        </p>
      )}
      {tiles.length >= 2 && (
        <ul className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3" aria-label={t(lang, "hero.photosAria", { other: otherName })}>
          {tiles.map((tile, i) => (
            <li key={tile.key}>
              <Link href={tile.href} className="press group relative block aspect-[4/3] overflow-hidden rounded-card bg-tomo-navy/5 md:aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={tile.thumb} alt="" loading={i < 2 ? "eager" : "lazy"} className="h-full w-full object-cover transition-transform duration-200 ease-out fine:group-hover:scale-[1.03]" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-3 pb-2.5 pt-8 text-white">
                  <span className="block text-[15px] font-extrabold leading-tight">{tile.label}</span>
                  {tile.min !== null && <span className="block text-[12px] opacity-90">{t(lang, "hero.from", { price: formatPrice(tile.currency === viewer.currency ? tile.min : convertPrice(tile.min, tile.currency, viewer.rate), viewer.currency) })}</span>}
                </span>
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
    <div className="md:py-4" aria-hidden>
      <div className="skeleton h-8 w-3/4 rounded md:h-10" /><div className="skeleton mt-3 h-4 w-1/2 rounded" />
      <div className="skeleton mt-5 hidden h-[52px] w-full rounded-card md:block" />
      <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">{[0,1,2,3].map((i) => <div key={i} className="skeleton aspect-[4/3] rounded-card md:aspect-square" />)}</div>
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
      <div className="mb-6 md:mb-8">
        <Suspense fallback={<HeroSkeleton />}><HomeHero viewer={viewer} /></Suspense>
      </div>
      <CategoryChips lang={lang} />

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
