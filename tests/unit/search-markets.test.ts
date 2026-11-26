import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MarketItem } from "../../lib/market/types";

// 검색 결과 캐시(lib/scrape-cache)가 모듈 안에 남으므로 테스트마다 검색어를 다르게 쓴다.
// 마켓·번역을 고정 응답으로 바꿔 통합 검색의 0건 재검색·제외·다음 페이지를 본다(실제 마켓 호출 없음)
const mercariSearchPage = vi.fn();
vi.mock("../../lib/market/mercari", () => ({ mercariSearchPage: (...a: unknown[]) => mercariSearchPage(...a) }));
vi.mock("../../lib/market/yahoo-flea", () => ({ yahooFleaSearch: async () => [] }));
vi.mock("../../lib/market/yahoo-auction", () => ({ yahooAuctionSearch: async () => [] }));
vi.mock("../../lib/market/daangn", () => ({ daangnSearch: async () => [] }));
vi.mock("../../lib/market/joongna", () => ({ joongnaSearch: async () => [] }));
vi.mock("../../lib/translate", () => ({ translateQueryTo: async (q: string, to: string) => (to !== "ja" ? q : q === "한국산 미니카" ? "韓国産ミニカー" : "ミニカー2") }));

const mk = (id: string, title = id): MarketItem => ({ source: "mercari", sourceId: id, url: "", title, price: 100, currency: "JPY", thumb: "", soldOut: false, ...(title.includes("専用") ? { unbuyable: "様専用" } : {}) });

describe("searchMarkets", () => {
  beforeEach(() => mercariSearchPage.mockReset());

  it("0건이면 넓힌 검색어로 다시 찾고, 살 수 없는 출품은 따로 돌려준다", async () => {
    mercariSearchPage.mockImplementation(async (kw: string) =>
      kw === "韓国 ミニカー" ? { items: [mk("a"), mk("b", "〇〇様専用")], next: "tok2" } : { items: [], next: "" });
    const { searchMarkets } = await import("../../lib/market/search");
    const r = await searchMarkets("한국산 미니카", "mercari", {}, "JPY", 1);
    expect(r.widenedFrom).toBe("韓国産ミニカー");
    expect(r.queries.mercari).toBe("韓国 ミニカー");
    expect(r.items.map((i) => i.sourceId)).toEqual(["a"]);
    expect(r.excluded.map((i) => i.sourceId)).toEqual(["b"]);
    expect(r.mercariMore).toEqual({ token: "tok2", term: "韓国 ミニカー", f: { min: undefined, max: undefined } });
  });

  it("결과가 있으면 넓히지 않는다", async () => {
    mercariSearchPage.mockResolvedValue({ items: [mk("x")], next: "" });
    const { searchMarkets } = await import("../../lib/market/search");
    const r = await searchMarkets("미니카2", "mercari");
    expect(r.widenedFrom).toBeUndefined();
    expect(r.mercariMore).toBeUndefined();
    expect(mercariSearchPage).toHaveBeenCalledTimes(1);
  });
});