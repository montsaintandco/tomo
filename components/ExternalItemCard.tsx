import Link from "next/link";
import { convertPrice, formatPrice, type Currency } from "@/lib/currency";
import type { MarketSource } from "@/lib/market/types";
import { t, type Lang } from "@/lib/i18n";
import { TomoSymbol } from "@/components/Brand";

export type ExternalCardItem = {
  source: MarketSource; sourceId: string; title: string; titleTranslated?: string;
  price: number; currency: Currency; thumb: string;
  soldOut?: boolean; auction?: boolean;
};

// 메루카리식 밀집 카드 — 이미지 우선, 구매자 통화 가격이 가장 굵게 (Price-Loudest는 구매자의 숫자다)
// rate는 "외화 → 뷰어 통화" 환율. 같은 통화면 환산 없이 원값 표시
export default function ExternalItemCard({ item, rate, viewerCurrency, lang = "ko" }: {
  item: ExternalCardItem; rate: number; viewerCurrency: Currency; lang?: Lang;
}) {
  const foreign = item.currency !== viewerCurrency;
  const originalLang = item.currency === "JPY" ? "ja" : "ko";
  return (
    <Link href={`/global/${item.source}/${item.sourceId}`}
      className="press group flex flex-col">
      <div className="relative aspect-square overflow-hidden rounded-thumb bg-tomo-navy/5">
        {item.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumb} alt="" loading="lazy"
            className="h-full w-full object-cover transition-transform duration-200 ease-out fine:group-hover:scale-[1.03]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <TomoSymbol className="h-10 w-[3.75rem] opacity-60" />
          </div>
        )}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-tomo-navy/75 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur-sm">
          {t(lang, `source.${item.source}`)}
        </span>
        {item.auction && (
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-tomo-coral-deep px-2 py-0.5 text-[11px] font-bold text-white">
            {t(lang, "badge.auction")}
          </span>
        )}
        {item.soldOut && (
          <span className="absolute inset-0 flex items-center justify-center bg-tomo-navy/75 text-sm font-bold text-white">
            {t(lang, "badge.soldOut")}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-col gap-0.5">
        {/* 번역 제목이 있으면 그걸로, 원문은 title 속성에 — 원칙 2: 번역은 원문을 대체하지 않는다 */}
        <p className="line-clamp-2 min-h-9 text-[13px] leading-snug text-ink" lang={item.titleTranslated ? undefined : originalLang}>
          {item.titleTranslated ?? item.title}
        </p>
        {/* 원칙 2: 번역은 원문을 대체하지 않는다 — 원문을 한 줄로 항상 보인다 */}
        {item.titleTranslated && (
          <p className="line-clamp-1 text-[11px] leading-snug text-ink-soft" lang={originalLang}>{item.title}</p>
        )}
        {/* 사줘식: 뷰어 통화 하나만. 원문 통화는 상세에서 */}
        <p className="tnum text-[15px] font-extrabold text-ink">
          {foreign ? formatPrice(convertPrice(item.price, item.currency, rate), viewerCurrency) : formatPrice(item.price, item.currency)}
          {item.auction && <span className="ml-1 text-[11px] font-normal text-ink-soft">{t(lang, "price.current")}</span>}
        </p>
      </div>
    </Link>
  );
}
