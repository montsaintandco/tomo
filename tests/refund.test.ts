import { describe, it, expect } from "vitest";
import { refundKrw, proxyOrderAmount, proxyCancelPreview } from "../lib/refunds";
import { customsCharge } from "../lib/fees";

describe("refundKrw (부분 환불 원화)", () => {
  it("is round(paid × amount ÷ total)", () => {
    expect(refundKrw(16200, 900, 1800, 16200)).toBe(8100);
    expect(refundKrw(10000, 1, 3, 10000)).toBe(3333);   // 3333.33 → 3333
    expect(refundKrw(10000, 2, 3, 10000)).toBe(6667);   // 6666.67 → 6667
  });
  it("never exceeds the remaining Toss balance", () => {
    expect(refundKrw(10000, 2, 3, 5000)).toBe(5000);
    expect(refundKrw(10000, 3, 3, 0)).toBe(0);
  });
  it("caps amount at total and rejects bad input", () => {
    expect(refundKrw(10000, 5000, 3000, 10000)).toBe(10000);
    expect(refundKrw(0, 100, 100, 100)).toBe(0);
    expect(refundKrw(100, 0, 100, 100)).toBe(0);
    expect(refundKrw(100, 50, 0, 100)).toBe(0);
  });
});

describe("proxyOrderAmount (DB proxy_order_amount 규칙)", () => {
  it("converts per item with round, adds shipping + customs; empty = 0", () => {
    // KRW 주문, rate 9.07: ¥1000 → 9070, ₩5000 그대로
    const sub = 9070 + 5000;
    expect(proxyOrderAmount([{ price: 1000, currency: "JPY" }, { price: 5000, currency: "KRW" }], "KRW", 9.07, 8000))
      .toBe(sub + 8000 + customsCharge(sub, 8000, "KRW"));
    expect(proxyOrderAmount([], "KRW", 9, 8000)).toBe(0);
  });
});

describe("proxyCancelPreview (관리자 대행 취소 미리보기)", () => {
  const items = [
    { id: "a", price: 3000, currency: "JPY" as const },
    { id: "b", price: 2000, currency: "JPY" as const },
  ];
  const total = proxyOrderAmount(items, "JPY", 1, 900);   // 5000 + 900 + 500 = 6400

  it("refund = before − after when items remain", () => {
    const p = proxyCancelPreview({ total, refunded: 0, intlShipping: 900, currency: "JPY", rate: 1, items, targetId: "a" });
    const after = proxyOrderAmount([items[1]], "JPY", 1, 900);   // 2000 + 900 + 200 = 3100
    expect(p.amount).toBe(total - after);                         // 3300
    expect(p.cap).toBe(total);
    expect(p.full).toBe(false);
  });
  it("last item refunds the whole unrefunded balance (full)", () => {
    const p = proxyCancelPreview({ total, refunded: 3300, intlShipping: 900, currency: "JPY", rate: 1, items: [items[1]], targetId: "b" });
    expect(p.amount).toBe(total - 3300);
    expect(p.full).toBe(true);
  });
  it("never exceeds total − already refunded", () => {
    const p = proxyCancelPreview({ total, refunded: 6000, intlShipping: 900, currency: "JPY", rate: 1, items, targetId: "a" });
    expect(p.cap).toBe(400);
    expect(p.amount).toBe(400);
    const none = proxyCancelPreview({ total, refunded: total + 10, intlShipping: 900, currency: "JPY", rate: 1, items, targetId: "a" });
    expect(none.cap).toBe(0);
    expect(none.amount).toBe(0);
    expect(none.full).toBe(false);
  });
});
