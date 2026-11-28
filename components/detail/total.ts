import { proxyOrderTotal, directShippingFee, customsDeposit, type ProxyOrderTotal } from "../../lib/fees";

// 상세 총액 박스의 숫자 — 금액은 다시 계산하지 않고 주문서·결제가 쓰는 lib/fees 함수를 그대로 부른다(05-roadmap T7).
// 해외 대행: 주문서(app/order/page.tsx)와 같은 proxyOrderTotal — 이 상품만 주문할 때의 합계.
export function proxyDetailTotal(item: { price: number; currency: "KRW" | "JPY" }, viewer: "KRW" | "JPY", rate: number): ProxyOrderTotal {
  return proxyOrderTotal([{ price: item.price, currency: item.currency }], viewer, rate);
}

/** DB listing_quote(0057) — 결제 함수(start_transaction·start_auction_transaction)와 같은 표에서 나온 값.
 *  intlFee = null 이면 국제 택배 결제가 안 된다(한국 상품 무게 미입력). customsMin = 통관 예치금 기준가(한국 상품만) */
export type DirectQuote = { intlFee: number | null; customsMin: number | null };

// 국경 간 직거래(택배): 금액은 상품 통화. 결제 합계 = 상품가 + 국제배송비 + 통관 예치금(DB tx_charge_base)
export type DirectDetailTotal = { item: number; intlShipping: number; customsDeposit: number; total: number; currency: "KRW" | "JPY" };
export function directDetailTotal(price: number, currency: "KRW" | "JPY", crossBorder: boolean, quote?: DirectQuote | null): DirectDetailTotal {
  const intlShipping = !crossBorder ? 0 : quote ? (quote.intlFee ?? 0) : directShippingFee(currency, true);
  const deposit = crossBorder ? customsDeposit(price, quote?.customsMin) : 0;
  return { item: price, intlShipping, customsDeposit: deposit, total: price + intlShipping + deposit, currency };
}

/** listing_quote rpc 결과 → DirectQuote. 실패·없음이면 null(화면은 국제 택배 결제를 막는다) */
export function parseQuote(v: unknown): DirectQuote | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { intl_fee?: unknown; customs_min?: unknown };
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : x == null ? null : Number.isFinite(Number(x)) ? Number(x) : null);
  return { intlFee: num(o.intl_fee), customsMin: num(o.customs_min) };
}