import Link from "next/link";
import { convertPrice, formatPrice, type Currency } from "@/lib/currency";
import { displayTitle, type Viewer } from "@/lib/listings";
import { CountryChip, TomoSymbol } from "@/components/Brand";
import { t, type Lang } from "@/lib/i18n";

export type FeedListing = {
  id: string; title: string; price: number; currency: Currency;
  source_language: string; country: "KR" | "JP"; region: string;
  status: string; images: string[]; created_at: string;
  trade_method?: "direct" | "shipping" | "both";
  cross_border_enabled?: boolean;
  listing_translations: { language: string; title: string }[];
};

function ago(iso: string, lang: Lang): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return t(lang, "time.now");
  if (m < 60) return t(lang, "time.min", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t(lang, "time.hour", { n: h });
  const d = Math.floor(h / 24);
  return d < 30 ? t(lang, "time.day", { n: d }) : t(lang, "time.month", { n: Math.floor(d / 30) });
}

// 당근식 가로 행 — 정보 밀도 높고 스캔이 빠름. 국가는 말풍선 칩이 말한다
export default function ListingRow({ listing, viewer }: {
  listing: FeedListing;
  viewer: Pick<Viewer, "country" | "language" | "rate" | "currency">;
}) {
  const lang: Lang = viewer.language;
  const foreign = listing.country !== viewer.country;
  const sold = listing.status === "sold";
  const reserved = listing.status === "reserved";
  // 상대국 상품이면서 직접 만나 거래 가능 → 여행 갔을 때 직거래할 수 있음
  const travelDeal = foreign && (listing.trade_method === "direct" || listing.trade_method === "both");

  return (
    <li className="border-b border-tomo-navy/5 last:border-0 md:border-0">
      {/* 모바일=당근식 가로 행, 데스크톱=이미지 우선 세로 카드 (같은 마크업, 반응형 전환) */}
      <Link href={`/listings/${listing.id}`}
        className="press group flex gap-3 py-3.5 md:flex-col md:gap-2.5 md:py-0">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-thumb bg-tomo-navy/5 md:aspect-square md:h-auto md:w-full">
          {listing.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={listing.images[0]} alt="" loading="lazy"
              className="h-full w-full object-cover transition-transform duration-200 ease-out fine:group-hover:scale-[1.03]" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <TomoSymbol className="h-10 w-[3.75rem] opacity-60" />
            </div>
          )}
          {(sold || reserved) && (
            <span className="absolute inset-0 flex items-center justify-center bg-tomo-navy/75 text-xs font-bold text-white">
              {sold ? t(lang, "badge.sold") : t(lang, "badge.reserved")}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 md:justify-start">
          <p className={`line-clamp-2 text-[15px] leading-snug ${sold ? "text-ink-faint" : "text-ink"}`}>
            {displayTitle(listing, viewer.language)}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-ink-soft">
            <CountryChip country={listing.country} />
            <span className="truncate">{listing.region} · {ago(listing.created_at, lang)}</span>
          </p>
          {/* 구매자 결정 숫자(내 통화)가 가장 크게, 판매자 원가는 작게 — Price-Loudest는 구매자의 숫자다 */}
          <p className={`tnum text-base font-extrabold ${sold ? "text-ink-faint" : "text-ink"}`}>
            {listing.price === 0 ? t(lang, "price.free") : foreign ? (
              <>
                {t(lang, "price.approx")} {formatPrice(convertPrice(listing.price, listing.currency, viewer.rate), viewer.currency)}
                <span className="ml-1.5 text-xs font-bold text-ink-soft">{formatPrice(listing.price, listing.currency)}</span>
              </>
            ) : formatPrice(listing.price, listing.currency)}
          </p>
          {!sold && (
            <span className="mt-0.5 flex flex-wrap items-center gap-1">
              {travelDeal && (
                <span className="grad-bridge-soft inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-tomo-navy">
                  {t(lang, "card.travel")}
                </span>
              )}
              {/* 모든 판매중 상품이 에스크로 대상 — 원칙 1: 안전장치를 숨기지 말 것 (외국 행에만 두면 국내는 미보호로 읽힌다) */}
              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-tomo-navy/5 px-2 py-0.5 text-[11px] font-bold text-tomo-navy">
                <svg viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth={2.2}
                  strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5" aria-hidden>
                  <path d="M12 3.5l6.5 2.7v4.6c0 4.3-2.8 7.6-6.5 9.7-3.7-2.1-6.5-5.4-6.5-9.7V6.2z" />
                  <path d="m9.3 11.6 1.9 1.9 3.5-3.5" />
                </svg>
                {t(lang, "card.safe")}
              </span>
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
