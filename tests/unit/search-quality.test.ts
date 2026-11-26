import { describe, it, expect } from "vitest";
import { unbuyableReason, unbuyableDetail, UNBUYABLE_AUCTION } from "../../lib/unbuyable";
import { widenCandidates } from "../../lib/search-widen";
import { splitKoJaQuery, curatedJa } from "../../lib/ko-ja-terms";
import { resolveSearchInput, extractUrl } from "../../lib/search-input";
import { titleForLang, scriptLang } from "../../lib/market/title";
import { normalizeQuery, isLoggableQuery } from "../../lib/search-log";
import { toSearchItem } from "../../lib/market/mercari";
import { toItem as fleaItem } from "../../lib/market/yahoo-flea";
import { splitUnbuyable } from "../../lib/market/search";
import type { MarketItem } from "../../lib/market/types";

describe("살 수 없는 출품 필터", () => {
  it("구매자 지정·취り置き·주문제작·추첨 제목을 거른다", () => {
    for (const t of ["〇〇様専用 ポケモンカード", "専用 ちいかわ", "ちいかわ 取り置き中", "オーダー受付 ぬい服", "300円企画 抽選", "P*O様 あんあんキャップ", "케이스 홍길동님 전용", "아이폰 15 예약중"])
      expect(unbuyableReason(t), t).toBeTruthy();
  });
  it("호환 표기 専用·일반 낱말은 남긴다", () => {
    for (const t of ["iPhone15専用ケース", "王様のブランチ グッズ", "お客様感謝 セール", "ポケモンカード 151 BOX", "아이폰 전용 케이스"])
      expect(unbuyableReason(t), t).toBeUndefined();
  });
  it("상세는 설명의 주문 페이지 신호도 본다", () => {
    expect(unbuyableDetail("すのチル ソフビサイズ", "こちらはオーダーページです")).toBeTruthy();
    expect(unbuyableDetail("イヤホン", "オーダーメイドのケースです")).toBeUndefined();
  });
  it("splitUnbuyable: 지정 출품은 제외 목록, 경매는 남기되 맨 뒤", () => {
    const mk = (id: string, unbuyable?: string): MarketItem => ({ source: "mercari", sourceId: id, url: "", title: id, price: 1, currency: "JPY", thumb: "", soldOut: false, unbuyable });
    const r = splitUnbuyable([mk("a", UNBUYABLE_AUCTION), mk("b"), mk("c", "様専用"), mk("d")]);
    expect(r.items.map((i) => i.sourceId)).toEqual(["b", "d", "a"]);
    expect(r.excluded.map((i) => i.sourceId)).toEqual(["c"]);
  });
});

describe("0건 재검색 후보", () => {
  it("나라+産/製 을 풀고, 뒤 낱말만도 써 본다", () => {
    expect(widenCandidates("韓国産ミニカー")).toEqual(["韓国 ミニカー", "韓国製 ミニカー", "ミニカー"]);
  });
  it("붙어 있는 나라 이름을 띄운다", () => {
    expect(widenCandidates("韓国ミニカ")).toEqual(["韓国 ミニカ", "ミニカ"]);
  });
  it("한국어 검색어는 앞 낱말을 뺀다. 한 낱말이면 후보 없음", () => {
    expect(widenCandidates("빨간 포켓몬 인형")).toEqual(["포켓몬 인형"]);
    expect(widenCandidates("ポケモン")).toEqual([]);
  });
});

describe("한→일 고유명사 사전", () => {
  it("통째 일치", () => {
    expect(curatedJa("포켓몬")).toBe("ポケモン");
    expect(curatedJa(" 기타 ")).toBe("ギター");
    expect(curatedJa("없는말")).toBeNull();
  });
  it("고유명사는 붙어 있어도 바꾸고, 나머지는 번역 구간으로 남긴다", () => {
    expect(splitKoJaQuery("치이카와 미개봉 A상")).toEqual([{ ja: "ちいかわ" }, { ko: "미개봉 A상" }]);
    expect(splitKoJaQuery("치이카와인형")).toEqual([{ ja: "ちいかわ" }, { ko: "인형" }]);
    expect(splitKoJaQuery("포켓몬 카드 PSA10")).toEqual([{ ja: "ポケモンカード" }, { ja: "PSA10" }]);
  });
  it("통째 전용 말(기타)은 조각 치환하지 않는다. 사전 말이 없으면 null", () => {
    expect(splitKoJaQuery("기타 굿즈")).toBeNull();
    expect(splitKoJaQuery("빨간 가방")).toBeNull();
  });
});

