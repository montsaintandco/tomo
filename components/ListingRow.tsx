import Link from "next/link";
import { formatWithConversion, type Currency } from "@/lib/currency";
import { displayTitle, type Viewer } from "@/lib/listings";
import { CountryChip } from "@/components/Brand";

export type FeedListing = {
  id: string; title: string; price: number; currency: Currency;
  source_language: string; country: "KR" | "JP"; region: string;
  status: string; images: string[]; created_at: string;
  trade_method?: "direct" | "shipping" | "both";
  cross_border_enabled?: boolean;
  listing_translations: { language: string; title: string }[];
};

function ago(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}일 전` : `${Math.floor(d / 30)}달 전`;
}

// 당근식 가로 행 — 정보 밀도 높고 스캔이 빠름. 국가는 말풍선 칩이 말한다
export default function ListingRow({ listing, viewer }: {
  listing: FeedListing;
  viewer: Pick<Viewer, "country" | "language" | "rate" | "currency">;
}) {
  const foreign = listing.country !== viewer.country;
  const sold = listing.status === "sold";
  const reserved = listing.status === "reserved";
  // 상대국 상품이면서 직접 만나 거래 가능 → 여행 갔을 때 직거래할 수 있음
  const travelDeal = foreign && (listing.trade_method === "direct" || listing.trade_method === "both");

  return (
    <li className="border-b border-tomo-navy/5 last:border-0">
      <Link href={`/listings/${listing.id}`}
        className="press flex gap-3 py-3.5">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-tomo-navy/5">
          {listing.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={listing.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="skeleton h-full w-full" />
          )}
          {(sold || reserved) && (
            <span className="absolute inset-0 flex items-center justify-center bg-tomo-navy/70 text-xs font-bold text-white">
              {sold ? "거래완료" : "예약중"}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <p className={`line-clamp-2 text-[15px] leading-snug ${sold ? "text-ink-faint" : "text-ink"}`}>
            {displayTitle(listing, viewer.language)}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-ink-soft">
            <CountryChip country={listing.country} />
            <span className="truncate">{listing.region} · {ago(listing.created_at)}</span>
          </p>
          <p className={`tnum text-base font-extrabold ${sold ? "text-ink-faint" : "text-ink"}`}>
            {formatWithConversion(listing.price, listing.currency, foreign ? viewer.rate : 1, viewer.currency)}
          </p>
          {travelDeal && !sold && (
            <span className="grad-bridge-soft mt-0.5 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-tomo-navy">
              <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" aria-hidden>
                <path d="M12 21C7.2 17.2 2.5 13.6 2.5 8.9 2.5 5.6 5 3.5 7.8 3.5c1.7 0 3.3.9 4.2 2.3.9-1.4 2.5-2.3 4.2-2.3 2.8 0 5.3 2.1 5.3 5.4 0 4.7-4.7 8.3-9.5 12.1z" fill="#C14E4C" />
              </svg>
              여행 중 직거래 가능
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
