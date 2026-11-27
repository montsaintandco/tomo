// U1·U2 경매 순수 계산 — SQL(0046 place_bid·auction_increment)과 같은 표·같은 판정인지 본다. DB 없음.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  AUCTION_RULES, amountOk, auctionErrorKey, endsAt, estimatedTotal, extendedEnd, increment, minBid, pollMs, proxyBid,
  cardAuctionInfo, clockSkew, countdownText, needsBigConfirm, payNeededCount, pickAuction, sellerCanRelist, sellerChoiceCount,
  splitMs, timeLeftShort, viewerPhase, type AuctionState,
} from "@/lib/auction";
import { NOTIF_KINDS } from "@/lib/notifications";
import { I18N_KEYS, t } from "@/lib/i18n";

const sql46 = readFileSync("supabase/migrations/0046_auctions.sql", "utf8");
const sql47 = readFileSync("supabase/migrations/0047_auction_settle.sql", "utf8");

describe("입찰 단위표 = SQL 기본값", () => {
  it("0046 auction_settings.rules 와 AUCTION_RULES 가 같다", () => {
    const m = /-- @auction-rules\s*\n\s*'(\{.*\})'/.exec(sql46);
    expect(m, "0046 에 @auction-rules 줄이 있어야 한다").not.toBeNull();
    expect(JSON.parse(m![1])).toEqual(JSON.parse(JSON.stringify(AUCTION_RULES)));
  });
  it("설계표 경계값", () => {
    expect([999, 1000, 4999, 5000, 9999, 10000, 49999, 50000].map((p) => increment("JPY", p))).toEqual([10, 100, 100, 250, 250, 500, 500, 1000]);
    expect([9999, 10000, 49999, 50000, 99999, 100000, 499999, 500000].map((p) => increment("KRW", p))).toEqual([100, 1000, 1000, 2000, 2000, 5000, 5000, 10000]);
  });
  it("금액 단위·시작가 하한·상한", () => {
    expect(amountOk("KRW", 10000, true)).toBe(true);
    expect(amountOk("KRW", 10050)).toBe(false);
    expect(amountOk("KRW", 900, true)).toBe(false);
    expect(amountOk("JPY", 100, true)).toBe(true);
    expect(amountOk("JPY", 105)).toBe(false);
    expect(amountOk("JPY", 10_000_010)).toBe(false);
    expect(minBid("KRW", 10000, false, 10000)).toBe(10000);
    expect(minBid("KRW", 10000, true, 10000)).toBe(11000);
  });
});

describe("상한가 입찰 판정(설계 시험표 3~7번과 운영 DB 리허설 같은 수열)", () => {
  it("bob 30000 → center 20000 → 30000(같은 금액) → 31000 → bob 40000", () => {
    let s = { start: 10000, current: 10000, leader: null as string | null, leaderMax: 0 };
    const step = (who: string, amt: number) => {
      const o = proxyBid("KRW", s, who, amt);
      if ("error" in o) throw new Error(o.error);
      s = { ...s, current: o.price, leader: o.leader, leaderMax: o.leaderMax };
      return [o.leader, o.price];
    };
    expect(step("bob", 30000)).toEqual(["bob", 10000]);
    expect(step("ctr", 20000)).toEqual(["bob", 21000]);
    expect(step("ctr", 30000)).toEqual(["bob", 30000]);   // 같은 금액이면 먼저 넣은 사람
    expect(step("ctr", 31000)).toEqual(["ctr", 31000]);
    expect(step("bob", 40000)).toEqual(["bob", 32000]);
    expect(step("bob", 45000)).toEqual(["bob", 32000]);   // 1등의 상한 올리기는 현재가 그대로
    expect(proxyBid("KRW", s, "ctr", 32500)).toEqual({ error: "bid too low" });
    expect(proxyBid("KRW", s, "ctr", 33050)).toEqual({ error: "invalid amount" });
    expect(proxyBid("KRW", s, "bob", 45000)).toEqual({ error: "bid too low" });
  });
  it("SQL 도 같은 비교(> 면 역전, 아니면 1등 유지)를 쓴다", () => {
    expect(sql46).toContain("if p_amount > v_lead_max then");
    expect(sql46).toContain("least(p_amount, v_lead_max + auction_increment(v_a.currency, v_lead_max))");
    expect(sql46).toContain("least(v_lead_max, p_amount + auction_increment(v_a.currency, p_amount))");
  });
});

