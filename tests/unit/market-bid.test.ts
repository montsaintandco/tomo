// 해외 마켓 경매 입찰 대행 M0~M2(docs/aaa/15). DB 없음: SQL 파일 글자·순수 계산·Stripe/DB 모의 객체로 본다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { marketBidAmount, minCapJpy, bidFacts, MB_ERRORS, mbErrorKey } from "@/lib/market-bid";
import { proxyOrderTotal } from "@/lib/fees";
import { mercariAuctionInfo } from "@/lib/market/mercari";
import { settleMarketBidSession, captureAuth, releaseAuth } from "@/lib/market-bid.server";
import { APP_TAG, createSession } from "@/lib/stripe";
import { NOTIF_KINDS } from "@/lib/notifications";
import { t } from "@/lib/i18n";
import type { MarketItemDetail } from "@/lib/market/types";

const sql49 = readFileSync("supabase/migrations/0049_auction_pay_expire_notify.sql", "utf8");
const sql50 = readFileSync("supabase/migrations/0050_market_bids.sql", "utf8");

describe("결제액 계산 = 대행 주문 규칙", () => {
  it("상한가 기준 금액이 장바구니 주문(proxyOrderTotal)과 같다", () => {
    for (const [cap, ship, rate] of [[5000, 0, 8.8615], [30000, 0, 9.1], [12345, 700, 8.7], [100, 0, 9]] as const) {
      const a = marketBidAmount(cap, ship, rate);
      const p = proxyOrderTotal([{ price: cap + ship, currency: "JPY" }], "KRW", rate);
      expect([a.subtotal, a.intl_shipping, a.customs, a.total]).toEqual([p.subtotal, p.intlShipping, p.customs, p.total]);
    }
    expect(marketBidAmount(5000, 0, 9, 300).fee).toBe(2700);
  });
  it("0050 market_bid_amount 가 같은 식(8,000원·proxy_customs·round)이다", () => {
    expect(sql50).toContain("round((p_price_jpy + p_ship_jpy) * p_rate)::int sub, 8000 ship");
    expect(sql50).toContain("proxy_customs(sub, ship, 'KRW')");
  });
  it("최소 상한가: 입찰 0건은 시작가, 있으면 +100엔(SQL 과 같다)", () => {
    expect(minCapJpy(3000, 0)).toBe(3000);
    expect(minCapJpy(3000, 2)).toBe(3100);
    expect(sql50).toContain("v_min := case when p_bids > 0 then p_seen_price + 100 else p_seen_price end;");
  });
  it("설정 기본값 = Ren 확정값(2026-11-27)", () => {
    for (const s of ["accepting boolean not null default false", "sources text[] not null default '{mercari}'", "cap_max_jpy int not null default 30000",
      "max_open int not null default 5", "max_open_per_user int not null default 1", "daily_cap_jpy int not null default 100000",
      "min_lead_minutes int not null default 180", "max_lead_hours int not null default 96", "fee_jpy int not null default 0",
      "auth_margin_hours int not null default 12", "pending_minutes int not null default 45"]) expect(sql50).toContain(s);
    expect(sql50).toContain("order_code('MB', nextval('market_bid_code_seq'))");
  });
  it("신청 함수는 service_role 만 부른다", () => {
    expect(sql50).toMatch(/revoke all on function request_market_bid\([^)]*\) from public, anon, authenticated;/);
    expect(sql50).toMatch(/revoke all on function market_bid_authorized\([^)]*\) from public, anon, authenticated;/);
  });
});

