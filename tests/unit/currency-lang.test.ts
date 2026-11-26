import { describe, it, expect } from "vitest";
import { formatPrice } from "../../lib/currency";

describe("formatPrice lang", () => {
  it("ko 는 원, ja 는 ₩ (일본어 화면에 한국어 「원」이 섞이지 않게)", () => {
    expect(formatPrice(12345, "KRW")).toBe("12,345원");
    expect(formatPrice(12345, "KRW", "ja")).toBe("₩12,345");
    expect(formatPrice(900, "JPY", "ja")).toBe("¥900");
    expect(formatPrice(900, "JPY")).toBe("¥900");
  });
});
