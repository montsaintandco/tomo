import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { OPS_ROUTE_LIST } from "@/lib/ops-api";
import { adminMbError, mbOpsFor, MB_EVENT_LABEL, MB_OP_SCOPE } from "@/lib/market-bid-admin";
import { t } from "@/lib/i18n";

// 0056 입찰 워커 연결 T2(docs/aaa/16 13절): 수동 전환·접수된 워커 건 닫기 막기·구매 기한 재알림·고객 문구
const sql = readFileSync("supabase/migrations/0056_market_bid_t2.sql", "utf8");
const faq = readFileSync("lib/help-faq.ts", "utf8");
const llms = readFileSync("app/llms.txt/route.ts", "utf8");

describe("0056 수동 전환", () => {
  it("운영 API 경로 executor = ops, 접수된 건은 에어쉽 통로(worker_closed)만", () => {
    expect(OPS_ROUTE_LIST).toContain("POST /api/ops/market-bids/:id/executor (ops)");
    expect(MB_OP_SCOPE.executor).toBe("ops");
    expect(sql).toContain("if v_b.armed_at is not null and not coalesce(p_worker_closed, false) then raise exception 'mb: worker armed'");
    expect(sql).toContain("if v_b.placed_at is not null then raise exception 'mb: already placed'");
    expect(sql).toContain("market_bid_lock(p_id, p_expected, array['authorized', 'hold'])");
  });
  it("어드민 버튼: 접수 전 워커 건 = 수동 전환(입찰됨 기록 없음), 접수된 워커 건 = 보류만, 수동 건·들어간 건은 그대로", () => {
    expect(mbOpsFor("authorized", false, { executor: "airship", armed: false })).toEqual(["hold", "missed", "cancel", "executor"]);
    expect(mbOpsFor("authorized", false, { executor: "airship", armed: true })).toEqual(["hold"]);
    expect(mbOpsFor("hold", false, { executor: "airship", armed: true })).toEqual([]);
    expect(mbOpsFor("authorized", false, { executor: "manual", armed: false })).toEqual(["placed", "hold", "missed", "cancel"]);
    expect(mbOpsFor("placed", true, { executor: "airship", armed: true })).toEqual(["placed", "outbid", "won", "lost", "hold"]);
    expect(mbOpsFor("authorized", false)).toEqual(["placed", "hold", "missed", "cancel"]);
  });
  it("접수된 워커 건은 사람이 못 넣음·취소로 닫지 못한다(서버 권한 결과 전달은 그대로)", () => {
    expect(sql).toMatch(/old\.armed_at is not null\s+and old\.status in \('authorized', 'hold'\) and new\.status in \('missed', 'cancelled'\)\s+and coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
  });
  it("운영자 오류마다 문구, 진행 기록 이름", () => {
    const raised = new Set([...sql.matchAll(/raise exception 'mb: ([a-z ]+)/g)].map((m) => `mb: ${m[1].trim()}`));
    for (const r of raised) expect(adminMbError(r), r).not.toBe(r);
    expect(MB_EVENT_LABEL.executor).toBeTruthy();
  });
});

describe("0056 구매 기한 재알림", () => {
  it("마감 뒤 2·12·20시간 구간마다 1회, 낙찰 확인 대기·매입 중·미구매 주문", () => {
    expect(sql).toContain("'bid.to_buy_due:' || b.id || ':' || x.h");
    expect(sql).toContain("(values (2, 12), (12, 20), (20, 24)) x(h, nx)");
    expect(sql).toContain("(b.status = 'hold' and b.hold_reason = 'worker_won') or b.status = 'won' or (b.status = 'ordered' and r.status = 'paid')");
  });
});

describe("고객 문구(워커 방식)", () => {
  it("패널·상세 문구 ko/ja", () => {
    for (const k of ["mb.panel.agree1w", "mb.panel.workerNote", "mb.d.payOkWorker", "mb.d.armed"] as const)
      for (const l of ["ko", "ja"] as const) expect(t(l, k)).not.toBe(k);
    expect(t("ko", "mb.panel.agree2")).not.toContain("자동");
  });
  it("FAQ·llms: 마감 직전 입찰·확인 뒤 결제·접수 중지 문구, 환율 가산·내부 총량 한도는 없다", () => {
    for (const s of [faq, llms]) {
      expect(s).toContain("약 2분 전");
      expect(s).toContain("지금은 입찰 신청을 받지 않아요");
      expect(s).not.toMatch(/6\.5|스프레드|가산|daily_cap|max_open|전체 \d+건/);
    }
    expect(faq).toContain("marketBidEnabled() ? MARKET_BID_FAQ[lang] : []");
  });
});