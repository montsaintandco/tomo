import Link from "next/link";
import { convertPrice, formatPrice } from "@/lib/currency";
import { displayTitle, type Viewer } from "@/lib/listings";
import { CountryChip, TomoSymbol } from "@/components/Brand";
import type { FeedListing } from "@/components/ListingRow";

// 2열 그리드 카드 — 이미지 우선, 가격이 가장 굵게 (Price-Loudest는 구매자 통화)
export default function ListingCard({ listing, viewer }: {
  listing: FeedListing;
  viewer: Pick<Viewer, "country" | "language" | "rate" | "currency">;
}) {
  const foreign = listing.country !== viewer.country;
  return (
    <Link href={`/listings/${listing.id}`} className="press flex flex-col">
      <div className="relative aspect-square overflow-hidden rounded-thumb bg-tomo-navy/5">
        {listing.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.images[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <TomoSymbol className="h-10 w-[3.75rem] opacity-60" />
          </div>
        )}
      </div>
      <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-ink">{displayTitle(listing, viewer.language)}</p>
      <p className="tnum mt-0.5 text-[15px] font-extrabold text-ink">
        {foreign
          ? `약 ${formatPrice(convertPrice(listing.price, listing.currency, viewer.rate), viewer.currency)}`
          : formatPrice(listing.price, listing.currency)}
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-soft">
        <CountryChip country={listing.country} />
        <span className="truncate">{listing.region}</span>
      </p>
    </Link>
  );
}