describe("시각", () => {
  it("마감은 10분 단위 올림", () => {
    expect(endsAt(new Date("2026-11-27T01:03:20Z"), 1).toISOString()).toBe("2026-11-28T01:10:00.000Z");
    expect(endsAt(new Date("2026-11-27T01:10:00Z"), 3).toISOString()).toBe("2026-11-30T01:10:00.000Z");
  });
  it("마감 5분 안에 현재가가 오르면 + 5분", () => {
    const now = Date.parse("2026-11-27T01:00:00Z");
    expect(extendedEnd(now + 3 * 60_000, now, true)).toBe(now + 5 * 60_000);
    expect(extendedEnd(now + 3 * 60_000, now, false)).toBeNull();
    expect(extendedEnd(now + 6 * 60_000, now, true)).toBeNull();
  });
  it("폴링 5초, 마감 5분 전부터 2초, 끝나면 멈춤", () => {
    const now = "2026-11-27T01:00:00Z";
    expect(pollMs({ status: "live", server_now: now, ends_at: "2026-11-27T02:00:00Z" })).toBe(5000);
    expect(pollMs({ status: "live", server_now: now, ends_at: "2026-11-27T01:04:00Z" })).toBe(2000);
    expect(pollMs({ status: "awaiting_payment", server_now: now, ends_at: now })).toBeNull();
  });
  it("예상 결제액 = 입찰가 + 국경 간 국제배송비", () => {
    expect(estimatedTotal("KRW", 30000, true)).toBe(38000);
    expect(estimatedTotal("JPY", 3000, true)).toBe(3900);
    expect(estimatedTotal("KRW", 30000, false)).toBe(30000);
  });
});

