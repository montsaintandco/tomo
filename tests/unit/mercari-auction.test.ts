import { describe, it, expect, vi, beforeEach } from "vitest";

// B0 메루카리 경매 인식·차단. 응답 모양은 2026-11-23 실측(m89478602989·m61885397138·m94537759466) 그대로다.
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }));
const fetchWithRetry = vi.fn();
vi.mock("../../lib/market/http", () => ({ fetchWithRetry: (...a: unknown[]) => fetchWithRetry(...a) }));

import { toSearchItem, mercariItem, isMercariSearchAuction, isMercariItemAuction } from "../../lib/market/mercari";
import { upsertExternalItem } from "../../lib/market/item";
import { UNBUYABLE_AUCTION } from "../../lib/unbuyable";
import { unbuyableKind } from "../../lib/item-insight";
import { recheckDecision, recheckItems, BLOCKING, type RecheckRow } from "../../lib/price-check";
import { passesHome } from "../../lib/home/quality";
import { splitUnbuyable } from "../../lib/market/search";

const SEARCH_AUCTION = { id: "112373202", bidDeadline: "2026-11-28T11:48:00Z", totalBid: "6", highestBid: "2500", initialPrice: "300", state: "STATE_UNSPECIFIED" };
const SEARCH_AUCTION_NO_BID = { id: "112382629", bidDeadline: "2026-11-28T11:06:22Z", totalBid: "0", highestBid: "2500", initialPrice: "2500", state: "STATE_UNSPECIFIED" };
const ITEM_AUCTION = { id: "112373202", start_time: 1795743944, expected_end_time: 1795866480, total_bids: 6, initial_price: 300, highest_bid: 2500, state: "STATE_ONGOING", auction_type: "AUCTION_TYPE_NORMAL" };
const ITEM_AUCTION_NO_BID = { id: "112382629", start_time: 1795752034, expected_end_time: 1795863989, total_bids: 0, initial_price: 2500, highest_bid: 2500, state: "STATE_NO_BID", auction_type: "AUCTION_TYPE_NORMAL" };

const searchRow = (auction: unknown) => ({ id: "m1", name: "ピカチュウex UR", price: "2500", status: "ITEM_STATUS_ON_SALE", thumbnails: ["t"], shippingPayerId: "2", itemConditionId: "3", auction });
const detail = (auction_info?: unknown) => ({
  data: { id: "m1", name: "ピカチュウex UR", price: 2500, status: "on_sale", description: "", photos: ["p"], seller: {}, num_likes: 3, num_comments: 0, ...(auction_info ? { auction_info } : {}) },
});
// items/get 은 상세, 판매자 다른 상품(get_items)은 빈 목록
const serve = (auction_info?: unknown) => fetchWithRetry.mockImplementation(async (url: string) => ({ ok: true, json: async () => (url.includes("/items/get?") ? detail(auction_info) : { data: [] }) }));

beforeEach(() => fetchWithRetry.mockReset());

describe("메루카리 경매 판정", () => {
  it("검색 auction 칸: 입찰 있음·0건 모두 경매, null 은 일반", () => {
    expect(isMercariSearchAuction(SEARCH_AUCTION)).toBe(true);
    expect(isMercariSearchAuction(SEARCH_AUCTION_NO_BID)).toBe(true);
    expect(isMercariSearchAuction(null)).toBe(false);
    expect(isMercariSearchAuction(undefined)).toBe(false);
  });
  it("상세 auction_info: STATE_ONGOING·STATE_NO_BID 모두 경매, 없으면 일반", () => {
    expect(isMercariItemAuction(ITEM_AUCTION)).toBe(true);
    expect(isMercariItemAuction(ITEM_AUCTION_NO_BID)).toBe(true);
    expect(isMercariItemAuction({ id: "", state: "STATE_NO_BID" })).toBe(true);
    expect(isMercariItemAuction(undefined)).toBe(false);
    expect(isMercariItemAuction(null)).toBe(false);
    expect(isMercariItemAuction({})).toBe(false);
  });
});

