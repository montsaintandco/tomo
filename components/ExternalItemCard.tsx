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
      className="group flex flex-col transition-opacity hover:opacity-90 active:opacity-70">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-gray-100">
        {item.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumb} alt="" loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="skeleton h-full w-full" />
        )}
        <span className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
          {SOURCE_LABEL[item.source]}
        </span>
        {item.auction && (
          <span className="absolute right-1.5 top-1.5 rounded bg-tomo-coral px-1.5 py-0.5 text-[10px] font-bold text-white">
            입찰중
          </span>
        )}
        {item.soldOut && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-bold text-white">
            품절
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-col gap-0.5">
        <p className="line-clamp-2 text-xs leading-snug text-gray-600">{item.title}</p>
        <p className="tnum text-[15px] font-bold text-gray-900">
          {formatWithConversion(item.price, item.currency, effectiveRate, viewerCurrency)}
        </p>
        {item.auction && <p className="text-[10px] text-gray-400">현재가 · 낙찰가 변동</p>}
      </div>
    </Link>
  );
}
