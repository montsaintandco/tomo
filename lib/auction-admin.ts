// 경매 운영(U5) 표시 규칙 — tomo 어드민 /admin/auctions 와 운영 API(/api/ops/auctions)가 같이 쓴다. DB 함수는 0048.
// 판정(현재가·1등·의심 신호)은 DB 가 한다. 여기는 라벨·지연 표시·오류 문구만.

export type AuctionStatus = "live" | "awaiting_payment" | "paid" | "unsold" | "unpaid" | "cancelled";
export const AUCTION_TABS = ["live", "awaiting", "unpaid", "ended", "flagged", "all"] as const;
export type AuctionTab = (typeof AUCTION_TABS)[number];
export const isAuctionTab = (v: unknown): v is AuctionTab => typeof v === "string" && (AUCTION_TABS as readonly string[]).includes(v);

export const AUCTION_STATUS_LABEL: Record<AuctionStatus, string> = {
  live: "진행 중", awaiting_payment: "결제 대기", paid: "결제 완료", unsold: "유찰", unpaid: "미결제", cancelled: "취소·종료",
};

/** 의심 신호(0048 auction_flag_signals) → 운영자 문구. 표시만, 자동 조치 없음 */
export const FLAG_LABEL: Record<string, string> = {
  same_contact: "판매자와 연락처·배송지·계좌 같음",
  repeat_no_win: "같은 판매자 경매 3건 이상 입찰, 낙찰 결제 0",
  relist_rebid: "미결제 뒤 다시 올린 경매에 또 입찰",
  new_account_pusher: "가입 7일 미만 계정이 1등 아닌 채 값을 올림",
};
export const flagText = (s: string) => FLAG_LABEL[s] ?? s;

export type AuctionAgingRow = { status: string; ends_at: string; pay_due_at: string | null; seller_choice_pending?: boolean | null };
export type AuctionAging = { level: "warn" | "late"; text: string } | null;

/**
 * 지연 표시. late = 크론이 처리했어야 하는데 안 된 것(마감 5분 지남·미결제 확정 50분 지남),
 * warn = 결제 기한 12시간 이내, 미결제 뒤 판매자 선택 대기(기한 + 3일 지나면 late)
 */
export function auctionAging(r: AuctionAgingRow, now: number): AuctionAging {
  const t = (s: string | null) => (s ? new Date(s).getTime() : NaN);
  const H = 36e5;
  if (r.status === "live") return t(r.ends_at) + 5 * 60e3 < now ? { level: "late", text: "마감 처리 지연" } : null;
  if (r.status === "awaiting_payment") {
    const due = t(r.pay_due_at);
    if (!Number.isFinite(due)) return null;
    if (due + 50 * 60e3 < now) return { level: "late", text: "미결제 확정 지연" };
    if (due - now <= 12 * H) return { level: "warn", text: due > now ? `결제 기한 ${Math.max(1, Math.ceil((due - now) / H))}시간 남음` : "결제 기한 지남(확정 대기)" };
    return null;
  }
  if (r.status === "unpaid" && r.seller_choice_pending) {
    const due = t(r.pay_due_at);
    return { level: Number.isFinite(due) && due + 3 * 24 * H < now ? "late" : "warn", text: "판매자 선택 대기" };
  }
  return null;
}

/** DB 오류 → 운영자 문구(한국어 고정 어드민) */
const ADMIN_ERR: [string, string][] = [
  ["admin only", "운영자만 할 수 있어요(정지된 운영자 포함 거절)"],
  ["note required", "메모를 적어 주세요"],
  ["auction not live", "진행 중인 경매가 아니에요. 새로 읽은 뒤 다시 확인해 주세요"],
  ["auction not found", "경매를 찾을 수 없어요"],
  ["bidder not found", "이 경매에 입찰한 사람이 아니에요"],
  ["strike not active", "이미 해제된 경고예요"],
  ["auction live", "진행 중 경매 상품은 숨길 수 없어요. 경매 화면에서 강제 종료하세요"],
  ["seller has live auctions", "진행 중 경매가 있는 판매자예요. 경매 화면에서 먼저 강제 종료하세요"],
];
export function adminAuctionError(msg: string): string {
  return ADMIN_ERR.find(([k]) => msg.includes(k))?.[1] ?? msg;
}
