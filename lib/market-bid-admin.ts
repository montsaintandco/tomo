// 입찰 대행 운영(M5) 표시 규칙 — tomo 어드민 /admin/market-bids 와 운영 API(/api/ops/market-bids)가 같이 쓴다. DB 함수는 0052.
// 판정·금액은 DB 가 한다. 여기는 라벨·탭·조작 권한·지연 표시·오류 문구만(어드민은 한국어 고정).
import type { OpsScope } from "./ops-bridge";
import type { MarketBidStatus } from "./market-bid";

export const MB_TABS = ["to_place", "bidding", "hold", "won", "ended", "all"] as const;
export type MbTab = (typeof MB_TABS)[number];
export const isMbTab = (v: unknown): v is MbTab => typeof v === "string" && (MB_TABS as readonly string[]).includes(v);
export const MB_TAB_LABEL: Record<MbTab, string> = {
  to_place: "입찰 필요", bidding: "입찰 중", hold: "보류", won: "낙찰·구매 필요", ended: "끝남", all: "전체",
};

export const MB_STATUS_LABEL: Record<MarketBidStatus, string> = {
  pending_auth: "카드 승인 대기", authorized: "입찰 필요", placed: "입찰됨", outbid: "밀림", hold: "보류",
  won: "낙찰·매입 중", ordered: "주문 생성", lost: "유찰", cancelled: "취소", missed: "못 넣음", expired: "결제창 만료", capture_failed: "매입 실패",
};

/** 조작 종류와 운영 API 권한. 입찰됨·밀림·유찰·보류 = ops, 낙찰 매입·승인 해제 강제(못 넣음·운영 취소)·설정 = money */
export const MB_OPS = ["placed", "outbid", "hold", "lost", "won", "missed", "cancel", "executor"] as const;
export type MbOp = (typeof MB_OPS)[number];
export const MB_OP_SCOPE: Record<MbOp, OpsScope> = {
  placed: "ops", outbid: "ops", hold: "ops", lost: "ops", won: "money", missed: "money", cancel: "money", executor: "ops",
};
export const MB_OP_LABEL: Record<MbOp, string> = {
  placed: "입찰됨 기록", outbid: "밀림", hold: "보류", lost: "유찰 처리", won: "낙찰 처리", missed: "못 넣음(승인 해제)", cancel: "운영 취소(승인 해제)", executor: "수동 전환(워커 → 수동)",
};

/**
 * 상태별로 할 수 있는 조작(DB 0052 허용 전이와 같다). 못 넣음·운영 취소는 입찰이 한 번도 안 들어간 건만.
 * 0056 워커 건(입찰 전): 「수동 전환」. 접수 확인(armed)된 워커 건은 에어쉽 행이 살아 있어 tomo 에서 바로 바꾸거나 닫지 못한다
 * (에어쉽 「마켓 입찰」 화면의 수동 전환이 에어쉽 행을 먼저 닫는다) → 수동 전환·못 넣음·운영 취소·입찰됨 기록을 숨긴다
 */
export function mbOpsFor(status: string, placed: boolean, w?: { executor?: string | null; armed?: boolean }): MbOp[] {
  const base: MbOp[] = (() => {
    switch (status) {
      case "authorized": return ["placed", "hold", "missed", "cancel"];
      case "placed": return ["placed", "outbid", "won", "lost", "hold"];
      case "outbid": return ["placed", "won", "lost", "hold"];
      case "hold": return placed ? ["placed", "won", "lost"] : ["placed", "missed", "cancel"];
      default: return [];
    }
  })();
  if (w?.executor !== "airship" || placed || (status !== "authorized" && status !== "hold")) return base;
  return w.armed ? base.filter((op) => op === "hold") : [...base.filter((op) => op !== "placed"), "executor"];
}

export type MbAgingRow = { status: string; ends_at: string; updated_at?: string | null; closed_at?: string | null; request_status?: string | null; auth_expires_at?: string | null };
/**
 * 지연 표시. 입찰 필요: 마감 2시간 전부터 warn(30분 전이면 크론이 자동 취소), 보류: 즉시 late(승인 만료 전에 풀어야 한다),
 * 입찰 중: 마감 지남 = warn(결과 입력 대기), 낙찰 뒤 구매 필요: 메루카리는 낙찰 24시간 안 구매 → 18시간 지나면 late
 */
