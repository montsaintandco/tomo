import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

// 마켓 파서는 부르지 않는다 — loadItem 을 바꿔 끼운다
const loadItem = vi.fn();
vi.mock("../../lib/market/item", () => ({ loadItem: (...a: unknown[]) => loadItem(...a) }));

import { recheckDecision, recheckItems, ORDER_FRESH_MS, BLOCKING, type RecheckRow } from "../../lib/price-check";
import { directShippingFee, PROXY_SHIPPING_ESTIMATE_KRW, PROXY_SHIPPING_ESTIMATE_JPY } from "../../lib/fees";

const NOW = Date.parse("2026-11-26T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const cached = (over: Partial<{ price: number; status: string; fetchedAt: string }> = {}) => ({ price: 1000, status: "active", fetchedAt: ago(60 * 60_000), ...over });

describe("recheckDecision — 다시 읽은 경우", () => {
  it("오름 → up (막는다)", () => {
    expect(recheckDecision(1000, cached(), { price: 1200, soldOut: false }, NOW)).toEqual({ kind: "up", price: 1200 });
    expect(BLOCKING).toContain("up");
  });
  it("내림 → down (진행)", () => {
    expect(recheckDecision(1000, cached(), { price: 800, soldOut: false }, NOW)).toEqual({ kind: "down", price: 800 });
    expect(BLOCKING).not.toContain("down");
  });
  it("같음 → ok", () => {
    expect(recheckDecision(1000, cached(), { price: 1000, soldOut: false }, NOW)).toEqual({ kind: "ok", price: 1000 });
  });
  it("1원(1엔) 오름도 up — 반올림 뒤 비교", () => {
    expect(recheckDecision(1000, cached(), { price: 1001, soldOut: false }, NOW).kind).toBe("up");
    expect(recheckDecision(1000, cached(), { price: 1000.4, soldOut: false }, NOW).kind).toBe("ok");
    expect(recheckDecision(1000, cached(), { price: 1000.5, soldOut: false }, NOW)).toEqual({ kind: "up", price: 1001 });
  });
  it("품절 → sold (가격이 같아도)", () => {
    expect(recheckDecision(1000, cached(), { price: 1000, soldOut: true }, NOW).kind).toBe("sold");
    expect(recheckDecision(1000, cached(), { price: 0, soldOut: true }, NOW).kind).toBe("sold");
  });
  it("가격 0·NaN 은 못 읽은 것으로 본다", () => {
    expect(recheckDecision(1000, cached(), { price: 0, soldOut: false }, NOW).kind).toBe("unverified");
    expect(recheckDecision(1000, cached(), { price: NaN, soldOut: false }, NOW).kind).toBe("unverified");
  });
});

describe("recheckDecision — 다시 못 읽은 경우(파싱 실패)", () => {
  it("마지막 확인이 15분 넘음 → unverified (막는다)", () => {
    expect(recheckDecision(1000, cached({ fetchedAt: ago(ORDER_FRESH_MS + 1) }), null, NOW).kind).toBe("unverified");
    expect(BLOCKING).toContain("unverified");
  });
  it("경계: 정확히 15분은 신선(DB 의 fetched_at < now()-15분 과 같은 규칙)", () => {
    expect(recheckDecision(1000, cached({ fetchedAt: ago(ORDER_FRESH_MS) }), null, NOW).kind).toBe("ok");
  });
  it("15분 안이면 DB 가격으로 비교한다", () => {
    expect(recheckDecision(1000, cached({ fetchedAt: ago(60_000), price: 1300 }), null, NOW)).toEqual({ kind: "up", price: 1300 });
    expect(recheckDecision(1000, cached({ fetchedAt: ago(60_000), price: 900 }), null, NOW)).toEqual({ kind: "down", price: 900 });
  });
  it("DB 에 품절로 적혀 있으면 sold", () => {
    expect(recheckDecision(1000, cached({ status: "sold", fetchedAt: ago(60_000) }), null, NOW).kind).toBe("sold");
  });
  it("fetched_at 이 깨졌으면 unverified", () => {
    expect(recheckDecision(1000, cached({ fetchedAt: "not a date" }), null, NOW).kind).toBe("unverified");
  });
  it("ORDER_FRESH_MS = 15분", () => expect(ORDER_FRESH_MS).toBe(15 * 60_000));
});

describe("recheckItems", () => {
  const row = (over: Partial<RecheckRow>): RecheckRow => ({ id: "a", source: "mercari", source_id: "m1", title: "T", price: 1000, currency: "JPY", status: "active", fetched_at: ago(60 * 60_000), ...over });
  const fakeAdmin = (fail = false) => {
    const writes: { id: string; patch: Record<string, unknown> }[] = [];
    const admin = { from: () => ({ update: (patch: Record<string, unknown>) => ({ eq: async (_c: string, id: string) => { writes.push({ id, patch }); return { error: fail ? { message: "x" } : null }; } }) }) };
    return { admin: admin as never, writes };
  };
  beforeEach(() => loadItem.mockReset());

  it("다시 읽은 값을 적고, 고객 화면 가격(seen)과 비교한다", async () => {
    loadItem.mockResolvedValueOnce({ price: 1500, soldOut: false }).mockResolvedValueOnce({ price: 700, soldOut: false });
    const { admin, writes } = fakeAdmin();
    const out = await recheckItems(admin, [row({ id: "a" }), row({ id: "b", source_id: "m2" })], { a: 1000, b: 1000 }, NOW);
    expect(out.map((c) => [c.id, c.kind, c.from, c.to])).toEqual([["a", "up", 1000, 1500], ["b", "down", 1000, 700]]);
    expect(writes).toEqual([
      { id: "a", patch: { price: 1500, status: "active", fetched_at: new Date(NOW).toISOString() } },
      { id: "b", patch: { price: 700, status: "active", fetched_at: new Date(NOW).toISOString() } },
    ]);
  });
  it("seen 이 없거나 이상하면 DB 가격과 비교한다", async () => {
    loadItem.mockResolvedValue({ price: 1000, soldOut: false });
    const { admin } = fakeAdmin();
    const out = await recheckItems(admin, [row({ id: "a" }), row({ id: "b" })], { b: "x" }, NOW);
    expect(out.map((c) => c.kind)).toEqual(["ok", "ok"]);
  });
  it("품절은 가격 없이도 status=sold 로 적는다", async () => {
    loadItem.mockResolvedValue({ price: 0, soldOut: true });
    const { admin, writes } = fakeAdmin();
    const out = await recheckItems(admin, [row({})], {}, NOW);
    expect(out[0].kind).toBe("sold");
    expect(writes[0].patch).toEqual({ status: "sold", fetched_at: new Date(NOW).toISOString() });
  });
  it("못 읽으면 적지 않는다 — 오래됐으면 unverified", async () => {
    loadItem.mockResolvedValue(null);
    const { admin, writes } = fakeAdmin();
    const out = await recheckItems(admin, [row({})], {}, NOW);
    expect(out[0].kind).toBe("unverified");
    expect(writes).toEqual([]);
  });
  it("지원 안 하는 마켓(야후옥션)은 부르지 않는다", async () => {
    const { admin } = fakeAdmin();
    const out = await recheckItems(admin, [row({ source: "yahoo_auction" })], {}, NOW);
    expect(loadItem).not.toHaveBeenCalled();
    expect(out[0].kind).toBe("unverified");
  });
  it("적기에 실패하면 throw(옛 가격으로 결제하지 않는다)", async () => {
    loadItem.mockResolvedValue({ price: 1000, soldOut: false });
    const { admin } = fakeAdmin(true);
    await expect(recheckItems(admin, [row({})], {}, NOW)).rejects.toThrow();
  });
});

describe("국경 간 직거래 국제배송비(서버 표)", () => {
  it("대행과 같은 값, 거래 통화 기준", () => {
    expect(directShippingFee("KRW")).toBe(PROXY_SHIPPING_ESTIMATE_KRW);
    expect(directShippingFee("JPY")).toBe(PROXY_SHIPPING_ESTIMATE_JPY);
    expect(directShippingFee("KRW")).toBe(8000);
    expect(directShippingFee("JPY")).toBe(900);
  });
  it("국경 간이 아니면 0", () => {
    expect(directShippingFee("KRW", false)).toBe(0);
    expect(directShippingFee("JPY", false)).toBe(0);
  });
});

describe("0035 SQL 이 코드 상수와 같다", () => {
  const sql = readFileSync("supabase/migrations/0035_order_freshness.sql", "utf8");
  it("신선도 15분", () => {
    expect(sql).toContain("interval '15 minutes'");
    expect(sql).not.toMatch(/fetched_at < now\(\) - interval '24 hours'/);
  });
  it("직거래 배송비 8000/900 을 DB 가 정하고 화면 값은 안 쓴다", () => {
    expect(sql).toContain(`case when v_cross then (case when v_l.currency = 'KRW' then ${PROXY_SHIPPING_ESTIMATE_KRW} else ${PROXY_SHIPPING_ESTIMATE_JPY} end) else 0 end`);
    expect(sql).not.toMatch(/coalesce\(p_intl_shipping_fee, 0\) else 0 end/);
  });
  it("대행 배송비도 같은 표", () => {
    expect(sql).toContain(`v_ship := case when v_cur = 'KRW' then ${PROXY_SHIPPING_ESTIMATE_KRW} else ${PROXY_SHIPPING_ESTIMATE_JPY} end`);
  });
});
