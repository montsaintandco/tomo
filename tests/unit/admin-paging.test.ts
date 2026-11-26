import { describe, it, expect } from "vitest";
import { pageOf, pageItems, hrefWith, likeEscape } from "../../components/admin/paging";
import { canAutoRefresh } from "../../components/admin/use-auto-refresh";

describe("pageOf — ?page= 를 범위로", () => {
  it("1쪽 기본, 잘못된 값은 1쪽", () => {
    expect(pageOf(undefined, 50)).toMatchObject({ page: 1, from: 0, to: 49 });
    expect(pageOf("3", 50)).toMatchObject({ page: 3, from: 100, to: 149 });
    for (const bad of ["0", "-2", "1.5", "abc", "99999999"]) expect(pageOf(bad, 50).page).toBe(1);
  });
});

describe("pageItems — 처음·끝·현재 ±2, 사이는 생략", () => {
  it("짧으면 전부", () => expect(pageItems(1, 3)).toEqual([1, 2, 3]));
  it("길면 생략", () => expect(pageItems(10, 20)).toEqual([1, "gap", 8, 9, 10, 11, 12, "gap", 20]));
  it("앞쪽", () => expect(pageItems(1, 10)).toEqual([1, 2, 3, "gap", 10]));
});

describe("hrefWith — 필터는 URL 에 남고 빈 값은 빠진다", () => {
  it("덮어쓰기와 빈 값 제거", () => {
    expect(hrefWith("/admin/orders", { status: "paid", page: "2" }, { open: "x" })).toBe("/admin/orders?status=paid&page=2&open=x");
    expect(hrefWith("/admin/orders", { status: "paid", page: "2" }, { page: undefined })).toBe("/admin/orders?status=paid");
    expect(hrefWith("/admin/orders", {})).toBe("/admin/orders");
    expect(hrefWith("/admin/listings", { q: "가 &b" })).toBe("/admin/listings?q=%EA%B0%80+%26b");
  });
});

describe("likeEscape", () => {
  it("% _ \\ 를 이스케이프", () => expect(likeEscape("50%_a\\b")).toBe("50\\%\\_a\\\\b"));
});

describe("canAutoRefresh — 멈춤이면 갱신하지 않는다", () => {
  it("node 환경(document 없음)", () => {
    expect(canAutoRefresh(true)).toBe(false);
    expect(canAutoRefresh(false)).toBe(true);
  });
});
