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
    expect(r).toMatchObject({ status: "authorized", back: "/bids/b1" });   // M4: 결제 복귀 = 신청 상세
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

// ── M3~M5(0052) ──
import { settleWon } from "@/lib/market-bid.server";
import { MB_OP_SCOPE, mbOpsFor, adminMbError, mbAging } from "@/lib/market-bid-admin";
import { OPS_EVENT_TYPES, OPS_CAPABILITIES } from "@/lib/ops-bridge";
import { OPS_ROUTE_LIST } from "@/lib/ops-api";
import { notifHref } from "@/lib/notifications";

const sql52 = readFileSync("supabase/migrations/0052_market_bid_settle.sql", "utf8");

describe("M3 0052 정산·크론", () => {
  it("0052 가 만드는 알림 kind(market_bid_note·mb_<유찰/못 넣음/취소>)가 앱 목록·ko/ja 문구에 있다", () => {
    const kinds = [...sql52.matchAll(/market_bid_note\([^,]+, '([a-z_]+)'/g)].map((m) => m[1]).filter((k) => k !== "mb_").concat(["mb_lost", "mb_missed", "mb_cancelled"]);
    expect(kinds).toEqual(expect.arrayContaining(["mb_placed", "mb_outbid", "mb_hold", "mb_won", "mb_pay_needed", "mb_missed"]));
    for (const k of new Set(kinds)) {
      expect(NOTIF_KINDS as readonly string[], k).toContain(k);
      for (const l of ["ko", "ja"] as const) expect(t(l, `notif.${k}` as never)).not.toBe(`notif.${k}`);
    }
    expect(notifHref({ kind: "mb_won", ref_id: "b1", data: {} })).toBe("/bids/b1");
  });
  it("ops_outbox 종류 = OPS_EVENT_TYPES(SQL 과 코드가 같다), capability market_auction", () => {
    const m = sql52.match(/ops_outbox_type_check check \(type in \(([^)]+)\)\)/)!;
    const sqlTypes = [...m[1].matchAll(/'([a-z_.]+)'/g)].map((x) => x[1]).sort();
    expect(sqlTypes).toEqual([...OPS_EVENT_TYPES].sort());
    expect(OPS_CAPABILITIES).toContain("market_auction");
  });
  it("매입은 승인액 이하만(넘으면 보류), 메루카리 낙찰가 = 우리 마지막 입찰액, 해제는 확실할 때만", () => {
    expect(sql52).toContain("when (v_amt->>'total')::int > v_b.auth_krw then 'capture over auth'");
    expect(sql52).toContain("when p_final > v_b.cap_jpy then 'final over cap'");
    expect(sql52).toContain("p_final <> v_b.last_bid_jpy then 'final differs from our bid'");
    expect(sql52).toContain("if p_final_seen = v_b.last_bid_jpy then raise exception 'mb: looks won'");
    expect(sql52).toMatch(/elsif v_b\.placed_at is not null then\r?\n\s+raise exception 'mb: was placed'/);
    expect(sql52).toContain("ends_at <= now() + interval '30 minutes'");          // 마감 30분 전 미입찰 자동 취소
    expect(sql52).toContain("ends_at + interval '15 minutes' < now()");           // 결과 지연 → 보류
    expect(sql52).toMatch(/if v_b\.order_id is not null then\s+return/);          // 주문 전환 한 번만
  });
  it("주문 전환은 서버만, 조작은 운영자·서버만", () => {
    expect(sql52).toMatch(/revoke all on function market_bid_to_order\(uuid\) from public, anon, authenticated;/);
    expect(sql52).toMatch(/revoke all on function market_bid_capture_failed\(uuid, text\) from public, anon, authenticated;/);
    expect(sql52).toContain("select is_admin_user() or coalesce(auth.role(), '') = 'service_role'");
  });
  it("0052 운영자 오류마다 문구가 있다", () => {
    const raised = new Set([...sql52.matchAll(/raise exception 'mb: ([a-z ]+)/g)].map((m) => `mb: ${m[1].trim()}`));
    for (const r of raised) if (!["mb: not captured"].includes(r)) expect(adminMbError(r), r).not.toBe(r);
  });
});

describe("M5 운영 권한·조작", () => {
  it("입찰됨·밀림·보류·유찰 = ops, 낙찰 매입·승인 해제 강제(못 넣음·운영 취소) = money", () => {
    expect(MB_OP_SCOPE).toEqual({ placed: "ops", outbid: "ops", hold: "ops", lost: "ops", won: "money", missed: "money", cancel: "money" });
    for (const [op, s] of Object.entries(MB_OP_SCOPE)) expect(OPS_ROUTE_LIST).toContain(`POST /api/ops/market-bids/:id/${op} (${s})`);
    expect(OPS_ROUTE_LIST).toContain("GET /api/ops/market-bids (ops)");
    expect(OPS_ROUTE_LIST).toContain("POST /api/ops/market-bids/settings (money)");
  });
  it("상태별 조작 = DB 허용 전이", () => {
    expect(mbOpsFor("authorized", false)).toEqual(["placed", "hold", "missed", "cancel"]);
    expect(mbOpsFor("hold", true)).toEqual(["placed", "won", "lost"]);
    expect(mbOpsFor("hold", false)).toEqual(["placed", "missed", "cancel"]);
    expect(mbOpsFor("ordered", true)).toEqual([]);
  });
  it("지연 표시: 입찰 필요는 마감 2시간 전 warn·45분 전 late, 보류는 즉시 late", () => {
    const now = Date.parse("2026-11-28T00:00:00Z");
    expect(mbAging({ status: "authorized", ends_at: "2026-11-28T03:00:00Z" }, now)).toBeNull();
    expect(mbAging({ status: "authorized", ends_at: "2026-11-28T01:30:00Z" }, now)?.level).toBe("warn");
    expect(mbAging({ status: "authorized", ends_at: "2026-11-28T00:40:00Z" }, now)?.level).toBe("late");
    expect(mbAging({ status: "hold", ends_at: "2026-11-28T03:00:00Z" }, now)?.level).toBe("late");
  });
});

describe("M3 낙찰 → 매입 → 주문(settleWon)", () => {
  const auth = { id: "a1", bid_id: "b1", payment_intent_id: "pi_mb", amount_krw: 52300, status: "authorized", captured_krw: null };
  it("DB 매입액으로 매입한 뒤 주문 전환", async () => {
    const calls: Call[] = [];
    const admin = fakeAdmin({ market_bids: { id: "b1", status: "won", auth_id: "a1", capture_krw: 40000, order_id: null }, market_bid_auths: auth },
      { market_bid_auth_captured: { ...auth, status: "captured", captured_krw: 40000 }, market_bid_to_order: { order_id: "o1", code: "T000099" } }, calls);
    const r = await settleWon(fakeStripe({ id: "pi_mb", status: "requires_capture" }, calls), admin, "b1");
    expect(r).toEqual({ status: "ordered", orderId: "o1", orderCode: "T000099" });
    expect(calls.find((c) => c.name === "pi.capture")!.args).toEqual(["pi_mb", { amount_to_capture: 40000 }, { idempotencyKey: "mb_capture_b1" }]);
    expect(calls.map((c) => c.name).indexOf("rpc.market_bid_to_order")).toBeGreaterThan(calls.map((c) => c.name).indexOf("pi.capture"));
  });
  it("승인이 이미 취소된 PI 면 capture_failed, 주문을 만들지 않는다", async () => {
    const calls: Call[] = [];
    const stripe = fakeStripe({ id: "pi_mb", status: "canceled" }, calls);
    (stripe.paymentIntents as unknown as { capture: () => Promise<never> }).capture = () => Promise.reject(new Error("This PaymentIntent could not be captured"));
    const admin = fakeAdmin({ market_bids: { id: "b1", status: "won", auth_id: "a1", capture_krw: 40000, order_id: null }, market_bid_auths: auth }, { market_bid_capture_failed: {} }, calls);
    const r = await settleWon(stripe, admin, "b1");
    expect(r.status).toBe("capture_failed");
    expect(calls.some((c) => c.name === "rpc.market_bid_capture_failed")).toBe(true);
    expect(calls.some((c) => c.name === "rpc.market_bid_to_order")).toBe(false);
  });
  it("일시 오류(PI 가 아직 requires_capture)는 won 으로 두고 크론이 다시 한다", async () => {
    const calls: Call[] = [];
    const stripe = fakeStripe({ id: "pi_mb", status: "requires_capture" }, calls);
    (stripe.paymentIntents as unknown as { capture: () => Promise<never> }).capture = () => Promise.reject(new Error("timeout"));
    const admin = fakeAdmin({ market_bids: { id: "b1", status: "won", auth_id: "a1", capture_krw: 40000, order_id: null }, market_bid_auths: auth }, {}, calls);
    expect((await settleWon(stripe, admin, "b1")).status).toBe("pending");
    expect(calls.some((c) => c.name.startsWith("rpc."))).toBe(false);
  });
});

describe("M6 매입 실패 뒤 재결제(mbp, 0053)", () => {
  const paid = (meta: Record<string, string>, extra: Record<string, unknown> = {}) =>
    ({ id: "cs_test_mbp", status: "complete", payment_status: "paid", payment_intent: "pi_mbp", amount_total: 23595, metadata: meta, ...extra }) as unknown as Stripe.Checkout.Session;
  const withRefunds = (s: Stripe, calls: Call[], existing: unknown[] = []) => Object.assign(s, { refunds: {
    list: (...args: unknown[]) => { calls.push({ name: "refund.list", args }); return Promise.resolve({ data: existing }); },
    create: (...args: unknown[]) => { calls.push({ name: "refund.create", args }); return Promise.resolve({ id: "re_1" }); },
  } });
  it("결제 완료 → market_bid_repaid(세션·PI·금액) → paid, 환불 없음", async () => {
    const calls: Call[] = [];
    const r = await settleMarketBidSession(withRefunds(fakeStripe({}, calls), calls), fakeAdmin({}, { market_bid_repaid: { ok: true, order_id: "o1" } }, calls), paid({ app: APP_TAG, kind: "mbp", id: "b1" }));
    expect(r).toMatchObject({ kind: "mbp", status: "paid", back: "/bids/b1" });
    expect(calls.find((c) => c.name === "rpc.market_bid_repaid")?.args[0]).toEqual({ p_session: "cs_test_mbp", p_payment_intent: "pi_mbp", p_amount_krw: 23595 });
    expect(calls.some((c) => c.name === "refund.create")).toBe(false);
  });
  it("DB 가 받지 않은 결제(기한 지남 등)는 전액 환불, 이미 환불이 있으면 다시 안 보낸다", async () => {
    const calls: Call[] = [];
    const r = await settleMarketBidSession(withRefunds(fakeStripe({}, calls), calls), fakeAdmin({}, { market_bid_repaid: { ok: false, refund: true, reason: "closed" } }, calls), paid({ app: APP_TAG, kind: "mbp", id: "b1" }));
    expect(r).toMatchObject({ status: "refunded", code: "CLOSED" });
    const cr = calls.find((c) => c.name === "refund.create");
    expect(cr?.args[0]).toMatchObject({ payment_intent: "pi_mbp" });
    expect(cr?.args[1]).toEqual({ idempotencyKey: "mbp_refund_pi_mbp" });
    const calls2: Call[] = [];
    await settleMarketBidSession(withRefunds(fakeStripe({}, calls2), calls2, [{ id: "re_0" }]), fakeAdmin({}, { market_bid_repaid: { ok: false, refund: true, reason: "closed" } }, calls2), paid({ app: APP_TAG, kind: "mbp", id: "b1" }));
    expect(calls2.some((c) => c.name === "refund.create")).toBe(false);
  });
  it("결제 전 세션·다른 앱은 아무것도 안 한다", async () => {
    const calls: Call[] = [];
    expect(await settleMarketBidSession(fakeStripe({}, calls), fakeAdmin({}, {}, calls), paid({ app: APP_TAG, kind: "mbp", id: "b1" }, { payment_status: "unpaid", status: "open" }))).toMatchObject({ status: "unpaid" });
    expect(await settleMarketBidSession(fakeStripe({}, calls), fakeAdmin({}, {}, calls), paid({ app: "airship", kind: "mbp", id: "b1" }))).toBeNull();
    expect(calls).toEqual([]);
  });
});