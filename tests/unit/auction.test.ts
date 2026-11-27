// U1·U2 경매 순수 계산 — SQL(0046 place_bid·auction_increment)과 같은 표·같은 판정인지 본다. DB 없음.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  AUCTION_RULES, amountOk, auctionErrorKey, endsAt, estimatedTotal, extendedEnd, increment, minBid, pollMs, proxyBid,
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
