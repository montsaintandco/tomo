import { convertPrice } from "./currency";

// 플랫폼 수수료·정산 계산 (스펙 §6). DB start_transaction의 floor(price*0.1)과 동일 규칙.
export const PLATFORM_FEE_RATE = 0.1;

// 판매가의 10%, 원 단위 내림 (KRW/JPY 모두 정수 통화)
export function platformFee(itemPrice: number): number {
  return Math.floor(itemPrice * PLATFORM_FEE_RATE);
}

// 구매자 결제액 = 상품가 + 국제배송비 (국내는 배송비 0)
export function buyerTotal(itemPrice: number, intlShippingFee = 0): number {
  return itemPrice + Math.max(0, intlShippingFee);
}

// 판매자 정산액 = 상품가 - 플랫폼 수수료 (completed 시)
export function sellerPayout(itemPrice: number): number {
  return itemPrice - platformFee(itemPrice);
}

// ── 구매대행 결제 구조 (사줘 역산 기준) ─────────────────────────────
// 상품 소계 → 국제 배송비(주문당 1회) → 통관·관세 → 주문 시 1회 결제, 받을 때 추가 청구 없음.
// "통관·관세"는 면세 한도 이하면 소계의 10%(세금 0, 전부 운영 몫), 초과면 실제 세금 + 5%.
//   KR: 관세 8% + 부가세 10% — 과세가격은 소계 + 운임(CIF). 한도 미화 150달러 ≈ 20만원
//   JP: 소비세 10% — 한도 1万円 (간이). 관세는 품목별이라 0으로 둔다
// DB create_proxy_order(0020)와 같은 규칙. ponytail: 한도는 KRW 상수 — USD 환율 붙으면 동적으로
export const PROXY_SHIPPING_ESTIMATE_KRW = 8000;
export const PROXY_SHIPPING_ESTIMATE_JPY = 900;
export const CUSTOMS_FREE_LIMIT = { KRW: 200000, JPY: 10000 } as const;
export const CUSTOMS_RATE_BELOW = 0.1;   // 면세 구간: 소계의 10%
export const CUSTOMS_RATE_ABOVE = 0.05;  // 과세 구간: 세금 + 소계의 5%
export const DUTY_RATE = { KRW: 0.08, JPY: 0 } as const;
export const VAT_RATE = 0.1;

export function customsCharge(subtotal: number, intlShipping: number, currency: "KRW" | "JPY"): number {
  if (subtotal <= 0) return 0;
  if (subtotal <= CUSTOMS_FREE_LIMIT[currency]) return Math.floor(subtotal * CUSTOMS_RATE_BELOW);
  const base = subtotal + intlShipping;
  const duty = Math.floor(base * DUTY_RATE[currency]);
  const vat = Math.floor((base + duty) * VAT_RATE);
  return duty + vat + Math.floor(subtotal * CUSTOMS_RATE_ABOVE);
}

export type ProxyOrderTotal = { subtotal: number; intlShipping: number; customs: number; total: number; currency: "KRW" | "JPY" };

// 카트 합산 — 항목별 환산 round 합 → 배송비 주문당 1회 → 통관·관세
export function proxyOrderTotal(
  items: { price: number; currency: "KRW" | "JPY" }[], viewer: "KRW" | "JPY", rate: number,
): ProxyOrderTotal {
  const subtotal = items.reduce((s, i) => s + (i.currency === viewer ? i.price : convertPrice(i.price, i.currency, rate)), 0);
  if (items.length === 0) return { subtotal: 0, intlShipping: 0, customs: 0, total: 0, currency: viewer };
  const intlShipping = viewer === "JPY" ? PROXY_SHIPPING_ESTIMATE_JPY : PROXY_SHIPPING_ESTIMATE_KRW;
  const customs = customsCharge(subtotal, intlShipping, viewer);
  return { subtotal, intlShipping, customs, total: subtotal + intlShipping + customs, currency: viewer };
}
