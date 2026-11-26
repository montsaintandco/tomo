import { describe, it, expect } from "vitest";
import { ruleFlags, unbuyableKind, sellerCancelCount, isSellerCancel } from "../../lib/item-insight";
import { UNBUYABLE_AUCTION } from "../../lib/unbuyable";

describe("상품 주의 체크", () => {
  it("구매자 지정: 파서 unbuyable·제목·설명 어느 쪽이든", () => {
    expect(ruleFlags({ title: "○○様専用 ぬいぐるみ" })).toContain("buyer_only");
    expect(ruleFlags({ title: "ぬいぐるみ", unbuyable: "専用" })).toContain("buyer_only");
    expect(ruleFlags({ title: "ぬいぐるみ", description: "こちらは〇〇様専用ページです" })).toContain("buyer_only");
    expect(ruleFlags({ title: "iPhone15専用ケース" })).not.toContain("buyer_only");
  });
  it("경매 「구경만」은 구매자 지정 경고가 아니다", () => {
    expect(ruleFlags({ title: "カメラ", unbuyable: UNBUYABLE_AUCTION })).not.toContain("buyer_only");
    expect(unbuyableKind({ title: "カメラ", unbuyable: UNBUYABLE_AUCTION })).toBe("auction");
    expect(unbuyableKind({ title: "カメラ" })).toBeNull();
    expect(unbuyableKind({ title: "カメラ", description: "オーダーページです" })).toBe("buyer_only");
  });
  it("항공 제한·착불", () => {
    expect(ruleFlags({ title: "モバイルバッテリー 10000mAh" })).toEqual(["battery"]);
    expect(ruleFlags({ title: "香水 オードトワレ" })).toEqual(["liquid"]);
    expect(ruleFlags({ title: "ヘアスプレー" })).toEqual(["spray"]);
    expect(ruleFlags({ title: "Tシャツ", shippingIncluded: false })).toEqual(["buyer_ship"]);
    expect(ruleFlags({ title: "Tシャツ", shippingIncluded: true })).toEqual([]);
  });
});

describe("판매자 취소 이력", () => {
  it("판매자 취소 사유만, 같은 상품은 1건", () => {
    const rows = [
      { external_item_id: "a", cancel_reason: "판매자 취소로 환불" },
      { external_item_id: "a", cancel_reason: "판매자가 취소함" },
      { external_item_id: "b", cancel_reason: "出品者都合によるキャンセル" },
      { external_item_id: "c", cancel_reason: "고객 단순 변심" },
      { external_item_id: "d", cancel_reason: null },
    ];
    expect(sellerCancelCount(rows)).toBe(2);
    expect(isSellerCancel({ external_item_id: "x", cancel_reason: "품절" })).toBe(false);
  });
});