describe("M0 메루카리 경매 정보", () => {
  // 2026-11-27 실측 응답(items/get include_auction=true)
  const ongoing = { id: "112395549", start_time: 1795762987, expected_end_time: 1795863960, total_bids: 2, initial_price: 2500, highest_bid: 2600, state: "STATE_ONGOING", auction_type: "AUCTION_TYPE_NORMAL" };
  const noBid = { id: "112291784", start_time: 1795670171, expected_end_time: 1795866093, total_bids: 0, initial_price: 3500, highest_bid: 3500, state: "STATE_NO_BID" };
  it("현재가·입찰 수·마감·상태를 읽는다", () => {
    expect(mercariAuctionInfo(ongoing, true)).toEqual({ price: 2600, bids: 2, startPrice: 2500, endsAt: new Date(1795863960000).toISOString(), state: "STATE_ONGOING", open: true });
    expect(mercariAuctionInfo(noBid, true)).toMatchObject({ price: 3500, bids: 0, open: true });
    expect(mercariAuctionInfo(ongoing, false)?.open).toBe(false);
    expect(mercariAuctionInfo({ ...ongoing, state: "STATE_SOLD" }, true)?.open).toBe(false);
    expect(mercariAuctionInfo(null, true)).toBeUndefined();
  });
  const detail = (over: Partial<MarketItemDetail>) => ({ auction: true, soldOut: false, shippingIncluded: true, auctionInfo: mercariAuctionInfo(ongoing, true), ...over }) as MarketItemDetail;
  it("송료: 출품자 부담이면 0, 착불·미정이면 null(DB 가 거절)", () => {
    expect(bidFacts("mercari", detail({}))).toEqual({ price: 2600, bids: 2, endsAt: new Date(1795863960000).toISOString(), shipJpy: 0 });
    expect(bidFacts("mercari", detail({ shippingIncluded: false }))).toMatchObject({ shipJpy: null });
    expect(bidFacts("mercari", detail({ shippingIncluded: undefined }))).toMatchObject({ shipJpy: null });
  });
  it("경매 아님·끝남·야후·못 읽음은 오류 키", () => {
    expect(bidFacts("mercari", detail({ auction: undefined, auctionInfo: undefined }))).toEqual({ error: "mb.err.notAuction" });
    expect(bidFacts("mercari", detail({ soldOut: true }))).toEqual({ error: "mb.err.ended" });
    expect(bidFacts("yahoo_auction", detail({}))).toEqual({ error: "mb.err.source" });
    expect(bidFacts("mercari", null)).toEqual({ error: "mb.err.changed" });
  });
});

describe("오류·알림 문구", () => {
  it("0050 가 던지는 고객용 오류마다 문구가 있다", () => {
    const raised = [...sql50.matchAll(/raise exception 'mb: ([a-z ]+)'/g)].map((m) => `mb: ${m[1]}`);
    const internal = ["mb: bad request", "mb: item", "mb: not pending", "mb: amount mismatch", "mb: not found", "mb: auth not found", "mb: auth not capturable", "mb: capture amount"];
    for (const r of new Set(raised)) if (!internal.includes(r)) expect(MB_ERRORS.map(([k]) => k), r).toContain(r);
    for (const [, key] of MB_ERRORS) expect(t("ja", key)).not.toBe(key);
    expect(mbErrorKey("mb: daily limit")).toBe("mb.err.daily");
    expect(mbErrorKey("weird")).toBe("mb.err.failed");
  });
  it("DB 가 만드는 알림 kind(0049·0050)가 앱 목록·문구에 있다", () => {
    const kinds = [...(sql49 + sql50).matchAll(/notify\([^,]+, '([a-z_]+)'/g)].map((m) => m[1]).filter((k) => k !== "tx_cancelled");
    expect(kinds.length).toBeGreaterThanOrEqual(4);
    for (const k of kinds) {
      expect(NOTIF_KINDS as readonly string[], k).toContain(k);
      expect(t("ko", `notif.${k}` as never)).not.toBe(`notif.${k}`);
    }
  });
  it("0049 는 cancelled 줄만 조건으로 감싸고 정의 전체를 다시 쓰지 않는다", () => {
    expect(sql49).toContain("execute replace(v_def, v_old, v_new)");
    expect(sql49).not.toMatch(/create or replace function public\.notify_transaction/i);
  });
});

// ── Stripe·DB 모의 객체 ──
type Call = { name: string; args: unknown[] };
function fakeStripe(pi: Partial<Stripe.PaymentIntent>, calls: Call[]) {
  const rec = (name: string, ret: () => unknown) => (...args: unknown[]) => { calls.push({ name, args }); return Promise.resolve(ret()); };
  return {
    paymentIntents: {
      retrieve: rec("pi.retrieve", () => pi),
      cancel: rec("pi.cancel", () => ({ ...pi, status: "canceled" })),
      capture: rec("pi.capture", () => ({ ...pi, status: "succeeded", amount_received: (calls.at(-1)!.args[1] as { amount_to_capture: number }).amount_to_capture })),
    },
    checkout: { sessions: { create: rec("cs.create", () => ({ id: "cs_test_new", url: "https://checkout.stripe.com/x" })), expire: rec("cs.expire", () => ({})), retrieve: rec("cs.retrieve", () => null) } },
  } as unknown as Stripe;
}
function fakeAdmin(rows: Record<string, unknown>, rpc: Record<string, unknown>, calls: Call[]) {
  const q = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit"]) chain[m] = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: rows[table] ?? null, error: null });
    return chain;
  };
  return {
    from: q,
    rpc: (name: string, args: unknown) => { calls.push({ name: `rpc.${name}`, args: [args] }); return Promise.resolve({ data: rpc[name] ?? null, error: null }); },
  } as unknown as SupabaseClient;
}

