// 카드 배지 — 최대 1개 (키라팝 lib/item-badge 원칙). 품절·거래완료는 배지가 아니라 사진 위 덮개라 여기서 빼낸다.
// 순서: 경매(가격 뜻이 「현재가」로 바뀐다) > 순위 > 새 상품.
export type ItemBadge = { key: "badge.auction" | "badge.auctionBid" } | { key: "badge.rank"; n: number } | { key: "badge.new" };

export function itemBadge(i: { soldOut?: boolean; auction?: boolean; rank?: number; isNew?: boolean }): ItemBadge | null {
  if (i.soldOut) return null;
  // 입찰 대행(NEXT_PUBLIC_MARKET_AUCTION, 빌드 때 박힘)이 켜지면 메루카리 경매는 신청할 수 있어 「구경만」을 빼고 「경매」만
  if (i.auction) return { key: auctionBadgeKey() };
  if (i.rank && i.rank > 0) return { key: "badge.rank", n: Math.floor(i.rank) };
  if (i.isNew) return { key: "badge.new" };
  return null;
}

export const auctionBadgeKey = () => (process.env.NEXT_PUBLIC_MARKET_AUCTION === "1" ? "badge.auctionBid" : "badge.auction") as "badge.auction" | "badge.auctionBid";

// 사진 위 덮개 — 품절은 배지 대신 사진 전체를 덮는다(검색 카드·캐러셀 공통). 덮개가 있으면 itemBadge 는 null
export function itemOverlay(i: { soldOut?: boolean }): "badge.soldOut" | null {
  return i.soldOut ? "badge.soldOut" : null;
}