describe("검색 카드", () => {
  it("경매 → auction + 구경만, 맨 뒤로 남는다(빼지 않음)", () => {
    const a = toSearchItem(searchRow(SEARCH_AUCTION));
    expect(a).toMatchObject({ auction: true, unbuyable: UNBUYABLE_AUCTION, price: 2500 });
    expect(toSearchItem(searchRow(SEARCH_AUCTION_NO_BID))).toMatchObject({ auction: true, unbuyable: UNBUYABLE_AUCTION });
    const n = toSearchItem({ ...searchRow(null), id: "m2" });
    expect(n.auction).toBeUndefined();
    expect(n.unbuyable).toBeUndefined();
    const s = splitUnbuyable([a, n]);
    expect(s.items.map((i) => i.sourceId)).toEqual(["m2", "m1"]);
    expect(s.excluded).toEqual([]);
  });
  it("경매는 홈 줄에 올리지 않는다, 일반은 그대로", () => {
    expect(passesHome(toSearchItem(searchRow(SEARCH_AUCTION)))).toBe(false);
    expect(passesHome(toSearchItem(searchRow(null)))).toBe(true);
  });
});

describe("상세(items/get)", () => {
  it("include_auction=true 로 부르고, 경매면 구경만·입찰 수", async () => {
    serve(ITEM_AUCTION);
    const d = await mercariItem("m1");
    expect(String(fetchWithRetry.mock.calls[0][0])).toContain("/items/get?id=m1&include_auction=true");
    expect(d).toMatchObject({ auction: true, unbuyable: UNBUYABLE_AUCTION, price: 2500 });
    expect(d.counts?.bids).toBe(6);
    expect(unbuyableKind(d)).toBe("auction");
  });
  it("입찰 0건 경매도 막는다", async () => {
    serve(ITEM_AUCTION_NO_BID);
    expect(unbuyableKind(await mercariItem("m1"))).toBe("auction");
  });
  it("일반 상품은 그대로 살 수 있다", async () => {
    serve();
    const d = await mercariItem("m1");
    expect(d.auction).toBeUndefined();
    expect(unbuyableKind(d)).toBeNull();
  });
});

// external_items upsert 를 흉내 — 호출 기록만 남긴다
const fakeUpsertAdmin = () => {
  const calls: string[] = [];
  const admin = {
    from: () => ({
      upsert: () => { calls.push("upsert"); return { select: () => ({ single: async () => ({ data: { id: "x1" }, error: null }) }) }; },
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "x1" } }) }) }) }),
    }),
  };
  return { admin: admin as never, calls };
};

describe("장바구니 담기·대행 신청(upsertExternalItem)", () => {
  it("경매는 409 code=auction, 스냅샷도 적지 않는다(카트·대행 둘 다)", async () => {
    serve(ITEM_AUCTION);
    for (const allowClientSnapshot of [false, true]) {
      const { admin, calls } = fakeUpsertAdmin();
      expect(await upsertExternalItem(admin, "mercari", "m1", {}, { allowClientSnapshot })).toMatchObject({ status: 409, code: "auction" });
      expect(calls).toEqual([]);
    }
  });
  it("일반 상품은 그대로 담긴다", async () => {
    serve();
    const { admin, calls } = fakeUpsertAdmin();
    expect(await upsertExternalItem(admin, "mercari", "m1", {}, { allowClientSnapshot: false })).toEqual({ id: "x1" });
    expect(calls).toEqual(["upsert"]);
  });
});

describe("결제 직전 재확인", () => {
  const NOW = Date.parse("2026-11-23T12:00:00Z");
  it("경매면 가격이 같아도 auction(막음)", () => {
    const c = { price: 2500, status: "active", fetchedAt: new Date(NOW).toISOString() };
    expect(recheckDecision(2500, c, { price: 2500, soldOut: false, auction: true }, NOW)).toEqual({ kind: "auction", price: 2500 });
    expect(BLOCKING).toContain("auction");
    expect(recheckDecision(2500, c, { price: 2500, soldOut: false }, NOW).kind).toBe("ok");
  });
  it("장바구니에 이미 담긴 경매: 막고, fetched_at 을 새로 쓰지 않는다", async () => {
    const writes: unknown[] = [];
    const admin = { from: () => ({ update: (p: unknown) => ({ eq: async () => { writes.push(p); return { error: null }; } }) }) };
    serve(ITEM_AUCTION);
    const row: RecheckRow = { id: "a", source: "mercari", source_id: "m1", title: "T", price: 2500, currency: "JPY", status: "active", fetched_at: new Date(NOW - 60_000).toISOString() };
    const out = await recheckItems(admin as never, [row], { a: 2500 }, NOW);
    expect(out[0].kind).toBe("auction");
    expect(writes).toEqual([]);
  });
});
