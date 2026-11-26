import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MarketItem, SearchFilters } from "../../lib/market/types";
import { parseCat, catScope } from "../../lib/categories";

// 카테고리 검색 — 메루카리는 categoryId 로 거르고, 번호 없는 마켓은 카테고리 이름으로 찾는지(실제 마켓 호출 없음).
// lib/scrape-cache 가 모듈 안에 남으므로 테스트마다 카테고리·검색어를 다르게 쓴다
const mercariSearchPage = vi.fn();
const yahooFleaSearch = vi.fn(async () => [] as MarketItem[]);
const daangnSearch = vi.fn(async () => [] as MarketItem[]);
const joongnaSearch = vi.fn(async () => [] as MarketItem[]);
vi.mock("../../lib/market/mercari", () => ({ mercariSearchPage: (...a: unknown[]) => mercariSearchPage(...a) }));
vi.mock("../../lib/market/yahoo-flea", () => ({ yahooFleaSearch: (...a: unknown[]) => yahooFleaSearch(...(a as [])) }));
vi.mock("../../lib/market/yahoo-auction", () => ({ yahooAuctionSearch: async () => [] }));
vi.mock("../../lib/market/daangn", () => ({ daangnSearch: (...a: unknown[]) => daangnSearch(...(a as [])) }));
vi.mock("../../lib/market/joongna", () => ({ joongnaSearch: (...a: unknown[]) => joongnaSearch(...(a as [])) }));
vi.mock("../../lib/translate", () => ({ translateQueryTo: async (q: string, to: string) => (to === "ja" ? `${q}(ja)` : `${q}(ko)`) }));

const mk = (id: string, source: MarketItem["source"] = "mercari"): MarketItem =>
  ({ source, sourceId: id, url: "", title: id, price: 100, currency: source === "mercari" || source === "yahoo_flea" ? "JPY" : "KRW", thumb: "", soldOut: false });
const scope = (v: string) => catScope(parseCat(v)!);

describe("searchMarkets + 한국 마켓 카테고리 번호", () => {
  it("krCatIds 가 있으면 중고나라·당근에 각자 번호를 넘긴다 (2026-11-26 실측 매핑)", async () => {
    daangnSearch.mockClear(); joongnaSearch.mockClear();
    const { searchMarkets } = await import("../../lib/market/search");
    const { krCatIds } = await import("../../lib/categories");
    const ids = krCatIds(parseCat("camera")!);
    await searchMarkets("", ["daangn", "joongna"], {}, "JPY", 0.1, { ...scope("camera"), ...ids });
    expect((joongnaSearch.mock.calls[0] as unknown[])[1]).toBe(ids.jn || undefined);
    expect((daangnSearch.mock.calls[0] as unknown[])[1]).toBe(ids.dg || undefined);
  });
});

describe("searchMarkets + 카테고리", () => {
  beforeEach(() => { mercariSearchPage.mockReset(); yahooFleaSearch.mockClear(); daangnSearch.mockClear(); joongnaSearch.mockClear(); });

  it("검색어 없이 카테고리만 — 메루카리에 빈 검색어 + categoryId, 「전체」여도 메루카리만 부른다", async () => {
    mercariSearchPage.mockResolvedValue({ items: [mk("a")], next: "tok" });
    const { searchMarkets } = await import("../../lib/market/search");
    const r = await searchMarkets("", ["mercari", "yahoo_flea"], {}, "KRW", 10, scope("shoes.sneakers"));
    expect(mercariSearchPage).toHaveBeenCalledTimes(1);
    const [kw, f] = mercariSearchPage.mock.calls[0] as [string, SearchFilters];
    expect(kw).toBe("");
    expect(f.catIds).toEqual([179, 345]);
    expect(yahooFleaSearch).not.toHaveBeenCalled();
    expect(r.items.map((i) => i.sourceId)).toEqual(["a"]);
    // 더 보기도 같은 카테고리로 이어 받는다
    expect(r.mercariMore).toMatchObject({ token: "tok", term: "", f: { catIds: [179, 345] } });
    expect(r.queries.mercari).toBe("");
  });

  it("검색어 + mq 카테고리 — 번역 검색어 뒤에 mq 를 붙이고, 번역 검색어 칩에는 mq 를 넣지 않는다", async () => {
    mercariSearchPage.mockResolvedValue({ items: [mk("b")], next: "" });
    const { searchMarkets } = await import("../../lib/market/search");
    const r = await searchMarkets("키링", "mercari", {}, "KRW", 10, scope("character.chiikawa"));
    const [kw, f] = mercariSearchPage.mock.calls[0] as [string, SearchFilters];
    expect(kw).toBe("키링(ja) ちいかわ");
    expect(f.catIds).toEqual([745]);
    expect(r.queries.mercari).toBe("키링(ja)");
  });

  it("야후 플리마 탭을 직접 고르면 카테고리 이름(일본어)으로 찾는다 — 번호는 넘기지 않는다", async () => {
    const { searchMarkets } = await import("../../lib/market/search");
    await searchMarkets("", "yahoo_flea", {}, "KRW", 10, scope("camera.lens"));
    expect(yahooFleaSearch).toHaveBeenCalledTimes(1);
    const [kw, f] = yahooFleaSearch.mock.calls[0] as unknown as [string, SearchFilters];
    expect(kw).toBe("レンズ");
    expect(f.catIds).toBeUndefined();
    expect(mercariSearchPage).not.toHaveBeenCalled();
  });

  it("한국 마켓(일본 사용자)은 번호가 없어 한국어 키워드로 둘 다 찾는다", async () => {
    daangnSearch.mockResolvedValueOnce([mk("d1", "daangn")]);
    const { searchMarkets } = await import("../../lib/market/search");
    const r = await searchMarkets("", ["daangn", "joongna"], {}, "JPY", 0.1, scope("music.guitar"));
    // 번호 없는 범위(catScope 만)는 키워드만 — 두 번째 인자(카테고리 번호) 없음
    expect((daangnSearch.mock.calls[0] as unknown[])[0]).toBe("일렉기타");
    expect((joongnaSearch.mock.calls[0] as unknown[])[0]).toBe("일렉기타");
    expect((daangnSearch.mock.calls[0] as unknown[])[1]).toBeUndefined();
    expect(r.items.map((i) => i.sourceId)).toEqual(["d1"]);
  });

  it("카테고리가 없으면 예전과 같다 — 빈 검색어는 아무것도 부르지 않고, 메루카리에 categoryId 를 넣지 않는다", async () => {
    mercariSearchPage.mockResolvedValue({ items: [mk("c")], next: "" });
    const { searchMarkets } = await import("../../lib/market/search");
    expect((await searchMarkets("", ["mercari", "yahoo_flea"])).items).toEqual([]);
    expect(mercariSearchPage).not.toHaveBeenCalled();
    await searchMarkets("카메라 렌즈", ["mercari", "yahoo_flea"], {}, "KRW", 10);
    const [, f] = mercariSearchPage.mock.calls[0] as [string, SearchFilters];
    expect(f.catIds).toBeUndefined();
    expect(yahooFleaSearch).toHaveBeenCalled();
  });
});
