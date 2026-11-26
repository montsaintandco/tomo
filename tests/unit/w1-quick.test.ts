import { describe, it, expect } from "vitest";
import { quickChips } from "../../components/search/quick-filters";

const qs = (h: string) => new URLSearchParams(h.split("?")[1]);

describe("W1 결과 바 빠른 칩", () => {
  it("가격대 3단 + 새 상품/중고, 다른 파라미터(q·source·sort·cat)는 유지", () => {
    const c = quickChips(new URLSearchParams("q=a&source=mercari&sort=new&cat=m1"), "JPY");
    expect(c.map((x) => x.kind)).toEqual(["price", "price", "price", "cond", "cond"]);
    const p = qs(c[1].href);
    expect([p.get("min"), p.get("max"), p.get("q"), p.get("source"), p.get("sort"), p.get("cat")]).toEqual(["1000", "5000", "a", "mercari", "new", "m1"]);
    expect(qs(c[0].href).get("min")).toBeNull();
    expect(qs(c[2].href).get("max")).toBeNull();
  });
  it("켜진 가격대는 다시 누르면 끈다, 다른 가격대는 바꾼다", () => {
    const c = quickChips(new URLSearchParams("q=a&min=10000&max=50000"), "KRW");
    expect(c[1].active).toBe(true);
    expect([qs(c[1].href).get("min"), qs(c[1].href).get("max")]).toEqual([null, null]);
    expect([qs(c[2].href).get("min"), qs(c[2].href).get("max")]).toEqual(["50000", null]);
  });
  it("손으로 넣은 가격(밴드와 다름)은 어느 칩도 켜지 않는다", () => {
    expect(quickChips(new URLSearchParams("min=10000&max=40000"), "KRW").some((x) => x.kind === "price" && x.active)).toBe(false);
  });
  it("상태 칩 토글", () => {
    const c = quickChips(new URLSearchParams("q=a&cond=new"), "KRW");
    expect(c[3].active).toBe(true);
    expect(qs(c[3].href).get("cond")).toBeNull();
    expect(qs(c[4].href).get("cond")).toBe("used");
  });
});
