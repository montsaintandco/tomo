import Link from "next/link";
import type { Currency } from "@/lib/currency";
import type { MarketSource } from "@/lib/market/types";
import { t, type Lang } from "@/lib/i18n";
import { groupThousands } from "@/lib/price-display";
import { TomoSymbol } from "@/components/Brand";
import SourceLogo from "@/components/SourceLogo";
import Price from "@/components/ui/Price";
import { itemBadge, itemOverlay } from "@/lib/item-badge";
import ExternalWishButton from "@/components/search/ExternalWishButton";

export type ExternalCardItem = {
  source: MarketSource; sourceId: string; title: string; titleTranslated?: string;
  price: number; currency: Currency; thumb: string;
  soldOut?: boolean; auction?: boolean;
  // 05-roadmap P: 트랙이 값만 채우고 표시는 T1 이 맡는다(모두 선택)
  shippingIncluded?: boolean; likes?: number; condition?: string; rank?: number; isNew?: boolean;
};

// 메루카리식 밀집 카드 — 사진 → 제목 한 줄 → 가격 두 줄(큰 줄 보는 사람 통화, 작은 줄 원가·배송비 포함·찜 수).
// 높이 고정: 제목 1줄 + 작은 줄 자리를 늘 잡아 옆 카드·가로 줄과 가격 줄이 맞는다. 배지는 최대 1개(lib/item-badge).
// rate는 "외화 → 뷰어 통화" 환율. 같은 통화면 환산 없이 원값 표시.
// wish: 호출부가 찜 여부를 묶음으로 읽어 넘기면 사진 오른쪽 위에 하트(누르는 자리 44px). 안 넘기면 하트 없음(모르는 상태로 빈 하트를 보이지 않는다).
// 링크 안에 버튼을 넣지 않으려고 하트는 링크 옆 형제로 둔다(ListingCard 와 같다). 품절이면 찜한 경우에만 하트를 남긴다
export default function ExternalItemCard({ item, rate, viewerCurrency, lang = "ko", wish }: {
  item: ExternalCardItem; rate: number; viewerCurrency: Currency; lang?: Lang;
  wish?: { wished: boolean; guest: boolean };
}) {
  const overlay = itemOverlay(item);
  const originalLang = item.currency === "JPY" ? "ja" : "ko";
  // 번역 제목이 있으면 그것만 보이고 원문은 title 속성(호버)에 — 카드 한 장에 제목은 한 묶음 (04T4)
  // 화면 언어가 원문 언어와 같으면 번역을 쓰지 않는다(한국 거주 계정이 일본어 화면으로 볼 때 일본 상품이 한국어 제목으로 뜨던 문제, 2026-11-26 QA)
  const translated = originalLang !== lang ? item.titleTranslated : undefined;
  const title = translated || item.title;
  const extra = (item.shippingIncluded || (item.likes ?? 0) > 0) ? (
    <>
      {item.shippingIncluded && t(lang, "price.shipIncluded")}
      {item.shippingIncluded && (item.likes ?? 0) > 0 && " · "}
      {(item.likes ?? 0) > 0 && (
        <span aria-label={t(lang, "price.likes", { n: item.likes! })}><span aria-hidden>♥ {groupThousands(item.likes!)}</span></span>
      )}
    </>
  ) : undefined;
  return (
    <div className="relative">
    <Link href={`/global/${item.source}/${item.sourceId}`} title={translated ? item.title : undefined}
      className="press group flex flex-col">
      <div className="relative aspect-square overflow-hidden rounded-thumb bg-tomo-navy/5">
        {item.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumb} alt="" loading="lazy" decoding="async"
            className="h-full w-full object-cover transition-transform duration-200 ease-out fine:group-hover:scale-[1.03]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <TomoSymbol className="h-10 w-[3.75rem] opacity-60" />
          </div>
        )}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-white/95 p-[3px] shadow-soft">
          <SourceLogo source={item.source} lang={lang} size={18} className="block" />
        </span>
        <CardBadge item={item} lang={lang} />
        {overlay && (
          <span className="absolute inset-0 flex items-center justify-center bg-tomo-navy/75 text-sm font-bold text-white">
            {t(lang, overlay)}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex min-w-0 flex-col gap-0.5">
        <p className="line-clamp-1 text-[13px] leading-snug text-ink" lang={translated ? undefined : originalLang}>
          {title}
        </p>
        <Price amount={item.price} currency={item.currency} viewerCurrency={viewerCurrency} rate={rate} lang={lang}
          label={item.auction ? t(lang, "price.current") : null} extra={extra} dim={item.soldOut} fixed />
      </div>
    </Link>
    {wish && (!overlay || wish.wished) && (
      <ExternalWishButton compact className="absolute right-1.5 top-1.5" guest={wish.guest} initialWished={wish.wished} lang={lang}
        item={{ source: item.source, sourceId: item.sourceId, title, price: item.price, currency: item.currency, thumb: item.thumb }} />
    )}
    </div>
  );
}
// 배지 1개 — 사진 왼쪽 아래(왼쪽 위는 마켓 로고). 경매는 액센트, 순위는 잉크, 새 상품은 흰 필
function CardBadge({ item, lang }: { item: ExternalCardItem; lang: Lang }) {
  const b = itemBadge(item);
  if (!b) return null;
  const tone = b.key === "badge.auction" ? "bg-accent text-white" : b.key === "badge.rank" ? "bg-ink text-white" : "bg-white/95 text-ink shadow-soft";
  return (
    <span className={`absolute bottom-1.5 left-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>
      {b.key === "badge.rank" ? t(lang, "badge.rank", { n: b.n }) : t(lang, b.key)}
    </span>
  );
}