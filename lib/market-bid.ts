// 해외 마켓 경매 입찰 대행(docs/aaa/15). DB 정본은 0050 함수다. 여기는 미리 계산·마켓 사실 정리·오류 문구용(순수, 서버·화면 공용).
import { customsCharge, PROXY_SHIPPING_ESTIMATE_KRW } from "./fees";
import type { I18nKey } from "./i18n";
import type { MarketItemDetail, MarketSource } from "./market/types";

/** 기능 플래그. 없으면 입찰 대행 API 는 404, 화면은 흔적 없음(운영 Variables 에 아직 넣지 않는다) */
export const marketBidEnabled = () => process.env.NEXT_PUBLIC_MARKET_AUCTION === "1";

export type MarketBidStatus =
  | "pending_auth" | "authorized" | "placed" | "outbid" | "hold" | "won" | "ordered"
  | "lost" | "cancelled" | "missed" | "expired" | "capture_failed";

/** 0050 market_bid_amount 와 같은 계산(단위 테스트가 대조). 가격·송료·수수료는 엔, 결과는 원 */
export function marketBidAmount(priceJpy: number, shipJpy: number, rate: number, feeJpy = 0) {
  const subtotal = Math.round((priceJpy + shipJpy) * rate);
  const intlShipping = PROXY_SHIPPING_ESTIMATE_KRW;
  const customs = customsCharge(subtotal, intlShipping, "KRW");
  const fee = Math.round(feeJpy * rate);
  return { subtotal, intl_shipping: intlShipping, customs, fee, total: subtotal + intlShipping + customs + fee };
}

/** 메루카리 입찰 최소 금액: 입찰 0건이면 시작가(지금 가격), 있으면 현재가 + 100엔(0050 request_market_bid 와 같다) */
export const minCapJpy = (price: number, bids: number) => (bids > 0 ? price + 100 : price);

export type BidFacts = { price: number; bids: number; endsAt: string; shipJpy: number | null };

/**
 * 서버가 마켓에서 방금 읽은 상세 → 신청 함수에 넘길 사실. 신청할 수 없는 상품이면 오류 키.
 * 일본 내 송료: 출품자 부담(送料込み)이면 0, 그 밖(着払い·미정)은 null → DB 가 「shipping unknown」으로 거절한다.
 */
export function bidFacts(source: MarketSource, d: MarketItemDetail | null): BidFacts | { error: I18nKey } {
  if (!d) return { error: "mb.err.changed" };
  if (source !== "mercari") return { error: "mb.err.source" };
  const a = d.auctionInfo;
  if (!d.auction || !a) return { error: "mb.err.notAuction" };
  if (!a.open || d.soldOut || !a.endsAt) return { error: "mb.err.ended" };
  return { price: a.price, bids: a.bids, endsAt: a.endsAt, shipJpy: d.shippingIncluded === true ? 0 : null };
}

/** 0050 함수 오류(영문 키워드) → 화면 문구 키. 모르는 오류는 일반 문구 */
export const MB_ERRORS: [string, I18nKey][] = [
  ["mb: not accepting", "mb.err.notAccepting"], ["mb: blocked", "mb.err.blocked"], ["mb: unauthorized", "mb.err.blocked"],
  ["mb: country", "mb.err.country"], ["mb: source", "mb.err.source"], ["mb: shipping unknown", "mb.err.shipping"],
  ["mb: ending soon", "mb.err.endingSoon"], ["mb: too early", "mb.err.tooEarly"], ["mb: cap too low", "mb.err.capLow"],
  ["mb: cap too high", "mb.err.capHigh"], ["mb: address required", "mb.err.address"], ["mb: pccc required", "mb.err.pccc"],
  ["mb: item taken", "mb.err.taken"], ["mb: already requested", "mb.err.already"], ["mb: user limit", "mb.err.userLimit"],
  ["mb: full", "mb.err.full"], ["mb: daily limit", "mb.err.daily"], ["mb: rate missing", "mb.err.notReady"],
  ["mb: not cancellable", "mb.err.notCancellable"], ["mb: cancel closed", "mb.err.cancelClosed"],
];
export function mbErrorKey(msg: string): I18nKey {
  return MB_ERRORS.find(([k]) => msg.includes(k))?.[1] ?? "mb.err.failed";
}