export function mbAging(r: MbAgingRow, now: number): { level: "warn" | "late"; text: string } | null {
  const t = (s: string | null | undefined) => (s ? new Date(s).getTime() : NaN);
  const H = 36e5; const end = t(r.ends_at);
  if (r.status === "hold") return { level: "late", text: "보류 — 확인 필요" };
  if (r.status === "capture_failed") return { level: "late", text: "매입 실패" };
  if (r.status === "authorized") {
    if (end - now <= 2 * H) return { level: end - now <= 45 * 60e3 ? "late" : "warn", text: `마감 ${Math.max(0, Math.round((end - now) / 60e3))}분 전` };
    return null;
  }
  if ((r.status === "placed" || r.status === "outbid") && end < now) return { level: "warn", text: "마감 지남 — 결과 확인 대기" };
  if (r.status === "won") return { level: "warn", text: "매입 진행 중" };
  if (r.status === "ordered" && r.request_status === "paid") {
    const since = t(r.closed_at);
    return { level: since + 18 * H < now ? "late" : "warn", text: `구매 필요(낙찰 ${Math.max(0, Math.floor((now - since) / H))}시간 지남)` };
  }
  return null;
}

/** DB 오류(0052 'mb: …') → 운영자 문구 */
const ADMIN_ERR: [string, string][] = [
  ["mb: admin only", "운영자만 할 수 있어요"],
  ["mb: status changed", "그사이 상태가 바뀌었어요. 새로 읽은 뒤 다시 확인해 주세요"],
  ["mb: bad transition", "지금 상태에서는 할 수 없는 처리예요"],
  ["mb: note required", "메모(증빙·사유)를 적어 주세요"],
  ["mb: bad amount", "금액을 확인해 주세요"],
  ["mb: over cap", "상한가보다 높은 금액은 기록할 수 없어요(상한가 안에서 입찰하세요)"],
  ["mb: not higher", "앞 입찰보다 높은 금액이어야 해요"],
  ["mb: ended", "마감이 지난 경매예요. 결과(낙찰·유찰)로 처리하세요"],
  ["mb: auth not live", "카드 승인이 살아 있지 않아요. 보류로 두고 확인하세요"],
  ["mb: never placed", "입찰이 들어간 적 없는 건이에요. 「못 넣음」으로 처리하세요"],
  ["mb: final required", "마감 뒤 메루카리에서 본 낙찰가를 적어 주세요(경매 자체가 취소됐으면 0)"],
  ["mb: looks won", "본 낙찰가가 우리 마지막 입찰액과 같아요. 우리 낙찰일 수 있어 유찰로 처리하지 않아요"],
  ["mb: was placed", "입찰이 들어간 건이에요. 결과(낙찰·유찰)로 처리하세요"],
  ["mb: not found", "신청을 찾을 수 없어요"],
  ["mb: bad setting", "설정 값 범위를 확인해 주세요"],
  ["mb: worker down", "입찰 워커가 정상이 아니에요. 워커 상태를 확인하거나 실행자를 수동으로 두고 켜세요"],
  ["mb: not worker", "워커 실행 건이 아니에요"],
  ["mb: armed by other", "다른 작업이 이미 접수한 건이에요"],
  ["mb: bad health", "워커 건강 신호 형식이 맞지 않아요"],
  // 0056
  ["mb: worker armed", "워커가 접수한 건이에요. 에어쉽 「마켓 입찰」 화면에서 「수동 전환」(에어쉽 입찰 행을 먼저 닫음)한 뒤 처리하세요"],
  ["mb: already placed", "입찰이 이미 들어간 건이라 워커가 끝까지 맡아요"],
  ["mb: bad executor", "워커 → 수동 전환만 할 수 있어요"],
];
export function adminMbError(msg: string): string {
  return ADMIN_ERR.find(([k]) => msg.includes(k))?.[1] ?? msg;
}
export const HOLD_REASON_LABEL: Record<string, string> = {
  "final over cap": "낙찰가가 상한가보다 높음", "capture over auth": "매입액이 승인액보다 큼", "auth not live": "카드 승인이 살아 있지 않음",
  "final differs from our bid": "낙찰가가 우리 마지막 입찰액과 다름", "result overdue": "마감 15분 뒤에도 결과 없음",
  // 0055 워커 건
  worker_won: "낙찰 확인 대기 — 메루카리에서 낙찰자 표기를 확인한 뒤 「낙찰 처리」", submit_unknown: "워커 제출 여부 불명",
  failed_after_submit: "워커 실패(제출 뒤) — 넣었는지 확인 필요", "worker down before end": "마감 전 워커 이상(접수된 건)",
};

