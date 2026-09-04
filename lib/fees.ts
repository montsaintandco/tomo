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


// 사줘(SAZO)식 결제 구조: 상품 소계 → 국제 배송비 → 통관·수수료(상품가의 10%) → 주문 시 1회 결제, 2차 결제 없음
export const PROXY_SERVICE_RATE = 0.1;
// 국제배송 첫 건 개략치 (사줘: 최초 1건 7~9천원). ponytail: 무게 미상이라 정액, 무게 데이터 쌓이면 구간표로
export const PROXY_SHIPPING_ESTIMATE_KRW = 8000;
export const PROXY_SHIPPING_ESTIMATE_JPY = 900;

export type ProxyEstimate = {
  item: number; localShipping: number; subtotal: number; intlShipping: number; serviceFee: number; total: number;
  currency: "KRW" | "JPY";
};

// 상품 통화 기준 예상 결제 금액 — 어느 방향이든 같은 구조. 현지 유통비(판매자→센터 배송)는 마켓 대부분 0
export function proxyEstimate(itemPrice: number, currency: "KRW" | "JPY", localShipping = 0): ProxyEstimate {
  const subtotal = itemPrice + localShipping;
  const intlShipping = currency === "JPY" ? PROXY_SHIPPING_ESTIMATE_JPY : PROXY_SHIPPING_ESTIMATE_KRW;
  const serviceFee = Math.floor(itemPrice * PROXY_SERVICE_RATE);
  return { item: itemPrice, localShipping, subtotal, intlShipping, serviceFee, total: subtotal + intlShipping + serviceFee, currency };
}
