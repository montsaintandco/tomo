import { Suspense } from "react";
import type { ViewerOrGuest } from "@/lib/listings";
import { getTrendingSections } from "@/lib/market/trending";
import type { FeedListing } from "@/components/ListingRow";
import TrustStrip from "@/components/TrustStrip";
import SectionHeader from "@/components/SectionHeader";
import MarketCarousel, { CarouselSkeleton } from "@/components/MarketCarousel";
import ListingCard from "@/components/ListingCard";
import SiteFooter from "@/components/SiteFooter";
import { TomoSymbol } from "@/components/Brand";

// 외부 마켓 섹션 — 느릴 수 있으니 Suspense로 스트리밍. 전부 실패하면 조용히 비운다
async function TrendingSections({ viewer }: { viewer: ViewerOrGuest }) {
  const sections = await getTrendingSections(viewer.country);
  if (sections.length === 0) return null;
  const market = viewer.country === "KR" ? "일본" : "한국";
  return (
    <section className="mt-8">
      <SectionHeader title={`${market}에서 지금 인기`} sub="메루카리·야후옥션·당근·중고나라에서 많이 찾는 것들" />
      <div className="flex flex-col gap-6">
        {sections.map(({ theme, items }) => (
          <div key={theme.key}>
            <SectionHeader title={viewer.language === "ja" ? theme.labelJa : theme.label}
              href={`/global?q=${encodeURIComponent(theme.label)}`} />
            <MarketCarousel items={items} rate={viewer.rate} viewerCurrency={viewer.currency} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function HomeHub({ viewer, listings, travel }: {
  viewer: ViewerOrGuest; listings: FeedListing[]; travel: FeedListing[];
}) {
  const counterpart = viewer.country === "KR" ? "일본" : "한국";
  return (
    <div className="px-4 pb-6 pt-1">
      <TrustStrip />

      <Suspense fallback={<section className="mt-8"><SectionHeader title="지금 인기" /><CarouselSkeleton /></section>}>
        <TrendingSections viewer={viewer} />
      </Suspense>

      <section className="mt-8">
        <SectionHeader title="토모에서 바로 거래" sub="에스크로로 안전하게, 센터 검수 후 배송"
          href="/?tab=local" linkLabel="내 동네 상품" />
        {listings.length > 0 ? (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-5">
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
        <section className="mt-8">
          <SectionHeader title={`${counterpart} 여행 가서 직거래`} sub="여행 중 판매자와 직접 만나 받을 수 있어요"
            href="/?tab=travel" linkLabel="전체 보기" />
          <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {travel.map((l) => <li key={l.id} className="w-[140px] shrink-0 snap-start"><ListingCard listing={l} viewer={viewer} /></li>)}
          </ul>
        </section>
      )}

      <SiteFooter />
    </div>
  );
}
