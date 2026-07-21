import { describe, it, expect } from "vitest";
import { convertPrice, formatPrice, formatWithConversion } from "../lib/currency";

describe("currency", () => {
  it("converts JPY to KRW with rate", () => {
    expect(convertPrice(12000, "JPY", 9.0)).toBe(108000);
  });
  it("rounds converted amounts", () => {
    expect(convertPrice(999, "JPY", 9.01)).toBe(9001);
  });
  it("formats KRW and JPY", () => {
    expect(formatPrice(108000, "KRW")).toBe("108,000원");
    expect(formatPrice(12000, "JPY")).toBe("¥12,000");
  });
  it("shows conversion hint only across currencies", () => {
    expect(formatWithConversion(12000, "JPY", 9.0, "KRW")).toBe("¥12,000 (약 108,000원)");
    expect(formatWithConversion(50000, "KRW", 9.0, "KRW")).toBe("50,000원");
  });
});
