// 홈 줄 조립 — 인기 테마 줄들을 페이지 순서대로 거르고, 같은 상품이 두 줄에 나오지 않게 나눈다(순수 함수).
// 키라팝 lib/home/assemble.ts 의 원칙만 가져온다: 품질 필터 → 앞 줄 우선 중복 제거 → 줄을 못 채우면 숨김.
import type { MarketItem } from "@/lib/market/types";
import { between, passesHome, pickSection } from "./quality";

export const itemKey = (it: Pick<MarketItem, "source" | "sourceId">) => `${it.source}:${it.sourceId}`;

/** 가로 줄 하나 — 4개 미만이면 숨기고 10개까지 */
export const ROW_FIT = between(4, 10);

/** 테마 줄들을 위에서 아래 순서로 조립한다. 반환 순서는 입력과 같고, 숨긴 줄은 items 가 빈 배열이다 */
export function assembleRows<S extends { items: MarketItem[] }>(sections: readonly S[], seen: Set<string> = new Set()): S[] {
  return sections.map((s) => ({ ...s, items: pickSection(s.items.filter(passesHome), itemKey, seen, ROW_FIT) }));
}

/** 홈 카드에 나간 상품 키 전부 */
export function shownKeys(sections: readonly { items: MarketItem[] }[]): Set<string> {
  return new Set(sections.flatMap((s) => s.items.map(itemKey)));
}

/**
 * 원형 카테고리마다 사진 하나 — 홈 카드에 이미 나온 상품과 앞 칸이 고른 상품은 피한다(키라팝 pickCharacterPhotos).
 * 후보가 전부 카드에 나온 것이면 그중 앞 칸이 안 쓴 첫 번째를 쓴다. 남은 게 없으면 null(첫 글자 원형).
 */
export function pickPhotos(candidates: readonly (readonly MarketItem[])[], shown: ReadonlySet<string>): (string | null)[] {
  const used = new Set<string>();
  return candidates.map((list) => {
    const ok = list.filter(passesHome);
    const pick = ok.find((c) => !shown.has(itemKey(c)) && !used.has(itemKey(c))) ?? ok.find((c) => !used.has(itemKey(c)));
    if (!pick) return null;
    used.add(itemKey(pick));
    return pick.thumb;
  });
}
