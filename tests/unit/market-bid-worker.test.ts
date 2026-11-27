import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { opsActorGate } from "@/lib/ops-server";
import { OPS_ROUTE_LIST } from "@/lib/ops-api";
import { adminMbError, holdText, mbWorkerPlan, MB_WORKER_RESULTS } from "@/lib/market-bid-admin";
import { mbErrorKey } from "@/lib/market-bid";
import { NOTIF_KINDS } from "@/lib/notifications";
import { t } from "@/lib/i18n";

// 0055 입찰 워커 연결(T1). DB 판정은 SQL 되돌림 리허설(docs/aaa/16 12절), 여기는 앱 쪽 규칙과 SQL 글 대조
const sql = readFileSync("supabase/migrations/0055_market_bid_worker.sql", "utf8");

describe("0055 시스템 주체(에어쉽 다리 작업)", () => {
  it("money 거절, 사람 경로 거절, 워커 경로만 허용. 사람은 워커 경로를 못 부른다", () => {
    expect(opsActorGate({ is_system: true }, "money", true)).toBe("system actor: money not allowed");
    expect(opsActorGate({ is_system: true }, "money", false)).toBe("system actor: money not allowed");
    expect(opsActorGate({ is_system: true }, "ops", false)).toBe("system actor: route not allowed");
    expect(opsActorGate({ is_system: true }, "ops", true)).toBeNull();
    expect(opsActorGate({ is_system: false }, "ops", true)).toBe("system route only");
    expect(opsActorGate({ is_system: false }, "money", false)).toBeNull();
  });
  it("워커 경로 4개는 ops", () => {
    for (const r of ["GET /api/ops/market-bids/worker-queue (ops)", "POST /api/ops/market-bids/worker-health (ops)",
      "POST /api/ops/market-bids/:id/armed (ops)", "POST /api/ops/market-bids/:id/worker-result (ops)"]) expect(OPS_ROUTE_LIST).toContain(r);
  });
  it("DB: 시스템 행은 운영자 프로필·소유자 없음(CHECK)", () => {
    expect(sql).toContain("check ((is_system and profile_id is null and not is_owner) or (not is_system and profile_id is not null))");
  });
});

describe("0055 워커 결과 → 조작", () => {
  it("낙찰은 매입하지 않고 낙찰 확인 대기로만", () => {
    expect(mbWorkerPlan("won", { final_price: 2100 }, true)).toEqual({ op: "worker_won", final: 2100 });
    expect(typeof mbWorkerPlan("won", {}, true)).toBe("string");
    expect(sql).toMatch(/update market_bids set status = 'hold', hold_reason = 'worker_won'/);
    expect(sql).not.toMatch(/market_bid_worker_won[\s\S]*?settleWon|market_bid_worker_won[\s\S]{0,2000}market_bid_to_order/);
  });
  it("실패: 입찰 들어간 적 없으면 못 넣음(승인 해제), 있으면 보류. 불명은 보류", () => {
    expect(mbWorkerPlan("failed", { reason: "reauth" }, false)).toEqual({ op: "missed", body: { reason: "worker: reauth" } });
    expect(mbWorkerPlan("failed", { reason: "x" }, true)).toEqual({ op: "hold", body: { reason: "failed_after_submit" } });
    expect(mbWorkerPlan("failed", {}, false)).toBe("reason required");
    expect(mbWorkerPlan("unknown", {}, true)).toEqual({ op: "hold", body: { reason: "submit_unknown" } });
  });
  it("입찰됨·밀림·유찰은 금액 필수, 증거를 메모에 남긴다", () => {
    expect(mbWorkerPlan("placed", { amount: 2000, evidence: "fire 12" }, false)).toEqual({ op: "placed", body: { amount: 2000, ends_at: null, note: "worker: fire 12" } });
    expect(typeof mbWorkerPlan("placed", { amount: 0 }, false)).toBe("string");
    expect(mbWorkerPlan("outbid", { price: 2200 }, true)).toMatchObject({ op: "outbid", body: { price: 2200 } });
    expect(mbWorkerPlan("lost", { final_price: 0 }, true)).toMatchObject({ op: "lost", body: { final_seen: 0 } });
    expect(MB_WORKER_RESULTS).toHaveLength(6);
  });
  it("보류 사유 문구", () => {
    for (const r of ["worker_won", "submit_unknown", "failed_after_submit", "worker down before end"]) expect(holdText(r)).not.toBe(r);
  });
});

describe("0055 크론·접수·취소 규칙(SQL 글)", () => {
  it("마감 30분 전 자동 취소는 수동 건·접수 확인 없는 워커 건만, 접수된 워커 건은 보류", () => {
    expect(sql).toContain("and (executor = 'manual' or armed_at is null)");
    expect(sql).toMatch(/executor = 'airship' and armed_at is not null\s+and ends_at <= now\(\) \+ interval '30 minutes' and \(v_wp is not null or ends_at \+ interval '15 minutes' < now\(\)\)/);
  });
  it("재알림 2·1시간 전 건당 1회(dedupe 키), 접수 확인 10분 지연", () => {
    expect(sql).toContain("'bid.to_place_due:' || b.id || ':' || x.h");
    expect(sql).toContain("'bid.to_place_due:' || b.id || ':arm'");
  });
  it("워커 이상 → 접수 자동 중단(실행자 airship 만), 자동 재개 없음", () => {
    expect(sql).toMatch(/if v_s\.executor <> 'airship' or not v_s\.accepting then return null/);
    expect(sql).toContain("pause_reason = 'auto: worker ' || v_p");
    expect(sql).toContain("'mb: worker down'");
  });
  it("고객 취소 마감 30분 전 → 화면 문구", () => {
    expect(sql).toContain("v_b.ends_at <= now() + interval '30 minutes'");
    expect(mbErrorKey("mb: cancel closed")).toBe("mb.err.cancelClosed");
    for (const l of ["ko", "ja"] as const) expect(t(l, "mb.err.cancelClosed")).not.toBe("mb.err.cancelClosed");
  });
  it("0055 알림 kind 가 앱 목록·문구에 있다, 운영자 오류마다 문구", () => {
    const kinds = [...sql.matchAll(/market_bid_note\([^,]+, '([a-z_]+)'/g)].map((m) => m[1]);
    expect(kinds).toContain("mb_won_check");
    for (const k of new Set(kinds)) {
      expect(NOTIF_KINDS as readonly string[], k).toContain(k);
      for (const l of ["ko", "ja"] as const) expect(t(l, `notif.${k}` as never)).not.toBe(`notif.${k}`);
    }
    const raised = new Set([...sql.matchAll(/raise exception 'mb: ([a-z ]+)/g)].map((m) => `mb: ${m[1].trim()}`));
    for (const r of raised) if (r !== "mb: cancel closed" && r !== "mb: not cancellable") expect(adminMbError(r), r).not.toBe(r);
  });
});
