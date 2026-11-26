// 상품 상세 「주의 체크」·판매자 취소 경고 — 순수 함수(검사 tests/unit/detail-insight.test.ts).
// 에어쉽 src/lib/item-insight.ts·seller-cancels.ts 이식. AI 요약은 이번 범위가 아니다(05-roadmap 8절 — 호출 상한·캐시가 먼저).
// 규칙 판정이 정본이다: 구매자 지정·주문 페이지(lib/unbuyable), 항공 배송 제한(배터리·액체·스프레이), 판매자 착불.
import { unbuyableDetail, UNBUYABLE_AUCTION } from "./unbuyable";

/** 라벨은 i18n detail.rule.<code> */
export type RuleCode = "buyer_only" | "battery" | "liquid" | "spray" | "buyer_ship";

const BATTERY = /リチウム|バッテリー|充電式|ボタン電池|lithium|battery|배터리|리튬/i;
const LIQUID = /香水|フレグランス|オードトワレ|オードパルファム|液体|リキッド|シャンプー|洗剤|除光液|マニキュア|ネイルポリッシュ|perfume|향수|액체/i;
const SPRAY = /スプレー|ガスボンベ|エアゾール|ライター用ガス|カセットガス|spray|aerosol|스프레이|가스/i;

/**
 * 규칙 경고. 구매자 지정은 파서가 채운 unbuyable(경매 「구경만」 제외)과 제목·설명 판정 둘 다 본다.
 * 「バッテリー無し」 같은 부정 표현도 걸린다 — 안내일 뿐이라 놓치는 쪽보다 한 번 더 보는 쪽을 택한다.
 */
export function ruleFlags(item: { title: string; description?: string; unbuyable?: string; shippingIncluded?: boolean }): RuleCode[] {
  const desc = item.description ?? "";
  const out: RuleCode[] = [];
  if ((item.unbuyable && item.unbuyable !== UNBUYABLE_AUCTION) || unbuyableDetail(item.title, desc)) out.push("buyer_only");
  const text = `${item.title}\n${desc}`;
  if (BATTERY.test(text)) out.push("battery");
  if (LIQUID.test(text)) out.push("liquid");
  if (SPRAY.test(text)) out.push("spray");
  if (item.shippingIncluded === false) out.push("buyer_ship");
  return out;
}

/** 살 수 없는 사유 종류 — 경매는 「입찰 대행 안 함」, 나머지는 구매자 지정·주문 페이지 */
export function unbuyableKind(item: { title: string; description?: string; unbuyable?: string }): "auction" | "buyer_only" | null {
  if (item.unbuyable === UNBUYABLE_AUCTION) return "auction";
  return item.unbuyable || unbuyableDetail(item.title, item.description ?? "") ? "buyer_only" : null;
}

// ── 판매자 취소 경고(에어쉽 seller-cancels) — 같은 판매자가 최근 우리 대행 신청을 여러 번 취소했으면 경고(차단 아님)
export const SELLER_CANCEL_DAYS = 30;
export const SELLER_CANCEL_WARN_MIN = 2;
// 관리자가 취소 사유에 적는 말 중 「판매자 쪽 취소」로 읽히는 것. 고객 변심·품절은 넣지 않는다
const SELLER_CANCEL_RE = /판매자\s*(?:취소|거절|캔슬)|판매자가\s*(?:취소|거절)|셀러\s*취소|出品者[^。\n]{0,8}(?:キャンセル|取消|取り消し)|出品(?:取消|取り消し)|seller\s*cancel/i;

export type CancelRow = { external_item_id: string; cancel_reason: string | null };

export const isSellerCancel = (r: CancelRow): boolean => !!r.cancel_reason && SELLER_CANCEL_RE.test(r.cancel_reason);

/** 판매자 취소 상품 수(같은 상품 여러 신청은 1건) */
export const sellerCancelCount = (rows: readonly CancelRow[]): number => new Set(rows.filter(isSellerCancel).map((r) => r.external_item_id)).size;
