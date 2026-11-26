import { describe, expect, it } from "vitest";
import { assembleRows, pickPhotos, shownKeys, itemKey } from "../../lib/home/assemble";
import { passesHome, isShipUnfit, between, pickSection } from "../../lib/home/quality";
import type { MarketItem } from "../../lib/market/types";

const item = (id: string, over: Partial<MarketItem> = {}): MarketItem => ({
  source: "mercari", sourceId: id, url: `https://jp.mercari.com/item/${id}`, title: `ポケモンカード ${id}`,
  price: 1000, currency: "JPY", thumb: `https://static.mercdn.net/${id}.jpg`, soldOut: false, ...over,
});
const ids = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => item(`${prefix}${i}`));
const theme = (key: string) => ({ key, label: key, labelJa: key, term: key, sources: ["mercari" as const] });

describe("home quality", () => {
  it("살 수 없는 출품·항공 불가·사진 없음·0원·품절은 뺀다", () => {
    expect(passesHome(item("a"))).toBe(true);
    expect(passesHome(item("b", { title: "〇〇様専用 ポケカ" }))).toBe(false);
    expect(passesHome(item("c", { title: "ZIPPO ライター" }))).toBe(false);
    expect(passesHome(item("d", { thumb: "" }))).toBe(false);
    expect(passesHome(item("e", { price: 0 }))).toBe(false);
    expect(passesHome(item("f", { soldOut: true }))).toBe(false);
    expect(isShipUnfit("ｱｲｺｽ IQOS")).toBe(true);
  });

  it("between: 최소 개수 미만이면 숨기고 최대에서 자른다", () => {
    const fit = between(4, 10);
    expect([fit(3), fit(4), fit(12)]).toEqual([0, 4, 10]);
    const seen = new Set<string>();
    expect(pickSection(["a", "a", "b"], (x) => x, seen, between(1, 5))).toEqual(["a", "b"]);
    expect(pickSection(["a", "c"], (x) => x, seen, between(1, 5))).toEqual(["c"]);
  });
});

describe("home assemble", () => {
  it("같은 상품이 두 줄에 나오지 않는다 (앞 줄 우선)", () => {
    const shared = ids(5, "s");
    const rows = assembleRows([
      { theme: theme("a"), items: [...shared, ...ids(5, "a")] },
      { theme: theme("b"), items: [...shared, ...ids(6, "b")] },
      { theme: theme("c"), items: [...shared, ...ids(2, "c")] }, // 중복 빼면 2개 → 줄 숨김
    ]);
    expect(rows.map((r) => r.items.length)).toEqual([10, 6, 0]);
    const all = rows.flatMap((r) => r.items.map(itemKey));
    expect(new Set(all).size).toBe(all.length);
    expect(rows[1].items.every((it) => it.sourceId.startsWith("b"))).toBe(true);
  });

  it("거른 상품은 줄에 안 들어간다", () => {
    const rows = assembleRows([{ theme: theme("a"), items: [item("x", { title: "専用" }), ...ids(4, "a")] }]);
    expect(rows[0].items.map((i) => i.sourceId)).toEqual(["a0", "a1", "a2", "a3"]);
  });

  it("원형 사진은 홈 카드와 앞 칸이 고른 상품을 피한다", () => {
    const shown = shownKeys([{ items: [item("p0")] }]);
    const photos = pickPhotos([[item("p0"), item("p1")], [item("p1"), item("p2")], [item("p2")], []], shown);
    expect(photos).toEqual([item("p1").thumb, item("p2").thumb, null, null]);
  });
});