describe("검색 입력 해석", () => {
  it("공유 문구·https 없는 링크·메루카리 ID 는 상품으로", () => {
    expect(resolveSearchInput("かわいい ¥1,000 https://jp.mercari.com/item/m12345678901 #メルカリ")).toEqual({ source: "mercari", id: "m12345678901" });
    expect(resolveSearchInput("jp.mercari.com/item/m62860544566")).toEqual({ source: "mercari", id: "m62860544566" });
    expect(resolveSearchInput("M12345678901")).toEqual({ source: "mercari", id: "m12345678901" });
    expect(resolveSearchInput("https://web.joongna.com/product/987654321).")).toEqual({ source: "joongna", id: "987654321" });
  });
  it("검색어·지원 안 하는 링크는 null", () => {
    expect(resolveSearchInput("포켓몬 카드")).toBeNull();
    expect(resolveSearchInput("https://www.amazon.co.jp/dp/B000000")).toBeNull();
    expect(extractUrl("https://www.amazon.co.jp/dp/B000000")).toBe("https://www.amazon.co.jp/dp/B000000");
  });
});

describe("캐시 제목 언어 규칙", () => {
  it("번역 제목은 화면 언어와 같을 때만", () => {
    expect(titleForLang("ポケモン", "포켓몬", null, "ko")).toEqual({ title: "ポケモン", titleTranslated: "포켓몬" });
    expect(titleForLang("포켓몬 인형", "포켓몬 인형2", null, "ja")).toEqual({ title: "포켓몬 인형" });
    expect(titleForLang("x", "ABC", "ja", "ja")).toEqual({ title: "x", titleTranslated: "ABC" });
    expect(titleForLang("x", null, null, "ko")).toEqual({ title: "x" });
  });
  it("글자로 언어 판정(가나 → ja, 한글 → ko, 한자만 → 모름)", () => {
    expect(scriptLang("ちいかわ")).toBe("ja");
    expect(scriptLang("치이카와")).toBe("ko");
    expect(scriptLang("中古")).toBeNull();
  });
});

describe("검색 로그 정규화", () => {
  it("공백·대소문자를 맞추고 링크·숫자만은 안 적는다", () => {
    expect(normalizeQuery("  Pokemon   Card ")).toBe("pokemon card");
    expect(isLoggableQuery("포켓몬")).toBe(true);
    expect(isLoggableQuery("https://jp.mercari.com/item/m1")).toBe(false);
    expect(isLoggableQuery("12345")).toBe(false);
    expect(isLoggableQuery("a".repeat(81))).toBe(false);
  });
});

describe("파서 고정 응답", () => {
  it("메루카리 v2 검색 항목 → 배송비 포함·상태·살 수 없음", () => {
    const it1 = toSearchItem({ id: "m1", name: "ちいかわ ぬいぐるみ", price: "1200", status: "ITEM_STATUS_ON_SALE", thumbnails: ["t"], shippingPayerId: "2", itemConditionId: "1" });
    expect(it1).toMatchObject({ sourceId: "m1", price: 1200, soldOut: false, shippingIncluded: true, condition: "新品、未使用" });
    expect(it1.unbuyable).toBeUndefined();
    const it2 = toSearchItem({ id: "m2", name: "〇〇様専用", price: 33333, status: "ITEM_STATUS_TRADING", shippingPayerId: "1" });
    expect(it2).toMatchObject({ soldOut: true, shippingIncluded: false, unbuyable: "様専用" });
  });
  it("야후 플리마 검색 항목은 판매자 배송비 부담", () => {
    expect(fleaItem({ id: "z1", title: "取り置き", price: 500, itemStatus: "OPEN" })).toMatchObject({ shippingIncluded: true, soldOut: false, unbuyable: "取り置き" });
  });
});