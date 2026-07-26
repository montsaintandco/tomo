import Link from "next/link";
import { formatWithConversion, type Currency } from "@/lib/currency";
import { displayTitle } from "@/lib/listings";
import type { Viewer } from "@/lib/listings";

export type FeedListing = {
  id: string; title: string; price: number; currency: Currency;
  source_language: string; country: "KR" | "JP"; region: string;
  status: string; images: string[];
  listing_translations: { language: string; title: string }[];
};

export default function ListingCard({ listing, viewer }: {
  listing: FeedListing;
  viewer: Pick<Viewer, "country" | "language" | "rate" | "currency">;
}) {
  const foreign = listing.country !== viewer.country;
  return (
    <Link href={`/listings/${listing.id}`}
      className="flex flex-col overflow-hidden rounded-card border bg-white">
      <div className="relative aspect-square bg-gray-100">
        {listing.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.images[0]} alt="" className="h-full w-full object-cover" />
        )}
        <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold text-white ${listing.country === "KR" ? "bg-tomo-blue" : "bg-tomo-pink"}`}>
          {listing.country}
        </span>
        {listing.status !== "active" && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 font-bold text-white">
            {listing.status === "reserved" ? "예약중" : "거래완료"}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 p-2">
        <p className="truncate text-sm">{displayTitle(listing, viewer.language)}</p>
        <p className="text-sm font-bold text-tomo-navy">
          {formatWithConversion(listing.price, listing.currency, foreign ? viewer.rate : 1, viewer.currency)}
        </p>
        <p className="text-xs text-gray-400">{listing.region}</p>
      </div>
    </Link>
  );
}
