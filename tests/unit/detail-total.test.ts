import { describe, it, expect } from "vitest";
import { proxyOrderTotal, directShippingFee } from "../../lib/fees";
import { proxyDetailTotal, directDetailTotal } from "../../components/detail/total";

// 05-roadmap T7 완료 기준: 상세 총액 박스 숫자 = 주문서·결제 합계(같은 함수, 같은 입력 → 같은 값)
describe("상세 총액 = 주문서 합계", () => {
  const cases: [number, "KRW" | "JPY", "KRW" | "JPY", number][] = [
    [2100, "JPY", "KRW", 9.1], [9999, "JPY", "KRW", 9.37], [25000, "JPY", "KRW", 9.1], // 면세·과세 구간
    [18900, "KRW", "JPY", 9.1], [300000, "KRW", "JPY", 9.1], [500, "JPY", "JPY", 1], [0, "JPY", "KRW", 9.1],
  ];
  it.each(cases)("대행 %s %s → 화면 %s (환율 %s)", (price, currency, viewer, rate) => {
    // 주문서(app/order/page.tsx)는 장바구니 행(CartRow)을 그대로 proxyOrderTotal 에 넣는다
    const cartRow = { id: "x", sourceId: "m1", title: "t", source: "mercari", price, currency, image: null, stale: false };
    expect(proxyDetailTotal({ price, currency }, viewer, rate)).toEqual(proxyOrderTotal([cartRow], viewer, rate));
  });
  it("대행 합계 = 소계 + 국제배송비 + 통관·관세", () => {
    const r = proxyDetailTotal({ price: 2100, currency: "JPY" }, "KRW", 9.1);
    expect(r.total).toBe(r.subtotal + r.intlShipping + r.customs);
    expect(r.intlShipping).toBe(8000);
  });
  it.each([[30000, "KRW"], [4500, "JPY"]] as const)("직거래 %s %s = 결제 base(상품가 + directShippingFee)", (price, cur) => {
    const d = directDetailTotal(price, cur, true);
    // app/api/checkout: base = item_price + intl_shipping_fee, intl = directShippingFee(listing currency) — DB 0035 도 8000/900
    expect(d.intlShipping).toBe(directShippingFee(cur));
    expect(d.total).toBe(price + directShippingFee(cur));
    expect(d.intlShipping).toBe(cur === "KRW" ? 8000 : 900);
  });
  it("국경 간이 아니면 국제배송비 0", () => {
    expect(directDetailTotal(30000, "KRW", false)).toEqual({ item: 30000, intlShipping: 0, total: 30000, currency: "KRW" });
  });
});
