import { describe, it, expect } from "vitest";
import { itemBadge, itemOverlay } from "../../lib/item-badge";

describe("W1 품절 덮개", () => {
  it("품절이면 덮개 「품절」, 배지는 없음", () => {
    expect(itemOverlay({ soldOut: true })).toBe("badge.soldOut");
    expect(itemBadge({ soldOut: true, auction: true, rank: 1 })).toBeNull();
  });
  it("판매 중이면 덮개 없음, 배지 규칙 그대로", () => {
    expect(itemOverlay({})).toBeNull();
    expect(itemOverlay({ soldOut: false })).toBeNull();
    expect(itemBadge({ auction: true })).toEqual({ key: "badge.auction" });
  });
});
