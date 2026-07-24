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
