// 카드 배지 — 최대 1개 (키라팝 lib/item-badge 원칙). 품절·거래완료는 배지가 아니라 사진 위 덮개라 여기서 빼낸다.
// 순서: 경매(가격 뜻이 「현재가」로 바뀐다) > 순위 > 새 상품.
export type ItemBadge = { key: "badge.auction" } | { key: "badge.rank"; n: number } | { key: "badge.new" };

export function itemBadge(i: { soldOut?: boolean; auction?: boolean; rank?: number; isNew?: boolean }): ItemBadge | null {
  if (i.soldOut) return null;
  if (i.auction) return { key: "badge.auction" };
  if (i.rank && i.rank > 0) return { key: "badge.rank", n: Math.floor(i.rank) };
  if (i.isNew) return { key: "badge.new" };
  return null;
}
