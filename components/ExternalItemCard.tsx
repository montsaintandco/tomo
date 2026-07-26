import Link from "next/link";
import { formatWithConversion, type Currency } from "@/lib/currency";
import { SOURCE_LABEL, type MarketSource } from "@/lib/market/types";

export type ExternalCardItem = {
  source: MarketSource; sourceId: string; title: string;
  price: number; currency: Currency; thumb: string;
  soldOut?: boolean; auction?: boolean;
};

export default function ExternalItemCard({ item, rate, viewerCurrency }: {
  item: ExternalCardItem; rate: number; viewerCurrency: Currency;
}) {
  return (
    <Link href={`/global/${item.source}/${item.sourceId}`}
      className="flex flex-col overflow-hidden rounded-card border bg-white">
      <div className="relative aspect-square bg-gray-100">
        {item.thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
        )}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">
          {SOURCE_LABEL[item.source]}
        </span>
        {item.auction && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-tomo-coral px-2 py-0.5 text-[10px] font-bold text-white">
            입찰
          </span>
        )}
        {item.soldOut && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-bold text-white">
            품절
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-2">
        <p className="line-clamp-2 text-xs leading-snug text-gray-700">{item.title}</p>
        <p className="text-sm font-bold text-tomo-navy">
          {formatWithConversion(item.price, item.currency, rate, viewerCurrency)}
        </p>
        {item.auction && <p className="text-[10px] text-gray-400">현재가 · 낙찰가 변동</p>}
      </div>
    </Link>
  );
}
