import { describe, it, expect } from "vitest";
import { segmentByGlossary, restoreTerms, translateWithGlossary, fixKoTranslation } from "../../lib/goods-glossary";

// 03#8 용어집 — 보호→번역→복원 순서를 고정한다. 번역기는 가짜(자리표시는 그대로 두고 나머지만 옮긴다)
const fake = (dict: Record<string, string>) => async (s: string) => dict[s] ?? s;

describe("번역 용어집", () => {
  it("긴 용어 우선·이어 붙이면 원문", () => {
    const segs = segmentByGlossary("ちいかわ ちびぬい 新品未開封");
    expect(segs.map((s) => s.text).join("")).toBe("ちいかわ ちびぬい 新品未開封");
    expect(segs.filter((s) => s.ko).map((s) => s.ko)).toEqual(["치이카와", "치비 누이", "새 상품 미개봉"]);
  });
  it("세 글자 이하 히라가나 용어는 단어 안에서 안 잡는다", () => {
    expect(segmentByGlossary("ぬいてください").some((s) => s.ko)).toBe(false);
  });
  it("보호 → 번역 → 복원 (번역기에는 자리표시만 간다)", async () => {
    const seen: string[] = [];
    const tr = async (s: string) => { seen.push(s); return s.replace("まとめて", " 모아서 ").replace("セット", "세트"); };
    const out = await translateWithGlossary("ハチワレまとめてセット", tr);
    expect(seen[0]).toBe("[0]まとめてセット");
    expect(out).toBe("하치와레 모아서 세트");
  });
  it("번역기가 자리표시를 망가뜨리면 용어를 넣은 원문으로 다시 번역", async () => {
    const out = await translateWithGlossary("ハチワレまとめてセット", fake({ "[0]まとめてセット": "모아서 세트", "하치와레 まとめてセット": "하치와레 모아서 세트" }));
    expect(out).toBe("하치와레 모아서 세트");
  });
  it("번역 실패(입력 그대로)면 원문", async () => {
    expect(await translateWithGlossary("ハチワレまとめてセット", async (s) => s)).toBe("ハチワレまとめてセット");
  });
  it("용어뿐이면 번역기 없이 치환", async () => {
    expect(await translateWithGlossary("ちいかわ ハチワレ", async () => { throw new Error("no call"); })).toBe("치이카와 하치와레");
  });
  it("조사를 받침에 맞춘다", () => {
    expect(restoreTerms("[0]이 귀여워", ["하치와레"])).toBe("하치와레가 귀여워");
    expect(restoreTerms("[0]가 귀여워", ["치비 누이"])).toBe("치비 누이가 귀여워");
    expect(restoreTerms("없음", ["x"])).toBeNull();
  });
  it("알려진 오역은 원문에 그 말이 있을 때만 고친다", () => {
    expect(fixKoTranslation("장미 판매 세트", "バラ売りセット")).toBe("낱개 판매 세트");
    expect(fixKoTranslation("장미 판매", "薔薇の販売")).toBe("장미 판매");
  });
});
