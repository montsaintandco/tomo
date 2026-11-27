// 알림함 — DB(0027)는 kind·ref·data만 저장하고 문구는 앱이 i18n `notif.<kind>`로 만든다.
// 마이페이지 하위 화면이 같이 쓰는 상태 라벨·페이지 크기도 여기 둔다(서버 컴포넌트에서 값으로 import 하려면 "use client" 밖이어야 한다).
import { t, type I18nKey, type Lang } from "./i18n";

export const NOTIF_KINDS = [
  "tx_paid", "tx_buyer_paid", "tx_shipped", "tx_to_center", "tx_center_received", "tx_delivered", "tx_completed", "tx_auto_completed", "tx_cancelled", "tx_disputed",
  "proxy_paid", "proxy_quoted", "proxy_purchasing", "proxy_center", "proxy_shipped", "proxy_delivered", "proxy_cancelled",
  "support_answered", "refund_done", "payout_sent", "payout_rejected",
  "offer_received", "offer_accepted", "offer_declined", "wish_price_drop", "listing_held", "listing_released",
  "auction_first_bid", "auction_outbid", "auction_ending", "auction_won", "auction_lost", "auction_sold", "auction_unsold",
  "auction_pay_reminder", "auction_unpaid", "auction_unpaid_seller", "auction_cancelled", "auction_bid_voided", "auction_pay_expired",
  "mb_authorized", "mb_cancelled", "mb_auth_void", "mb_placed", "mb_outbid", "mb_won", "mb_lost", "mb_missed", "mb_hold", "mb_pay_needed", "mb_pay_expired", "mb_won_check",
] as const;
export type NotifKind = (typeof NOTIF_KINDS)[number];

export type Notif = {
  id: number; kind: string; ref_type: string | null; ref_id: string | null;
  data: Record<string, unknown> | null; read_at: string | null; created_at: string;
};

const isKind = (k: string): k is NotifKind => (NOTIF_KINDS as readonly string[]).includes(k);

/** 알림 본문 한 줄. 모르는 kind(앱보다 DB가 새 버전)면 일반 문구 */
export function notifText(lang: Lang, n: Pick<Notif, "kind">): string {
  return t(lang, isKind(n.kind) ? (`notif.${n.kind}` as I18nKey) : "my.notif.generic");
}

/** 보조 줄 — 트리거가 data.title 에 상품명을 넣는다 */
export function notifSub(n: Pick<Notif, "data">): string {
  const v = n.data?.title;
  if (typeof v === "string") return v;
  const code = n.data?.code; // 입찰 대행 알림(0052)은 제목 대신 신청 번호(MB…)를 싣는다 — 여러 건이면 어느 신청인지 보이게
  return typeof code === "string" ? code : "";
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** 알림을 누르면 갈 곳 */
export function notifHref(n: Pick<Notif, "kind" | "ref_id" | "data">): string {
  const d = n.data ?? {};
  const id = n.ref_id;
  const k = n.kind;
  if (k.startsWith("tx_")) return id ? `/transactions/${id}` : "/mypage/orders";
  if (k.startsWith("proxy_")) {
    const order = str(d.order_id);
    return order ? `/order/${order}` : id ? `/proxy/${id}` : "/mypage/orders?tab=proxy";
  }
  if (k === "support_answered") return "/mypage/support";
  if (k === "refund_done") {
    const tx = str(d.transaction_id), pr = str(d.proxy_request_id);
    return tx ? `/transactions/${tx}` : pr ? `/proxy/${pr}` : "/mypage/orders";
  }
  if (k.startsWith("payout_")) return "/mypage/payouts";
  if (k === "offer_received") return "/mypage/offers";
  if (k === "offer_accepted") { const l = str(d.listing_id); return l ? `/listings/${l}` : "/mypage/offers?tab=out"; }
  if (k === "offer_declined") return "/mypage/offers?tab=out";
  if (k === "wish_price_drop") return id ? `/listings/${id}` : "/mypage/wishlist";
  if (k === "listing_held" || k === "listing_released") return id ? `/listings/${id}` : "/mypage/sales";
  if (k.startsWith("auction_")) { const l = str(d.listing_id); return l ? `/listings/${l}` : "/mypage/notifications"; } // 경매(0046·0047): 상품 상세가 입찰·결제 화면
  if (k.startsWith("mb_")) return id ? `/bids/${id}` : "/mypage/bids"; // 입찰 대행(0050·0052): ref_id = 신청 id
  return "/mypage/notifications";
}

// ── 마이페이지 공용 ──
export const PAGE = 20;
/** ?page=N → 보여 줄 행 수(20·N, 최대 1000). 조회는 limit+1 로 더보기 여부를 안다 */
export function pageLimit(page?: string): { n: number; limit: number } {
  const n = Math.max(1, Math.min(50, Number(page) || 1));
  return { n, limit: n * PAGE };
}

export const TX_STATUS: Record<string, I18nKey> = {
  pending_payment: "status.pending_payment", paid: "status.paid", shipped: "status.shipped",
  shipped_to_center: "status.shipped_to_center", center_received: "status.center_received",
  shipped_international: "status.shipped_international", delivered: "status.delivered",
  completed: "status.completed", cancelled: "status.cancelled", disputed: "status.disputed",
};
export const PROXY_STATUS: Record<string, I18nKey> = {
  requested: "pstatus.requested", quoted: "pstatus.quoted", approved: "pstatus.approved",
  paid: "pstatus.paid", purchasing: "pstatus.purchasing", center_received: "pstatus.center_received",
  shipped_international: "pstatus.shipped_international", delivered: "pstatus.delivered",
  completed: "pstatus.completed", cancelled: "pstatus.cancelled",
};
