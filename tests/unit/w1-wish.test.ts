import { describe, it, expect } from "vitest";
import { parseKeys, parseWish, wishKey, MAX_KEYS } from "../../components/search/wish";

describe("W1 해외 상품 찜 규칙", () => {
  it("키 묶음: 유효한 것만, 중복 제거", () => {
    expect(parseKeys("mercari:m123,daangn:abc-1,mercari:m123,ebay:1,mercari:,bad,joongna:a b")).toEqual([
      { source: "mercari", sourceId: "m123" }, { source: "daangn", sourceId: "abc-1" },
    ]);
    expect(parseKeys(null)).toEqual([]);
  });
  it("키 묶음은 최대 100개", () => {
    const raw = Array.from({ length: 150 }, (_, i) => wishKey("mercari", `m${i}`)).join(",");
    expect(parseKeys(raw)).toHaveLength(MAX_KEYS);
  });
  it("찜 본문: 스냅샷 정리", () => {
    expect(parseWish({ source: "mercari", sourceId: "m1", title: "  상품 ", price: 1200.4, currency: "JPY", thumb: "https://x/y.jpg" }))
      .toEqual({ source: "mercari", sourceId: "m1", title: "상품", price: 1200, currency: "JPY", thumb: "https://x/y.jpg" });
    expect(parseWish({ source: "mercari", sourceId: "m1", title: "a".repeat(400), price: 0, currency: "KRW", thumb: "javascript:alert(1)" }))
      ?.toMatchObject({ title: "a".repeat(300), thumb: "" });
  });
  it("찜 본문: 틀리면 null", () => {
    const ok = { source: "mercari", sourceId: "m1", title: "", price: 1, currency: "JPY", thumb: "" };
    expect(parseWish(null)).toBeNull();
    expect(parseWish({ ...ok, source: "ebay" })).toBeNull();
    expect(parseWish({ ...ok, sourceId: "a,b" })).toBeNull();
    expect(parseWish({ ...ok, sourceId: "../x" })).toBeNull();
    expect(parseWish({ ...ok, currency: "USD" })).toBeNull();
    expect(parseWish({ ...ok, price: -1 })).toBeNull();
    expect(parseWish({ ...ok, price: "abc" })).toBeNull();
  });
});