describe("화면 표시(U3·U4)", () => {
  const H = 3_600_000;
  it("카운트다운 단위: 일·시·분초, 끝나면 마감", () => {
    expect(splitMs(90_061_000)).toEqual({ d: 1, h: 1, m: 1, s: 1 });
    expect(splitMs(-5)).toEqual({ d: 0, h: 0, m: 0, s: 0 });
    expect(countdownText("ko", 2 * 24 * H + 3 * H + 59_000)).toBe("2일 3시간");
    expect(countdownText("ko", 3 * H + 5 * 60_000)).toBe("3시간 5분");
    expect(countdownText("ko", 4 * 60_000 + 5_000)).toBe("4분 05초");
    expect(countdownText("ja", 4 * 60_000 + 5_000)).toBe("4分05秒");
    expect(countdownText("ko", 0)).toBe("마감");
  });
  it("카드 남은 시간은 한 단위, 1분 미만은 1분", () => {
    expect(timeLeftShort("ko", 50 * H)).toBe("2일 남음");
    expect(timeLeftShort("ko", 5 * H + 1)).toBe("5시간 남음");
    expect(timeLeftShort("ja", 30_000)).toBe("残り1分");
    expect(timeLeftShort("ko", -1)).toBe("마감");
  });
  it("카드: 1시간 이하만 강조, 끝난 경매는 live 아님", () => {
    const now = Date.parse("2026-11-27T01:00:00Z");
    const a = { status: "live" as const, bid_count: 3, ends_at: "2026-11-27T01:30:00Z", created_at: "" };
    expect(cardAuctionInfo(a, now)).toMatchObject({ live: true, soon: true, bids: 3 });
    expect(cardAuctionInfo({ ...a, ends_at: "2026-11-27T03:00:00Z" }, now).soon).toBe(false);
    expect(cardAuctionInfo({ ...a, status: "awaiting_payment" }, now)).toMatchObject({ live: false, soon: false });
    expect(cardAuctionInfo({ ...a, ends_at: "2026-11-27T00:59:00Z" }, now).live).toBe(false); // 크론 전이라도 시간이 지나면 끝난 것으로
  });
  it("다시 경매한 상품은 열린 경매, 없으면 가장 최근 경매를 카드에", () => {
    const old = { status: "unsold", created_at: "2026-11-01T00:00:00Z" };
    const cur = { status: "live", created_at: "2026-11-02T00:00:00Z" };
    expect(pickAuction([old, cur])).toBe(cur);
    expect(pickAuction([old, { ...old, status: "cancelled", created_at: "2026-11-03T00:00:00Z" }])?.status).toBe("cancelled");
    expect(pickAuction([])).toBeNull();
  });
  it("카운트다운은 서버 시각 기준(내 시계가 2초 빠르면 -2초)", () => {
    expect(clockSkew("2026-11-27T01:00:00.000Z", Date.parse("2026-11-27T01:00:02.000Z"))).toBe(-2000);
  });
  it("보는 사람 상태 판정", () => {
    const v: AuctionState["viewer"] = { signed_in: true, is_seller: false, bidder_no: 1, my_max: 30000, leading: true, won: false, can_pay: false, tx_id: null, bid_banned_until: null };
    const s = (status: AuctionState["status"], viewer: Partial<typeof v>) => viewerPhase({ status, viewer: { ...v, ...viewer } });
    expect(s("live", {})).toBe("leading");
    expect(s("live", { leading: false })).toBe("outbid");
    expect(s("live", { leading: false, my_max: null })).toBe("none");
    expect(s("live", { is_seller: true })).toBe("seller");
    expect(s("awaiting_payment", { leading: false, won: true })).toBe("won");
    expect(s("awaiting_payment", { leading: false })).toBe("lost");
    expect(s("unsold", { my_max: null, leading: false })).toBe("ended");
  });
  it("판매자 다시 경매·전환 조건 = 0047 auction_relistable", () => {
    expect(["unsold", "unpaid", "cancelled"].every((x) => sellerCanRelist(x as AuctionState["status"], "active"))).toBe(true);
    expect(sellerCanRelist("paid", "active")).toBe(true);    // 결제 뒤 환불로 판매중 복귀
    expect(sellerCanRelist("paid", "sold")).toBe(false);
    expect(sellerCanRelist("live", "active")).toBe(false);
    expect(sql47).toMatch(/function auction_relistable/);
  });
  it("10배 초과는 한 번 더 확인", () => {
    expect(needsBigConfirm(100001, 10000)).toBe(true);
    expect(needsBigConfirm(100000, 10000)).toBe(false);
  });
  it("마이페이지 할 일 건수", () => {
    const now = Date.parse("2026-11-27T01:00:00Z");
    expect(payNeededCount([
      { won: true, status: "awaiting_payment", pay_due_at: "2026-11-28T01:00:00Z" },
      { won: true, status: "awaiting_payment", pay_due_at: "2026-11-27T00:00:00Z" }, // 기한 지남
      { won: true, status: "paid", pay_due_at: "2026-11-28T01:00:00Z" },
      { won: false, status: "awaiting_payment", pay_due_at: "2026-11-28T01:00:00Z" },
    ], now)).toBe(1);
    expect(sellerChoiceCount([
      { listing_id: "a", status: "live", listings: { sale_type: "auction" } },      // 다시 경매한 것(최신)
      { listing_id: "a", status: "unsold", listings: { sale_type: "auction" } },    // 옛 행 — 세지 않는다
      { listing_id: "b", status: "unpaid", listings: { sale_type: "auction" } },
      { listing_id: "c", status: "unsold", listings: { sale_type: "fixed" } },      // 일반 전환함
      { listing_id: "d", status: "cancelled", listings: { sale_type: "auction" } },
      { listing_id: "e", status: "paid", listings: { sale_type: "auction", status: "active" } },  // 결제 뒤 운영자 취소로 돌아옴(0051)
      { listing_id: "f", status: "paid", listings: { sale_type: "auction", status: "sold" } },    // 정상 판매
    ])).toBe(2);
  });
  it("화면 문구 ko/ja 가 다르다(누락·복사 없음)", () => {
    for (const k of I18N_KEYS.filter((x) => x.startsWith("auction."))) expect(t("ko", k), k).not.toBe(t("ja", k));
  });
});

describe("알림·오류 문구", () => {
  it("0046·0047 이 만드는 kind 는 앱이 안다(문구 ko/ja 다름)", () => {
    const kinds = new Set([...(sql46 + sql47).matchAll(/auction_notify\([^,]+,\s*'(auction_[a-z_]+)'/g)].map((m) => m[1]));
    expect(kinds.size).toBeGreaterThanOrEqual(10);
    for (const k of kinds) {
      expect(NOTIF_KINDS as readonly string[], k).toContain(k);
      expect(I18N_KEYS, k).toContain(`notif.${k}`);
    }
  });
  it("DB 오류 메시지마다 사용자 문구가 있다", () => {
    const raised = [...(sql46 + sql47).matchAll(/raise exception '([a-z ]+)'/g)].map((m) => m[1]);
    const native = new Set(["invalid request id", "listing not found", "invalid shipping fee", "cannot buy own listing", "listing is shipping only", "not active", "too soon"]); // start_transaction·bump_listing 기존 문구(기존 화면이 처리)
    for (const msg of new Set(raised.filter((m) => !native.has(m)))) {
      const k = auctionErrorKey(msg);
      expect(k, msg).not.toBe("auction.err.generic");
      expect(t("ko", k)).not.toBe(t("ja", k));
    }
  });
});