// ── 0055 워커 연결 ──
export const MB_EXECUTOR_LABEL: Record<string, string> = { manual: "수동", airship: "워커 입찰" };
/** 워커 결과(에어쉽 다리 작업 → POST /market-bids/:id/worker-result) */
export const MB_WORKER_RESULTS = ["placed", "outbid", "lost", "failed", "unknown", "won"] as const;
export type MbWorkerResult = (typeof MB_WORKER_RESULTS)[number];
export const isMbWorkerResult = (v: unknown): v is MbWorkerResult => typeof v === "string" && (MB_WORKER_RESULTS as readonly string[]).includes(v);
export type MbWorkerPlan =
  | { op: "placed" | "outbid" | "lost" | "missed" | "hold"; body: Record<string, unknown> }
  | { op: "worker_won"; final: number };
/**
 * 워커 결과 → 실행할 조작. 낙찰은 매입하지 않고 「낙찰 확인 대기」(보류 worker_won)로만. 실패는 입찰이 한 번도 안 들어간 건(placed_at 없음)만
 * 「못 넣음」(승인 해제), 들어간 적 있으면 보류. 불명은 보류. 값이 모자라면 오류 문자열
 */
export function mbWorkerPlan(result: MbWorkerResult, b: Record<string, unknown>, placedBefore: boolean): MbWorkerPlan | string {
  const n = (v: unknown) => { const x = Number(v); return Number.isInteger(x) && x >= 0 ? x : null; };
  const ev = typeof b.evidence === "string" && b.evidence.trim() ? b.evidence.trim().slice(0, 200) : "";
  const why = typeof b.reason === "string" && b.reason.trim() ? b.reason.trim().slice(0, 200) : "";
  switch (result) {
    case "placed": { const a = n(b.amount); if (!a) return "amount (엔) required"; return { op: "placed", body: { amount: a, ends_at: b.ends_at ?? null, note: `worker${ev ? `: ${ev}` : ""}` } }; }
    case "outbid": { const p = n(b.price); if (!p) return "price (엔) required"; return { op: "outbid", body: { price: p, note: `worker${ev ? `: ${ev}` : ""}` } }; }
    case "lost": { const f = n(b.final_price); if (f == null) return "final_price (엔, 낙찰자 없으면 0) required"; return { op: "lost", body: { final_seen: f, reason: `worker: lost${ev ? ` ${ev}` : ""}` } }; }
    case "failed": if (!why) return "reason required";
      return placedBefore ? { op: "hold", body: { reason: "failed_after_submit" } } : { op: "missed", body: { reason: `worker: ${why}` } };
    case "unknown": return { op: "hold", body: { reason: "submit_unknown" } };
    case "won": { const f = n(b.final_price); if (!f) return "final_price (엔) required"; return { op: "worker_won", final: f }; }
  }
}
export const holdText = (r: string | null | undefined) => (r ? HOLD_REASON_LABEL[r] ?? r : "");

// 사건 기록(market_bid_events.kind) 운영 화면 이름. 모르는 종류는 그대로
export const MB_EVENT_LABEL: Record<string, string> = {
  requested: "신청", authorized: "카드 승인", auth_void: "승인 즉시 취소", placed: "입찰됨", rebid: "다시 입찰", outbid: "밀림", hold: "보류",
  released: "승인 해제", won: "낙찰", captured: "매입", ordered: "주문 생성", lost: "유찰", missed: "못 넣음", cancelled: "취소", expired: "결제창 만료",
  loss_recorded: "손실 기록", armed: "워커 접수 확인", capture_failed: "매입 실패", repaid: "고객 재결제", pay_expired: "재결제 기한 지남", executor: "실행자 전환",
};
