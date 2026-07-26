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

// ── 구매대행 (외부 마켓 상품) ─────────────────────────────
// 대행 수수료: 건당 정액(JPY 기준). 국제배송비는 무게·부피에 따라 어드민이 견적 시 확정.
export const PROXY_FEE_JPY = 400;          // 대행 수수료(건당)
export const PROXY_REMIT_FEE_JPY = 185;    // 현지 결제·송금 수수료(건당)
export const PROXY_SHIPPING_ESTIMATE_JPY = 2000; // 국제배송 개략치(견적 전 안내용)

// 견적 전 "예상 총액" — 확정 아님을 UI에서 반드시 표기
export function proxyEstimateJpy(itemPriceJpy: number): {
  item: number; fee: number; remit: number; shipping: number; total: number;
} {
  const fee = PROXY_FEE_JPY, remit = PROXY_REMIT_FEE_JPY, shipping = PROXY_SHIPPING_ESTIMATE_JPY;
  return { item: itemPriceJpy, fee, remit, shipping, total: itemPriceJpy + fee + remit + shipping };
}
