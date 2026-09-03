import Link from "next/link";
import { formatWithConversion, type Currency } from "@/lib/currency";
import { SOURCE_LABEL, type MarketSource } from "@/lib/market/types";

export type ExternalCardItem = {
  source: MarketSource; sourceId: string; title: string;
  price: number; currency: Currency; thumb: string;
  soldOut?: boolean; auction?: boolean;
};

// 메루카리식 밀집 카드 — 이미지 우선, 가격이 가장 굵게
// rate는 "외화 → 뷰어 통화" 환율. 같은 통화면 환산 없이 원값 표시
export default function ExternalItemCard({ item, rate, viewerCurrency }: {
  item: ExternalCardItem; rate: number; viewerCurrency: Currency;
}) {
  const effectiveRate = item.currency === viewerCurrency ? 1 : rate;
  return (
    <Link href={`/global/${item.source}/${item.sourceId}`}
      className="press group flex flex-col">
      <div className="relative aspect-square overflow-hidden rounded-thumb bg-tomo-navy/5">
        {item.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumb} alt="" loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="skeleton h-full w-full" />
        )}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-tomo-navy/60 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur-sm">
          {SOURCE_LABEL[item.source]}
        </span>
        {item.auction && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-tomo-coral-deep px-2 py-0.5 text-[11px] font-bold text-white">
            입찰중
          </span>
        )}
        {item.soldOut && (
          <span className="absolute inset-0 flex items-center justify-center bg-tomo-navy/70 text-sm font-bold text-white">
            품절
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-col gap-0.5">
        <p className="line-clamp-2 text-[13px] leading-snug text-ink">{item.title}</p>
        <p className="tnum text-[15px] font-extrabold text-ink">
          {formatWithConversion(item.price, item.currency, effectiveRate, viewerCurrency)}
        </p>
        {item.auction && <p className="text-[11px] text-ink-faint">현재가 · 낙찰가 변동</p>}
      </div>
    </Link>
  );
}
