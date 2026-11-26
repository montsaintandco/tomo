// 어드민 지연(경과) 기준 — 「내 차례」 큐와 목록 배지가 같은 기준을 쓴다(에어쉽 lib/admin-aging.ts 이식, tomo 단계로 축소).
// 기준 시각(since)은 단계마다 다르다. proxy_requests·transactions 는 단계 진입 시각 칸이 없어 updated_at 을 쓴다(그 행이 마지막으로 바뀐 때 ≈ 지금 단계에 들어온 때).

export type AgingStage =
  | "quote" | "pay_check" | "purchase" | "inbound" | "intl_ship"
  | "cancel_req" | "dispute" | "center" | "refund" | "payout" | "report" | "support";
export type AgingLevel = "warn" | "late";
export type AgingThresholds = Record<AgingStage, { warn_h: number; late_h: number }>;

/** 단계별 주의·지연 시간(시간 단위). 돈·고객 대기가 걸린 단계일수록 짧다 */
export const DEFAULT_AGING: AgingThresholds = {
  quote: { warn_h: 12, late_h: 24 },        // 견적 대기
  pay_check: { warn_h: 12, late_h: 24 },    // 결제 확인 필요(approved)
  purchase: { warn_h: 24, late_h: 48 },     // 결제 후 현지 구매 전(paid)
  inbound: { warn_h: 168, late_h: 336 },    // 구매 후 센터 입고 전(purchasing)
  intl_ship: { warn_h: 24, late_h: 48 },    // 센터 입고 후 국제 발송 전
  cancel_req: { warn_h: 6, late_h: 24 },    // 고객 취소 요청
  dispute: { warn_h: 24, late_h: 72 },
  center: { warn_h: 48, late_h: 120 },      // 직거래 센터 경유
  refund: { warn_h: 1, late_h: 24 },        // 환불 대기·실패
  payout: { warn_h: 24, late_h: 72 },       // 출금 신청
  report: { warn_h: 24, late_h: 72 },       // 신고 확인
  support: { warn_h: 12, late_h: 24 },      // 문의 답변
};

export const STAGE_LABEL: Record<AgingStage, string> = {
  quote: "견적", pay_check: "결제 확인", purchase: "현지 구매", inbound: "센터 입고", intl_ship: "국제 발송",
  cancel_req: "취소 요청", dispute: "분쟁", center: "센터", refund: "환불", payout: "출금", report: "신고", support: "문의",
};

/** 대행 요청 상태 → 운영자가 처리할 단계(없으면 고객·택배 차례) */
export const PROXY_STAGE: Record<string, AgingStage | undefined> = {
  requested: "quote", approved: "pay_check", paid: "purchase", purchasing: "inbound", center_received: "intl_ship",
};

export function agingLevel(since: string | null | undefined, stage: AgingStage, now = Date.now(), th: AgingThresholds = DEFAULT_AGING): AgingLevel | null {
  if (!since) return null;
  const t = new Date(since).getTime();
  if (!Number.isFinite(t)) return null;
  const h = (now - t) / 36e5;
  const { warn_h, late_h } = th[stage];
  if (h >= late_h) return "late";
  if (h >= Math.min(warn_h, late_h)) return "warn";
  return null;
}

/** 경과 표시 — 1시간 미만 "방금", 하루 미만 "N시간", 그 뒤 "N일" */
export function ageText(since: string | null | undefined, now = Date.now()): string {
  if (!since) return "";
  const ms = Math.max(0, now - new Date(since).getTime());
  if (!Number.isFinite(ms)) return "";
  const h = Math.floor(ms / 36e5);
  if (h < 1) return "방금";
  if (h < 24) return `${h}시간`;
  return `${Math.floor(h / 24)}일`;
}

/** 서버 컴포넌트에서 쓰는 지금 시각(렌더 중 Date.now 직접 호출 금지 규칙 때문에 함수로 감싼다) */
export const nowMs = () => Date.now();

export type TurnItem = { key: string; stage: AgingStage; title: string; who?: string | null; since: string; href: string };
export type RankedTurn = TurnItem & { level: AgingLevel | null };

const rank = (l: AgingLevel | null) => (l === "late" ? 2 : l === "warn" ? 1 : 0);

/** 「내 차례」 정렬 — 지연 > 주의 > 보통, 같은 등급은 오래된 순. 같은 key 는 하나만 */
export function rankTurn(items: TurnItem[], now = Date.now(), th: AgingThresholds = DEFAULT_AGING): RankedTurn[] {
  const seen = new Set<string>();
  return items
    .filter((it) => (seen.has(it.key) ? false : (seen.add(it.key), true)))
    .map((it) => ({ ...it, level: agingLevel(it.since, it.stage, now, th) }))
    .sort((a, b) => rank(b.level) - rank(a.level) || new Date(a.since).getTime() - new Date(b.since).getTime());
}
