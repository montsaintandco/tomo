// 홈 품질 필터·줄 채우기 — 순수 함수(키라팝 lib/home/quality.ts 축약 이식). 홈은 고른 매물만 건다.
// 살 수 없는 출품(전용·예약·주문제작)은 검색과 같은 기준(lib/unbuyable)을 쓰고, 항공 특송 불가 물건은 홈에서만 더 뺀다.
import { unbuyableReason } from "../unbuyable";

/** 항공 특송으로 못 보내거나 막히는 물건(라이터·담배·스프레이·향수·에어건) — 키라팝 실측 2026-09-23 */
const SHIP_UNFIT = /ライター|ZIPPO|ジッポ|喫煙|煙草|タバコ|葉巻|シガー|アイコス|IQOS|スプレー|香水|フレグランス|ガスガン|エアガン|電動ガン|モデルガン|라이터|담배|전자담배|향수|스프레이|에어건|가스건/i;

export function isShipUnfit(title: string | null | undefined): boolean {
  return !!title && SHIP_UNFIT.test(title.normalize("NFKC"));
}

export type HomeQualityInput = { title: string; price: number; thumb?: string | null; soldOut?: boolean };

/** 홈 줄에 올려도 되는 매물인가 — 사진·가격 있음, 판매 중, 살 수 있음, 항공 발송 가능 */
export function passesHome(it: HomeQualityInput): boolean {
  if (!it.thumb || it.soldOut || !(it.price > 0)) return false;
  return !unbuyableReason(it.title) && !isShipUnfit(it.title);
}

/** 개수 규칙 — 쓸 수 있는 개수를 받아 보여 줄 개수를 돌려준다. min 개 미만이면 줄을 숨긴다(빈 칸·나쁜 매물로 채우지 않는다) */
export const between = (min: number, max: number) => (n: number) => (n >= min ? Math.min(n, max) : 0);

/**
 * 섹션 하나 고르기 — 앞 섹션이 보여 준 것(seen)과 목록 안 중복을 빼고 fit 이 정한 개수만 가져간다.
 * 고른 것만 seen 에 넣는다. 페이지 위에서 아래 순서로 부른다.
 */
export function pickSection<T>(items: readonly T[], key: (it: T) => string, seen: Set<string>, fit: (n: number) => number): T[] {
  const avail: T[] = [];
  const local = new Set<string>();
  for (const it of items) {
    const k = key(it);
    if (seen.has(k) || local.has(k)) continue;
    local.add(k);
    avail.push(it);
  }
  const out = avail.slice(0, Math.max(0, Math.floor(fit(avail.length))));
  for (const it of out) seen.add(key(it));
  return out;
}
