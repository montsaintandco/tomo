import { describe, expect, it } from "vitest";
import { cleanPopular, countQueries, mergeKeywords } from "../../lib/home/popular";

const log = (q: string, n: number, hits = 5) => Array.from({ length: n }, () => ({ q, q_norm: q.toLowerCase(), hits }));

describe("home popular keywords", () => {
  it("최소 건수 미만·0건 검색은 세지 않고 많이 찾은 순", () => {
    const rows = [...log("치이카와", 3), ...log("포켓몬카드", 5), ...log("드문말", 2), ...log("없는말", 9, 0)];
    expect(countQueries(rows)).toEqual(["포켓몬카드", "치이카와"]);
  });

  it("URL·상품 ID·개인정보·금지어·다른 언어를 거른다", () => {
    const qs = ["https://jp.mercari.com/item/m123", "m12345678901", "010-1234-5678", "a@b.com", "시발", "ポケモン", "치이카와", "x"];
    expect(cleanPopular(qs, "ko")).toEqual(["치이카와"]);
    expect(cleanPopular(qs, "ja")).toEqual(["ポケモン"]);
    expect(cleanPopular(["エロ 本", "ちいかわ"], "ja")).toEqual(["ちいかわ"]);
  });

  it("같은 첫 단어는 2개까지", () => {
    expect(cleanPopular(["포켓몬 카드", "포켓몬 인형", "포켓몬 피규어", "치이카와"], "ko")).toEqual(["포켓몬 카드", "포켓몬 인형", "치이카와"]);
  });

  it("큐레이션을 먼저, 중복 없이 합친다", () => {
    expect(mergeKeywords(["포켓몬카드", "치이카와"], ["치이카와", "산리오"], 3)).toEqual(["포켓몬카드", "치이카와", "산리오"]);
  });
});
