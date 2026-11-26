import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CATEGORIES, MERCARI_ROOTS, FEATURED, findMajor, parseCat, catScope, catParam, catCrumbs, krTerm,
  LISTING_CATEGORIES, isListingCategory, listingCategoryName,
} from "../../lib/categories";

// 메루카리 카테고리 트리 스냅샷(0~3단계, 2026-11-26 실측) — [번호, 부모번호]. 부모 0 = 대분류
const tree = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "mercari-categories.json"), "utf8")) as { items: [number, number][] };
const parent = new Map(tree.items.map(([id, p]) => [id, p]));
const rootOf = (id: number): number => { let cur = id; while (parent.get(cur)) cur = parent.get(cur)!; return cur; };

const all = CATEGORIES.flatMap((m) => [{ major: m, c: m as { slug: string; ko: string; ja: string; mercari: number[]; kr?: string } }, ...m.subs.map((c) => ({ major: m, c }))]);

describe("카테고리 표", () => {
  it("대분류 slug 가 겹치지 않고, 대분류 안의 세부 분류 slug 도 겹치지 않는다", () => {
    const majors = CATEGORIES.map((c) => c.slug);
    expect(new Set(majors).size).toBe(majors.length);
    for (const m of CATEGORIES) expect(new Set(m.subs.map((s) => s.slug)).size, m.slug).toBe(m.subs.length);
    const params = CATEGORIES.flatMap((m) => [catParam(m), ...m.subs.map((s) => catParam(m, s))]);
    expect(new Set(params).size).toBe(params.length);
    // slug 는 URL 에 그대로 들어간다 — 소문자·숫자·하이픈만(점은 대분류.세부 구분자)
    for (const p of params) expect(p).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)?$/);
  });

  it("모든 대분류·세부 분류에 ko·ja 이름과 한국 마켓 검색어가 있다", () => {
    for (const { c } of all) {
      expect(c.ko.trim(), c.slug).not.toBe("");
      expect(c.ja.trim(), c.slug).not.toBe("");
      expect(krTerm(c), c.slug).not.toBe("");
    }
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(17);
    expect(CATEGORIES.every((m) => m.subs.length >= 4)).toBe(true);
  });

  it("메루카리 번호는 전부 실제 트리에 있고, 대분류의 roots 안에 든다", () => {
    const bad: string[] = [];
    for (const { major, c } of all) {
      if (c.mercari.length === 0 || new Set(c.mercari).size !== c.mercari.length) bad.push(`${major.slug}/${c.slug}: 빈 번호·중복`);
      for (const id of c.mercari) {
        if (!parent.has(id)) bad.push(`${major.slug}/${c.slug} ${id}: 트리에 없음`);
        else if (!major.roots.includes(rootOf(id))) bad.push(`${major.slug}/${c.slug} ${id} → root ${rootOf(id)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("메루카리 대분류 표 번호는 겹치지 않고 트리에 있으며, roots 는 전부 이 표 안의 번호다", () => {
    const ids = MERCARI_ROOTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(parent.has(id), String(id)).toBe(true);
    for (const r of MERCARI_ROOTS.filter((x) => x.id !== 82)) expect(parent.get(r.id), String(r.id)).toBe(0);
    for (const m of CATEGORIES) for (const r of m.roots) expect(ids, m.slug).toContain(r);
  });

  it("홈 원형 6칸은 전부 표에 있다", () => {
    expect(FEATURED.every((s) => !!findMajor(s))).toBe(true);
  });
});

describe("판매 매물 카테고리", () => {
  it("예전 값(figure·camera·fashion·kpop·game·vintage·etc)을 계속 받는다", () => {
    for (const v of ["figure", "camera", "fashion", "kpop", "game", "vintage", "etc"]) expect(isListingCategory(v), v).toBe(true);
    expect(listingCategoryName("ko", "fashion")).toBe("패션");
    expect(listingCategoryName("ja", "camera")).toBe("カメラ");
  });

  it("새 대분류는 판매 폼 목록에 있고, 모르는 값·상속 이름은 막는다", () => {
    expect(LISTING_CATEGORIES).toContain("beauty");
    expect(LISTING_CATEGORIES).toContain("etc");
    expect(LISTING_CATEGORIES).not.toContain("fashion"); // 새로 고르는 목록에는 없다
    for (const v of ["toString", "constructor", "__proto__", "", "FIGURE", 1, null, undefined]) expect(isListingCategory(v), String(v)).toBe(false);
    expect(listingCategoryName("ko", "toString")).toBe("기타");
  });
});

describe("검색 파라미터 cat", () => {
  it("대분류·세부 분류·메루카리 대분류를 읽는다", () => {
    expect(parseCat("figure")).toMatchObject({ kind: "tomo", major: { slug: "figure" } });
    const sub = parseCat("figure.plamo");
    expect(sub?.kind === "tomo" && sub.sub?.slug).toBe("plamo");
    expect(parseCat("m1328")).toMatchObject({ kind: "mercari", root: { id: 1328 } });
    expect(parseCat(" game ")).toMatchObject({ kind: "tomo", major: { slug: "game" } });
  });

  it("모르는 값·형식이 틀린 값은 무시한다", () => {
    for (const v of ["", "nope", "figure.nope", "figure.plamo.x", "m99999", "m", "m-1", "1328", "figure.", ".plamo", undefined, null, ["figure"], 5])
      expect(parseCat(v), JSON.stringify(v)).toBeNull();
  });

  it("검색 범위 — 메루카리 번호, 카테고리 안 검색어(mq), 번호 없는 마켓의 검색어", () => {
    expect(catScope(parseCat("character.chiikawa")!)).toEqual({ mercari: [745], mq: "ちいかわ", ja: "ちいかわ", ko: "치이카와" });
    expect(catScope(parseCat("shoes.sneakers")!)).toEqual({ mercari: [179, 345], ja: "スニーカー", ko: "스니커즈" });
    expect(catScope(parseCat("figure")!)).toMatchObject({ ja: "フィギュア", ko: "피규어" });
    expect(catScope(parseCat("m3888")!)).toEqual({ mercari: [3888], ja: "テレビ", ko: "TV" });
  });

  it("위치 줄 — 전체 → 대분류 → 세부 분류(지금 위치는 링크 없음)", () => {
    expect(catCrumbs("ko", parseCat("figure.plamo")!, "전체")).toEqual([
      { label: "전체", href: "/categories" }, { label: "피규어·취미", href: "/categories/figure" }, { label: "프라모델·모형" },
    ]);
    expect(catCrumbs("ja", parseCat("m5")!, "一覧").at(-1)).toEqual({ label: "メルカリ · 本・雑誌・漫画" });
  });
});
