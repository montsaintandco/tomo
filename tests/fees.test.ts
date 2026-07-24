import { describe, it, expect } from "vitest";
import { platformFee, buyerTotal, sellerPayout, PLATFORM_FEE_RATE } from "../lib/fees";
import { convertPrice, formatWithConversion } from "../lib/currency";

describe("platform fee", () => {
  it("is 10% floored", () => {
    expect(PLATFORM_FEE_RATE).toBe(0.1);
    expect(platformFee(10000)).toBe(1000);
    expect(platformFee(25000)).toBe(2500);
    expect(platformFee(48000)).toBe(4800);
    expect(platformFee(999)).toBe(99); // floor
    expect(platformFee(1)).toBe(0);
  });

  it("buyer total adds intl shipping, clamps negatives", () => {
    expect(buyerTotal(10000)).toBe(10000);
    expect(buyerTotal(10000, 5000)).toBe(15000);
    expect(buyerTotal(10000, -1)).toBe(10000);
  });

  it("seller payout deducts fee", () => {
    expect(sellerPayout(10000)).toBe(9000);
    expect(sellerPayout(999)).toBe(900); // 999 - 99
  });
});

describe("currency conversion", () => {
  it("converts JPY->KRW by rate", () => {
    expect(convertPrice(10000, "JPY", 9.0)).toBe(90000);
  });

  it("shows converted only across currencies", () => {
    expect(formatWithConversion(48000, "JPY", 9.0, "KRW")).toBe("¥48,000 (약 432,000원)");
    expect(formatWithConversion(25000, "KRW", 1, "KRW")).toBe("25,000원");
  });
});
