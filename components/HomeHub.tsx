import { Suspense, cache } from "react";
import Link from "next/link";
import type { ViewerOrGuest } from "@/lib/listings";
import { getTrendingSections, type TrendingSection } from "@/lib/market/trending";
import { TRENDING } from "@/lib/market/trending-data";
import { t, otherCountry, type Lang } from "@/lib/i18n";
import type { FeedListing } from "@/components/ListingRow";
import TrustStrip from "@/components/TrustStrip";
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
        href={`/global?q=${encodeURIComponent(section.theme.label)}`} />
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
function SellPrompt({ viewer }: { viewer: ViewerOrGuest }) {
  const lang = viewer.language;
  const other = otherCountry(viewer.country);
  const themes = TRENDING[other]; // 상대국 뷰어의 인기 테마 = 상대국 사람들이 내 나라 마켓에서 찾는 것
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
        <Link href="/sell" className="btn ml-auto bg-tomo-coral-deep px-4 py-2 text-sm text-white">
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
      <TrustStrip lang={lang} />

      <div className="mt-4">
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
        <SectionHeader lang={lang} title={t(lang, "hub.own")} sub={t(lang, "hub.ownSub")}
          href="/?tab=local" linkLabel={t(lang, "hub.ownLink")} />
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
