import ExternalItemCard, { type ExternalCardItem } from "@/components/ExternalItemCard";
import type { Lang } from "@/lib/i18n";
import { wishFor } from "@/components/search/wish-server";

// 가로 스냅 — 네이티브 스크롤, JS 없음. 모바일은 페이지 가터(px-4)를 뚫고 나가게 -mx-4.
// 스냅이 패딩을 무시하고 첫 카드를 화면 끝(0px)에 붙이지 않게 scroll-px-4.
// 데스크톱은 컨테이너에 가터가 없어(md:px-0) 뚫고 나가면 위 제목보다 16px 왼쪽으로 어긋난다 → md 에서 끈다
// viewer 를 넘기면 카드마다 찜 하트(찜 여부는 한 번에 조회). 안 넘기면 예전처럼 하트 없음
export default async function MarketCarousel({ items, rate, viewerCurrency, lang = "ko", label, viewer }: {
  items: ExternalCardItem[]; rate: number; viewerCurrency: "KRW" | "JPY"; lang?: Lang; label?: string; viewer?: { id: string | null; guest?: boolean };
}) {
  const wish = await wishFor(viewer, items);
  return (
    <ul aria-label={label} className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:scroll-px-0 md:px-0">
      {items.map((it) => (
        <li key={`${it.source}:${it.sourceId}`} className="w-[140px] shrink-0 snap-start">
          <ExternalItemCard item={it} rate={rate} viewerCurrency={viewerCurrency} lang={lang} wish={wish?.(it)} />
        </li>
      ))}
    </ul>
  );
}

export function CarouselSkeleton() {
  return (
    <div className="-mx-4 flex gap-3 overflow-hidden px-4 md:mx-0 md:px-0" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="w-[140px] shrink-0">
          <div className="skeleton aspect-square rounded-thumb" />
          <div className="skeleton mt-2 h-3 w-4/5 rounded" />
          <div className="skeleton mt-1.5 h-4 w-1/2 rounded" />
        </div>
      ))}
    </div>
  );
}
