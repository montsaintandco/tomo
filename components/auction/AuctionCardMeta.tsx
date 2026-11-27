// 상품 카드(ListingCard·ListingRow·프로필 목록)의 경매 표시 — 사진 위 「경매」 배지 + 입찰 수 · 남은 시간 한 줄.
// 플래그가 꺼져 있거나 경매 상품이 아니면 null(흔적 없음). 서버 렌더 시각 기준 정적 표시(상세에서 초 단위로 센다)
import { auctionEnabled, cardAuctionInfo, pickAuction, timeLeftShort, type CardAuction } from "@/lib/auction";
import { t, type Lang } from "@/lib/i18n";

export type AuctionFields = { sale_type?: string; auctions?: CardAuction[] | null };

/** 경매 카드면 표시 정보, 아니면 null */
export function cardAuction(l: AuctionFields) {
  if (!auctionEnabled() || l.sale_type !== "auction") return null;
  const a = pickAuction(l.auctions);
  return a ? cardAuctionInfo(a, Date.now()) : null;
}

export function AuctionBadge({ lang, className = "" }: { lang: Lang; className?: string }) {
  return (
    <span className={`rounded-full bg-ink/75 px-2 py-0.5 text-[11px] font-bold text-white ${className}`}>{t(lang, "auction.badge")}</span>
  );
}

/** 「입찰 3 · 2시간 남음」 — 1시간 이하면 경고색 */
export function AuctionMeta({ info, lang, className = "" }: { info: NonNullable<ReturnType<typeof cardAuction>>; lang: Lang; className?: string }) {
  return (
    <p className={`tnum flex items-center gap-1 text-[11px] text-ink-soft ${className}`}>
      <span>{t(lang, "auction.bids", { n: info.bids })}</span>
      {info.live && <span aria-hidden>·</span>}
      {info.live && <span className={info.soon ? "font-bold text-tomo-rose" : ""}>{timeLeftShort(lang, info.left)}</span>}
    </p>
  );
}
