import Link from "next/link";
import { formatWithConversion, type Currency } from "@/lib/currency";
import { displayTitle, type Viewer } from "@/lib/listings";

export type FeedListing = {
  id: string; title: string; price: number; currency: Currency;
  source_language: string; country: "KR" | "JP"; region: string;
  status: string; images: string[]; created_at: string;
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

// 당근식 가로 행 — 정보 밀도 높고 스캔이 빠름
export default function ListingRow({ listing, viewer }: {
  listing: FeedListing;
  viewer: Pick<Viewer, "country" | "language" | "rate" | "currency">;
}) {
  const foreign = listing.country !== viewer.country;
  const sold = listing.status === "sold";
  const reserved = listing.status === "reserved";

  return (
    <li className="border-b border-black/5 last:border-0">
      <Link href={`/listings/${listing.id}`}
        className="flex gap-3 py-3.5 transition-opacity hover:opacity-80 active:opacity-60">
        <div className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-xl bg-gray-100">
          {listing.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={listing.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="skeleton h-full w-full" />
          )}
          {(sold || reserved) && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-xs font-bold text-white">
              {sold ? "거래완료" : "예약중"}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <p className="line-clamp-2 text-[15px] leading-snug text-gray-900">
            {displayTitle(listing, viewer.language)}
          </p>
          <p className="text-xs text-gray-400">
            <span className={`mr-1 rounded px-1 py-0.5 text-[10px] font-bold ${
              listing.country === "KR" ? "bg-tomo-blue/30 text-tomo-navy" : "bg-tomo-pink/30 text-tomo-coral"}`}>
              {listing.country}
            </span>
            {listing.region} · {ago(listing.created_at)}
          </p>
          <p className="tnum mt-0.5 text-[15px] font-bold text-gray-900">
            {formatWithConversion(listing.price, listing.currency, foreign ? viewer.rate : 1, viewer.currency)}
          </p>
        </div>
      </Link>
    </li>
  );
}
