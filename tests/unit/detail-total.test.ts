import { describe, it, expect } from "vitest";
import { proxyOrderTotal, directShippingFee, customsDeposit, txChargeBase, bandFee } from "../../lib/fees";
import { proxyDetailTotal, directDetailTotal, parseQuote } from "../../components/detail/total";

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
    expect(directDetailTotal(30000, "KRW", false)).toEqual({ item: 30000, intlShipping: 0, customsDeposit: 0, total: 30000, currency: "KRW" });
  });
});

describe("0057 한국→일본 무게 구간·통관 예치금", () => {
  it("견적(DB listing_quote)이 있으면 그 국제배송비, 기준가 이상이면 예치금 10%(10원 올림)", () => {
    const q = { intlFee: 9260, customsMin: 139326 };
    expect(directDetailTotal(50000, "KRW", true, q)).toEqual({ item: 50000, intlShipping: 9260, customsDeposit: 0, total: 59260, currency: "KRW" });
    expect(directDetailTotal(139326, "KRW", true, q).customsDeposit).toBe(13940);
    expect(directDetailTotal(139325, "KRW", true, q).customsDeposit).toBe(0);
    expect(directDetailTotal(200000, "KRW", true, q).total).toBe(200000 + 9260 + 20000);
  });
  it("customsDeposit = DB direct_customs_deposit 규칙(ceil(price/100)×10)", () => {
    expect(customsDeposit(139326, 139326)).toBe(13940);
    expect(customsDeposit(300000, 139326)).toBe(30000);
    expect(customsDeposit(300001, 139326)).toBe(30010);
    expect(customsDeposit(300000, null)).toBe(0);
  });
  it("txChargeBase = 상품가 + 국경 간 배송비 + 예치금", () => {
    expect(txChargeBase({ item_price: 200000, intl_shipping_fee: 18120, is_cross_border: true, customs_deposit: 20000 })).toBe(238120);
    expect(txChargeBase({ item_price: 5000, intl_shipping_fee: 900, is_cross_border: false, customs_deposit: 0 })).toBe(5000);
  });
  it("bandFee = 무게 이상인 첫 구간", () => {
    const b = [{ max_kg: 0.5, fee_krw: 7860 }, { max_kg: 1, fee_krw: 9260 }, { max_kg: 17, fee_krw: 47260 }];
    expect(bandFee(b, 0.3)).toBe(7860);
    expect(bandFee(b, 1)).toBe(9260);
    expect(bandFee(b, 1.01)).toBe(47260);
    expect(bandFee(b, 17.5)).toBeNull();
    expect(bandFee(b, null)).toBeNull();
  });
  it("parseQuote: 숫자 문자열도 읽고, 비면 null", () => {
    expect(parseQuote({ intl_fee: 9260, customs_min: "139326" })).toEqual({ intlFee: 9260, customsMin: 139326 });
    expect(parseQuote({ intl_fee: null, customs_min: null })).toEqual({ intlFee: null, customsMin: null });
    expect(parseQuote(null)).toBeNull();
  });
});