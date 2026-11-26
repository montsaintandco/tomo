import { describe, it, expect } from "vitest";
import { KR_MARKET_CAT, parseCat, catScope, krCatIds, CATEGORIES } from "../../lib/categories";
import { joongnaSearchUrl } from "../../lib/market/joongna";
import { daangnSearchUrl } from "../../lib/market/daangn";

// 2026-11-26 실측한 번호만 쓴다(다른 번호는 오타로 본다)
const DAANGN = new Set([1, 172, 8, 7, 4, 173, 5, 31, 14, 6, 3, 2, 9, 304, 517, 305, 483, 16, 139, 13, 32]);
const JOONGNA = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 1367, 1388,
  111, 112, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 127, 128, 129, 132, 134, 135, 137, 139, 140, 141,
  153, 156, 186, 188, 189, 193, 194, 195, 201, 203, 205, 208, 209, 210, 211, 212, 214, 216, 219, 220, 223, 228, 229, 231,
  232, 234, 235, 237, 241, 242, 174, 175, 177, 179,
  1217, 1218, 1220, 1250, 1251, 1252, 1253, 1225, 1226, 1052, 1055, 1056, 1057, 1060, 1064, 1067, 1071, 1077,
  1088, 1090, 1091, 1093, 1095, 1101, 1102, 1103, 1171, 1244,
]);

describe("한국 마켓 카테고리 번호 (W3)", () => {
  it("표의 키는 모두 실제 카테고리이고, 번호는 실측 목록 안에 있다", () => {
    for (const [key, [jn, dg]] of Object.entries(KR_MARKET_CAT)) {
      expect(parseCat(key), key).not.toBeNull();
      if (jn) expect(JOONGNA.has(jn), `${key} jn ${jn}`).toBe(true);
      if (dg) expect(DAANGN.has(dg), `${key} dg ${dg}`).toBe(true);
    }
  });
  it("대분류는 모두 표에 있다(캐릭터만 키워드 전용)", () => {
    const missing = CATEGORIES.map((c) => c.slug).filter((s) => !KR_MARKET_CAT[s]);
    expect(missing).toEqual(["character"]);
  });
  it("krCatIds 가 번호를 주고, 0 이면 뺀다. catScope 는 그대로", () => {
    const ref = parseCat("figure.plamo")!;
    expect({ ...catScope(ref), ...krCatIds(ref) }).toMatchObject({ ko: "프라모델", jn: 1218, dg: 2 });
    expect(krCatIds(parseCat("shoes.sneakers")!)).toEqual({ jn: 114 });
    expect(krCatIds(parseCat("character.pokemon")!)).toEqual({});
    expect(krCatIds(parseCat("m3888")!)).toEqual({});
    expect("jn" in catScope(ref)).toBe(false);
  });
  it("검색 URL 에 카테고리 파라미터가 붙는다(없거나 이상하면 안 붙는다)", () => {
    expect(joongnaSearchUrl("피규어", 1217)).toBe("https://web.joongna.com/search/%ED%94%BC%EA%B7%9C%EC%96%B4?category=1217");
    expect(joongnaSearchUrl("피규어")).toBe("https://web.joongna.com/search/%ED%94%BC%EA%B7%9C%EC%96%B4");
    expect(daangnSearchUrl("피규어", 2)).toBe("https://www.daangn.com/kr/buy-sell/?category_id=2&search=%ED%94%BC%EA%B7%9C%EC%96%B4");
    expect(daangnSearchUrl("a&b", 0)).toBe("https://www.daangn.com/kr/buy-sell/?search=a%26b");
    expect(joongnaSearchUrl("x", 1.5)).toBe("https://web.joongna.com/search/x");
  });
});
