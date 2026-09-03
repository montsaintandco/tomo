import ExternalItemCard, { type ExternalCardItem } from "@/components/ExternalItemCard";

// 가로 스냅 — 네이티브 스크롤, JS 없음. 페이지 가터(px-4)를 뚫고 나가게 -mx-4
export default function MarketCarousel({ items, rate, viewerCurrency }: {
  items: ExternalCardItem[]; rate: number; viewerCurrency: "KRW" | "JPY";
}) {
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((it) => (
        <li key={`${it.source}:${it.sourceId}`} className="w-[140px] shrink-0 snap-start">
          <ExternalItemCard item={it} rate={rate} viewerCurrency={viewerCurrency} />
        </li>
      ))}
    </ul>
  );
}

export function CarouselSkeleton() {
  return (
    <div className="-mx-4 flex gap-3 overflow-hidden px-4" aria-hidden>
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
