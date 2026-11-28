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

// 국경 간 직거래 국제배송비(일본 상품 → 한국, 정액). 한국 상품 → 일본은 0057 무게 구간표(DB listing_quote·start_transaction)라 여기서 계산하지 않는다.
// 화면이 보낸 값은 쓰지 않는다(01#15). DB direct_intl_fee(0057)가 같은 값을 스스로 정한다 — 바꾸면 두 곳 다.
export function directShippingFee(currency: "KRW" | "JPY", crossBorder = true): number {
  if (!crossBorder) return 0;
  return currency === "JPY" ? PROXY_SHIPPING_ESTIMATE_JPY : PROXY_SHIPPING_ESTIMATE_KRW;
}

// 판매 폼의 「포장 후 무게」 묶음(kg). 그 이상은 직접 입력(표 최대까지). 금액은 DB intl_ship_bands 가 준다
export const SHIP_WEIGHT_CHOICES = [0.5, 1, 2, 3, 5, 10] as const;
export const SHIP_WEIGHT_MAX = 17;
/** 무게에 맞는 구간 금액(최종). bands = intl_ship_bands(오름차순). 범위 밖이면 null — DB intl_ship_fee_krw 와 같은 규칙 */
export function bandFee(bands: { max_kg: number; fee_krw: number }[], kg: number | null | undefined): number | null {
  if (!(typeof kg === "number" && kg > 0)) return null;
  return bands.find((b) => Number(b.max_kg) >= kg)?.fee_krw ?? null;
}

// 통관 예치금(한국→일본 직거래): 상품가가 기준가(¥16,666 의 원화, DB customs_min_krw) 이상이면 10%(10원 올림).
// DB direct_customs_deposit(0057)와 같은 규칙. 판매자 정산·수수료에는 들어가지 않는다
export const CUSTOMS_DEPOSIT_JPY_MIN = 16666;
export function customsDeposit(price: number, minPrice: number | null | undefined): number {
  if (!minPrice || !(price > 0) || price < minPrice) return 0;
  return Math.ceil(price / 100) * 10;   // = ceil(price × 10% ÷ 10) × 10, 소수 오차 없이
}

/** 결제 합계 = 상품가 + 국제배송비(국경 간) + 통관 예치금 — DB tx_charge_base(0057)와 같다 */
export function txChargeBase(t: { item_price: number; intl_shipping_fee: number; is_cross_border: boolean; customs_deposit?: number | null }): number {
  return t.item_price + (t.is_cross_border ? t.intl_shipping_fee : 0) + (t.customs_deposit ?? 0);
}

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