describe("M2 승인 확정·해제·매입", () => {
  const session = (meta: Record<string, string>) => ({ id: "cs_test_mb", status: "complete", payment_status: "unpaid", payment_intent: "pi_mb", metadata: meta }) as unknown as Stripe.Checkout.Session;
  const intent = { id: "pi_mb", status: "requires_capture", amount: 52300, latest_charge: { payment_method_details: { card: { capture_before: 1796000000 } } } } as unknown as Stripe.PaymentIntent;
  const bidRow = { source: "mercari", source_id: "m1" };

  it("다른 앱·다른 종류 세션은 건드리지 않는다", async () => {
    const calls: Call[] = [];
    expect(await settleMarketBidSession(fakeStripe(intent, calls), fakeAdmin({}, {}, calls), session({ app: "airship", kind: "mb", id: "b1" }))).toBeNull();
    expect(await settleMarketBidSession(fakeStripe(intent, calls), fakeAdmin({}, {}, calls), session({ app: APP_TAG, kind: "po", id: "b1" }))).toBeNull();
    expect(calls).toEqual([]);
  });
  it("requires_capture → capture_before 를 넘겨 승인 확정", async () => {
    const calls: Call[] = [];
    const r = await settleMarketBidSession(fakeStripe(intent, calls), fakeAdmin({ market_bids: bidRow }, { market_bid_authorized: { ok: true } }, calls), session({ app: APP_TAG, kind: "mb", id: "b1" }));
    expect(r).toMatchObject({ status: "authorized", back: "/global/mercari/m1" });
    expect(calls.find((c) => c.name === "rpc.market_bid_authorized")!.args[0]).toEqual({
      p_session: "cs_test_mb", p_payment_intent: "pi_mb", p_amount_krw: 52300, p_capture_before: new Date(1796000000 * 1000).toISOString(),
    });
    expect(calls.some((c) => c.name === "pi.cancel")).toBe(false);
  });
  it("DB 가 거절하면(만료된 신청 등) 그 승인을 멱등 키로 해제한다", async () => {
    const calls: Call[] = [];
    const admin = fakeAdmin({ market_bids: bidRow, market_bid_auths: { id: "a1", bid_id: "b1", payment_intent_id: "pi_mb", amount_krw: 52300, status: "releasing" } },
      { market_bid_authorized: { ok: false, reason: "bid expired", release_auth_id: "a1" }, market_bid_auth_released: { id: "a1", status: "released" } }, calls);
    const r = await settleMarketBidSession(fakeStripe(intent, calls), admin, session({ app: APP_TAG, kind: "mb", id: "b1" }));
    expect(r).toMatchObject({ status: "released", code: "BID_EXPIRED" });
    const c = calls.find((x) => x.name === "pi.cancel")!;
    expect(c.args[0]).toBe("pi_mb");
    expect(c.args[2]).toEqual({ idempotencyKey: "mb_cancel_a1" });
    expect(calls.some((x) => x.name === "rpc.market_bid_auth_released")).toBe(true);
  });
  it("requires_capture 가 아니면 확정하지 않는다", async () => {
    const calls: Call[] = [];
    const r = await settleMarketBidSession(fakeStripe({ ...intent, status: "succeeded" }, calls), fakeAdmin({ market_bids: bidRow }, {}, calls), session({ app: APP_TAG, kind: "mb", id: "b1" }));
    expect(r).toMatchObject({ status: "unpaid", code: "PI_succeeded" });
    expect(calls.some((x) => x.name.startsWith("rpc."))).toBe(false);
  });
  it("매입: 승인액 이하만, 멱등 키 mb_capture_<신청 id>, 기록은 Stripe 가 받은 금액", async () => {
    const calls: Call[] = [];
    const auth = { id: "a1", bid_id: "b1", payment_intent_id: "pi_mb", amount_krw: 52300, status: "authorized", captured_krw: null };
    const admin = fakeAdmin({ market_bid_auths: auth }, { market_bid_auth_captured: { ...auth, status: "captured", captured_krw: 40000 } }, calls);
    await expect(captureAuth(fakeStripe(intent, calls), admin, "a1", 52301)).rejects.toThrow(/capture amount/);
    await captureAuth(fakeStripe(intent, calls), admin, "a1", 40000);
    const c = calls.find((x) => x.name === "pi.capture")!;
    expect(c.args).toEqual(["pi_mb", { amount_to_capture: 40000 }, { idempotencyKey: "mb_capture_b1" }]);
    expect(calls.find((x) => x.name === "rpc.market_bid_auth_captured")!.args[0]).toEqual({ p_auth: "a1", p_captured_krw: 40000 });
  });
  it("해제는 releasing 행만 Stripe 를 부른다", async () => {
    const calls: Call[] = [];
    await expect(releaseAuth(fakeStripe(intent, calls), fakeAdmin({ market_bid_auths: { id: "a1", status: "authorized" } }, {}, calls), "a1")).rejects.toThrow(/not releasing/);
    expect(calls.some((x) => x.name === "pi.cancel")).toBe(false);
  });
  it("승인만 결제창: capture_method manual·카드만·metadata.app/kind", async () => {
    const calls: Call[] = [];
    await createSession(fakeStripe(intent, calls), { kind: "mb", id: "b1", amount: 52300, base: 52300, cur: "KRW", name: "MB", method: "kakao_pay", lang: "ko", origin: "https://x", back: "/", manual: true });
    const p = calls.find((c) => c.name === "cs.create")!.args[0] as Stripe.Checkout.SessionCreateParams & { allowed_payment_method_types: string[] };
    expect(p.payment_intent_data).toMatchObject({ capture_method: "manual", metadata: { app: APP_TAG, kind: "mb", id: "b1" } });
    expect(p.allowed_payment_method_types).toEqual(["card"]);
    await createSession(fakeStripe(intent, calls), { kind: "po", id: "o1", amount: 1000, base: 1000, cur: "KRW", name: "PO", method: "card", lang: "ko", origin: "https://x", back: "/" });
    const q = calls.filter((c) => c.name === "cs.create")[1].args[0] as Stripe.Checkout.SessionCreateParams;
    expect(q.payment_intent_data).not.toHaveProperty("capture_method");   // 기존 일반 결제는 그대로(즉시 청구)
  });
});
