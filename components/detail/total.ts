import { proxyOrderTotal, directShippingFee, buyerTotal, type ProxyOrderTotal } from "../../lib/fees";

// 상세 총액 박스의 숫자 — 금액은 다시 계산하지 않고 주문서·결제가 쓰는 lib/fees 함수를 그대로 부른다(05-roadmap T7).
// 해외 대행: 주문서(app/order/page.tsx)와 같은 proxyOrderTotal — 이 상품만 주문할 때의 합계.
export function proxyDetailTotal(item: { price: number; currency: "KRW" | "JPY" }, viewer: "KRW" | "JPY", rate: number): ProxyOrderTotal {
  return proxyOrderTotal([{ price: item.price, currency: item.currency }], viewer, rate);
}

// 국경 간 직거래(택배): 결제(app/api/checkout)·DB start_transaction(0035)과 같은 directShippingFee. 금액은 상품 통화.
export type DirectDetailTotal = { item: number; intlShipping: number; total: number; currency: "KRW" | "JPY" };
export function directDetailTotal(price: number, currency: "KRW" | "JPY", crossBorder: boolean): DirectDetailTotal {
  const intlShipping = directShippingFee(currency, crossBorder);
  return { item: price, intlShipping, total: buyerTotal(price, intlShipping), currency };
}
