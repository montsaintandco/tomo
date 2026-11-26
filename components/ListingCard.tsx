import Link from "next/link";
import { displayTitle, type Viewer } from "@/lib/listings";
import { t } from "@/lib/i18n";
import { CountryChip, TomoSymbol } from "@/components/Brand";
import Price from "@/components/ui/Price";
import WishButton from "@/components/WishButton";
import type { FeedListing } from "@/components/ListingRow";

// 2열 그리드 카드 — 사진 → 제목 한 줄 → 가격 두 줄(큰 줄 구매자 통화, 작은 줄 판매자 원가) → 지역.
// 찜 하트는 사진 오른쪽 위(누르는 자리 44px). 링크 안에 버튼을 넣지 않으려고 하트는 링크 옆 형제로 둔다.
// wished: 호출부가 찜 여부를 알면 넘긴다(모르면 빈 하트 — 눌러도 중복 찜은 성공으로 본다)
export default function ListingCard({ listing, viewer, wished = false }: {
  listing: FeedListing;
  viewer: Pick<Viewer, "country" | "language" | "rate" | "currency"> & { guest?: boolean };
  wished?: boolean;
}) {
  const lang = viewer.language;
  const title = displayTitle(listing, lang);
  const sold = listing.status === "sold";
  const reserved = listing.status === "reserved";
  return (
    <div className="relative">
      <Link href={`/listings/${listing.id}`} title={title !== listing.title ? listing.title : undefined} className="press flex flex-col">
        <div className="relative aspect-square overflow-hidden rounded-thumb bg-tomo-navy/5">
          {listing.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={listing.images[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
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
        <p className="mt-1.5 line-clamp-1 text-[13px] leading-snug text-ink">{title}</p>
        <Price className="mt-0.5" amount={listing.price} currency={listing.currency} viewerCurrency={viewer.currency}
          rate={viewer.rate} lang={lang} fallback={t(lang, "price.free")} dim={sold} fixed />
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-soft">
          <CountryChip country={listing.country} />
          <span className="truncate" lang={listing.country === "JP" ? "ja" : "ko"}>{listing.region}</span>
        </p>
      </Link>
      {!sold && (
        <WishButton compact className="absolute right-1.5 top-1.5" listingId={listing.id} price={listing.price}
          initialLiked={wished} initialCount={0} guest={!!viewer.guest} lang={lang} />
      )}
    </div>
  );
}