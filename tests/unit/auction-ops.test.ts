import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { matchOps } from "../../lib/ops-api";
import { OPS_CAPABILITIES, OPS_EVENT_TYPES } from "../../lib/ops-bridge";
import { auctionAging, adminAuctionError, flagText, FLAG_LABEL, isAuctionTab } from "../../lib/auction-admin";
import { auctionErrorKey } from "../../lib/auction";

// U5 경매 운영(0048) — 경로 scope, 능력·이벤트 목록이 DB 제약과 같은지, 지연 표시, 오류 문구
const id = "11111111-2222-3333-4444-555555555555";
const sql = readFileSync("supabase/migrations/0048_auction_ops.sql", "utf8");

describe("운영 API 경매 경로", () => {
  it("조회·조작 모두 ops(돈이 안 움직인다)", () => {
    for (const [m, segs] of [
      ["GET", ["auctions"]], ["GET", ["auctions", id]],
      ["POST", ["auctions", id, "close"]], ["POST", ["auctions", id, "void_bid"]], ["POST", ["auctions", id, "clear_strike"]],
    ] as const) expect(matchOps(m, [...segs])?.route.need, segs.join("/")).toBe("ops");
    expect(matchOps("GET", ["auctions", id, "close"])).toBeNull();
    expect(matchOps("POST", ["auctions", id, "end"])).toBeNull();
  });
  it("capability auction, 이벤트 4종이 outbox 제약에 있다", () => {
    expect(OPS_CAPABILITIES).toContain("auction");
    for (const t of ["auction.ended", "auction.unpaid", "auction.cancelled", "auction.flagged"]) {
      expect(OPS_EVENT_TYPES as readonly string[]).toContain(t);
      expect(sql).toContain(`'${t}'`);
    }
    const check = sql.match(/ops_outbox_type_check check \(type in \(([\s\S]*?)\)\);/)![1];
    const inDb = [...check.matchAll(/'([a-z_.]+)'/g)].map((x) => x[1]).sort();
    expect([...OPS_EVENT_TYPES]).toEqual(expect.arrayContaining(inDb));   // 최신 전체 목록 대조는 마지막 제약 파일(0052, market-bid.test)
  });
  it("의심 신호 이름이 DB 와 같다", () => {
    const sigs = [...sql.matchAll(/v_s := v_s \|\| '([a-z_]+)'::text/g)].map((x) => x[1]).sort();
    expect(sigs).toEqual(Object.keys(FLAG_LABEL).sort());
    expect(flagText("unknown_x")).toBe("unknown_x");
  });
});

describe("경매 지연 표시", () => {
  const now = Date.parse("2026-11-27T12:00:00Z");
  const iso = (ms: number) => new Date(now + ms).toISOString();
  const H = 36e5;
  it("진행 중: 마감 5분 지났는데 live 면 지연", () => {
    expect(auctionAging({ status: "live", ends_at: iso(-6 * 60e3), pay_due_at: null }, now)?.level).toBe("late");
    expect(auctionAging({ status: "live", ends_at: iso(-4 * 60e3), pay_due_at: null }, now)).toBeNull();
  });
  it("결제 대기: 12시간 이내 주의, 기한 + 50분 지나면 지연", () => {
    expect(auctionAging({ status: "awaiting_payment", ends_at: iso(-40 * H), pay_due_at: iso(13 * H) }, now)).toBeNull();
    expect(auctionAging({ status: "awaiting_payment", ends_at: iso(-40 * H), pay_due_at: iso(5 * H) }, now)).toEqual({ level: "warn", text: "결제 기한 5시간 남음" });
    expect(auctionAging({ status: "awaiting_payment", ends_at: iso(-49 * H), pay_due_at: iso(-30 * 60e3) }, now)?.level).toBe("warn");
    expect(auctionAging({ status: "awaiting_payment", ends_at: iso(-49 * H), pay_due_at: iso(-51 * 60e3) }, now)?.level).toBe("late");
  });
  it("미결제 뒤 판매자 선택 대기: 주의, 3일 넘으면 지연. 고른 뒤는 없음", () => {
    expect(auctionAging({ status: "unpaid", ends_at: iso(-50 * H), pay_due_at: iso(-H), seller_choice_pending: true }, now)?.level).toBe("warn");
    expect(auctionAging({ status: "unpaid", ends_at: iso(-200 * H), pay_due_at: iso(-80 * H), seller_choice_pending: true }, now)?.level).toBe("late");
    expect(auctionAging({ status: "unpaid", ends_at: iso(-200 * H), pay_due_at: iso(-80 * H), seller_choice_pending: false }, now)).toBeNull();
    expect(auctionAging({ status: "paid", ends_at: iso(-200 * H), pay_due_at: iso(-80 * H) }, now)).toBeNull();
  });
});

describe("오류 문구", () => {
  it("운영 거절은 한국어, 모르는 문구는 그대로", () => {
    expect(adminAuctionError("auction live: use force close")).toContain("강제 종료");
    expect(adminAuctionError("seller has live auctions")).toContain("강제 종료");
    expect(adminAuctionError("note required")).toBe("메모를 적어 주세요");
    expect(adminAuctionError("weird")).toBe("weird");
  });
  it("무효 처리된 입찰자의 재입찰은 전용 키", () => {
    expect(auctionErrorKey("bid voided")).toBe("auction.err.voided");
    expect(isAuctionTab("flagged") && !isAuctionTab("x")).toBe(true);
  });
});
