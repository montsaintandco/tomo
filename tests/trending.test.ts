import { describe, it, expect } from "vitest";
import { TRENDING, pickTrendingItems, type TrendingTheme } from "../lib/market/trending-data";
import { LIVE_SOURCES, SOURCE_CURRENCY, type MarketItem } from "../lib/market/types";

const item = (source: MarketItem["source"], id: string, thumb = "t.jpg", soldOut = false): MarketItem => ({
  source, sourceId: id, url: `u/${id}`, title: id, price: 100,
  currency: SOURCE_CURRENCY[source], thumb, soldOut,
});

describe("TRENDING curation", () => {
  const all: TrendingTheme[] = [...TRENDING.KR, ...TRENDING.JP];
  it("has unique url-safe keys", () => {
    const keys = all.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9-]+$/);
  });
  it("has non-empty labels and terms", () => {
    for (const t of all) {
      expect(t.label.trim()).not.toBe("");
      expect(t.labelJa.trim()).not.toBe("");
      expect(t.term.trim()).not.toBe("");
    }
  });
  it("uses only live sources of the counterpart country", () => {
    for (const t of TRENDING.KR) for (const s of t.sources) {
      expect(LIVE_SOURCES).toContain(s);
      expect(SOURCE_CURRENCY[s]).toBe("JPY"); // 한국 구매자 → 일본 마켓
    }
    for (const t of TRENDING.JP) for (const s of t.sources) {
      expect(LIVE_SOURCES).toContain(s);
      expect(SOURCE_CURRENCY[s]).toBe("KRW"); // 일본 구매자 → 한국 마켓
    }
  });
  it("has at least 4 themes per country (home shows 4)", () => {
    expect(TRENDING.KR.length).toBeGreaterThanOrEqual(4);
    expect(TRENDING.JP.length).toBeGreaterThanOrEqual(4);
  });
});

describe("pickTrendingItems", () => {
  it("interleaves sources so one market cannot dominate", () => {
    const a = [item("mercari", "a1"), item("mercari", "a2"), item("mercari", "a3")];
    const b = [item("yahoo_auction", "b1"), item("yahoo_auction", "b2")];
    expect(pickTrendingItems([a, b]).map((i) => i.sourceId)).toEqual(["a1", "b1", "a2", "b2", "a3"]);
  });
  it("drops items without thumbnail or sold out", () => {
    const a = [item("mercari", "ok"), item("mercari", "nothumb", ""), item("mercari", "sold", "t.jpg", true)];
    expect(pickTrendingItems([a]).map((i) => i.sourceId)).toEqual(["ok"]);
  });
  it("caps at 10 by default", () => {
    const a = Array.from({ length: 8 }, (_, i) => item("mercari", `a${i}`));
    const b = Array.from({ length: 8 }, (_, i) => item("yahoo_auction", `b${i}`));
    expect(pickTrendingItems([a, b])).toHaveLength(10);
  });
  it("returns empty for all-empty input", () => {
    expect(pickTrendingItems([[], []])).toEqual([]);
  });
});
