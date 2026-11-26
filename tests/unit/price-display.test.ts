import { describe, it, expect } from "vitest";
import { formatMoney, groupThousands, priceParts } from "../../lib/price-display";
import { itemBadge } from "../../lib/item-badge";
import { convertPrice } from "../../lib/currency";
import { proxyOrderTotal } from "../../lib/fees";

describe("price-display", () => {
  it("groups thousands without locale", () => {
    expect(groupThousands(1234567)).toBe("1,234,567");
    expect(groupThousands(999)).toBe("999");
  });

  it("formats money by screen language — no 원 on ja screens", () => {
    expect(formatMoney(18900, "KRW", "ko")).toBe("18,900원");
    expect(formatMoney(18900, "KRW", "ja")).toBe("₩18,900");
    expect(formatMoney(2100, "JPY", "ko")).toBe("¥2,100");
    expect(formatMoney(2100, "JPY", "ja")).toBe("¥2,100");
  });

  it("KR viewer, JP item: big line approx KRW, small line original JPY", () => {
    const p = priceParts({ amount: 2100, currency: "JPY", viewerCurrency: "KRW", rate: 9.01, lang: "ko" })!;
    expect(p.main).toBe("약 18,921원");
    expect(p.sub).toBe("¥2,100");
    expect(p.tag).toBeNull();
    expect(p.value).toBe(18921);
  });

  it("JP viewer, KR item: big line approx JPY, small line ₩ (never 원)", () => {
    const p = priceParts({ amount: 50000, currency: "KRW", viewerCurrency: "JPY", rate: 0.11, lang: "ja" })!;
    expect(p.main).toBe("約 ¥5,500");
    expect(p.sub).toBe("₩50,000");
    expect(`${p.main}${p.sub}`).not.toContain("원");
  });

  it("rounding is the same as cart/order totals (convertPrice, 1 unit)", () => {
    for (const [amt, rate] of [[999, 9.01], [1, 9.4], [12345, 8.9876]] as const) {
      const p = priceParts({ amount: amt, currency: "JPY", viewerCurrency: "KRW", rate, lang: "ko" })!;
      expect(p.value).toBe(convertPrice(amt, "JPY", rate));
      expect(p.value).toBe(proxyOrderTotal([{ price: amt, currency: "JPY" }], "KRW", rate).subtotal);
    }
  });

  it("same currency: one line, no approx, label alone in small line", () => {
    const p = priceParts({ amount: 2100, currency: "JPY", viewerCurrency: "JPY", rate: 0.11, lang: "ja", label: "現在価格" })!;
    expect(p.main).toBe("¥2,100");
    expect(p.sub).toBe("現在価格");
  });

  it("auction label prefixes the original price", () => {
    const p = priceParts({ amount: 2100, currency: "JPY", viewerCurrency: "KRW", rate: 9, lang: "ko", label: "현재가" })!;
    expect(p.sub).toBe("현재가 ¥2,100");
  });

  it("logged-in viewer whose language differs from currency gets a currency tag", () => {
    // 한국 거주(KRW)인데 일본어 화면
    const a = priceParts({ amount: 2100, currency: "JPY", viewerCurrency: "KRW", rate: 9, lang: "ja" })!;
    expect(a.main).toBe("約 ₩18,900");
    expect(a.tag).toBe("KRW");
    // 일본 거주(JPY)인데 한국어 화면
    const b = priceParts({ amount: 50000, currency: "KRW", viewerCurrency: "JPY", rate: 0.11, lang: "ko" })!;
    expect(b.main).toBe("약 ¥5,500");
    expect(b.tag).toBe("JPY");
  });

  it("missing rate: no conversion, original on the big line", () => {
    const p = priceParts({ amount: 2100, currency: "JPY", viewerCurrency: "KRW", rate: 0, lang: "ko" })!;
    expect(p.main).toBe("¥2,100");
    expect(p.sub).toBeNull();
    expect(p.tag).toBe("JPY");
  });

  it("zero/invalid amount returns null (caller shows 나눔 or 가격 확인 필요)", () => {
    expect(priceParts({ amount: 0, currency: "KRW", viewerCurrency: "KRW", rate: 1, lang: "ko" })).toBeNull();
    expect(priceParts({ amount: NaN, currency: "KRW", viewerCurrency: "KRW", rate: 1, lang: "ko" })).toBeNull();
  });
});

describe("item-badge", () => {
  it("shows at most one badge: auction > rank > new", () => {
    expect(itemBadge({ auction: true, rank: 1, isNew: true })).toEqual({ key: "badge.auction" });
    expect(itemBadge({ rank: 3, isNew: true })).toEqual({ key: "badge.rank", n: 3 });
    expect(itemBadge({ isNew: true })).toEqual({ key: "badge.new" });
    expect(itemBadge({})).toBeNull();
  });
  it("sold-out items get no badge (overlay instead)", () => {
    expect(itemBadge({ soldOut: true, auction: true })).toBeNull();
  });
});
