import { Suspense, cache } from "react";
import type { ViewerOrGuest } from "@/lib/listings";
import { getTrendingSections, type TrendingSection } from "@/lib/market/trending";
import type { FeedListing } from "@/components/ListingRow";
import TrustStrip from "@/components/TrustStrip";
import SectionHeader from "@/components/SectionHeader";
import MarketCarousel, { CarouselSkeleton } from "@/components/MarketCarousel";
import ListingCard from "@/components/ListingCard";
import { TomoSymbol } from "@/components/Brand";

// 한 요청 안에서 두 Suspense 블록이 같은 프로미스를 공유한다 (테마 캐시는 별도로 1h)
const getSections = cache((country: "KR" | "JP") => getTrendingSections(country));

const MARKET_NAME = { KR: "일본", JP: "한국" } as const;
const MARKET_SOURCES = { KR: "메루카리·야후옥션", JP: "당근마켓·중고나라" } as const;

function ThemeBlock({ section, viewer }: { section: TrendingSection; viewer: ViewerOrGuest }) {
  return (
    <div>
      <SectionHeader level={3} title={viewer.language === "ja" ? section.theme.labelJa : section.theme.label}
        href={`/global?q=${encodeURIComponent(section.theme.label)}`} />
      <MarketCarousel items={section.items} rate={viewer.rate} viewerCurrency={viewer.currency} />
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

// 첫 테마 하나 — TOMO 상품 위에 "상대국에서 지금 인기"의 맛보기
async function TrendingLead({ viewer }: { viewer: ViewerOrGuest }) {
  const sections = await getSections(viewer.country);
  if (sections.length === 0) return null;
  return (
    <section className="mt-8" aria-label={`${MARKET_NAME[viewer.country]}에서 지금 인기`}>
      <SectionHeader title={`${MARKET_NAME[viewer.country]}에서 지금 인기`}
        sub={`${MARKET_SOURCES[viewer.country]}에서 많이 찾는 것 · 구매대행으로 받아요`} />
      <ThemeBlock section={sections[0]} viewer={viewer} />
    </section>
  );
}

// 나머지 테마 — TOMO 상품·여행 직거래 아래
async function TrendingRest({ viewer }: { viewer: ViewerOrGuest }) {
  const sections = (await getSections(viewer.country)).slice(1);
  if (sections.length === 0) return null;
  return (
    <section className="mt-8 flex flex-col gap-6" aria-label={`${MARKET_NAME[viewer.country]} 인기 테마 더보기`}>
      {sections.map((s) => <ThemeBlock key={s.theme.key} section={s} viewer={viewer} />)}
    </section>
  );
}

export default function HomeHub({ viewer, listings, travel }: {
  viewer: ViewerOrGuest; listings: FeedListing[]; travel: FeedListing[];
}) {
  const market = MARKET_NAME[viewer.country];
  return (
    <div className="px-4 pb-6 pt-1 md:px-0 md:pb-16">
      <TrustStrip />

      <Suspense fallback={
        <section className="mt-8" aria-hidden>
          <SectionHeader title={`${market}에서 지금 인기`} sub={`${MARKET_SOURCES[viewer.country]}에서 많이 찾는 것 · 구매대행으로 받아요`} />
          <ThemeSkeleton rows={1} />
        </section>
      }>
        <TrendingLead viewer={viewer} />
      </Suspense>

      <section className="mt-8" aria-label="토모에서 바로 거래">
        <SectionHeader title="토모에서 바로 거래" sub="에스크로로 안전하게, 센터 검수 후 배송" href="/?tab=local" />
        {listings.length > 0 ? (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-4 md:gap-x-5 md:gap-y-7">
            {listings.map((l) => <li key={l.id}><ListingCard listing={l} viewer={viewer} /></li>)}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <TomoSymbol />
            <p className="text-sm text-ink-soft">아직 등록된 상품이 없어요 · まだ出品がありません</p>
          </div>
        )}
      </section>

      {travel.length > 0 && (
        <section className="mt-8" aria-label={`${market} 여행 가서 직거래`}>
          <SectionHeader title={`${market} 여행 가서 직거래`} sub="여행 중 판매자와 직접 만나 받을 수 있어요" href="/?tab=travel" />
          <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
