// 자체 상품 경매(U1·U2, docs/aaa/14-auction.md). DB 정본은 0046·0047 함수다. 여기는 화면 표시·미리 계산·오류 문구용.
// AUCTION_RULES 는 0046 auction_settings.rules 기본값과 글자 그대로 같아야 한다(tests/unit/auction.test.ts 가 비교).
import { directShippingFee } from "./fees";
import type { I18nKey } from "./i18n";

export type Cur = "KRW" | "JPY";

export const AUCTION_RULES = {
  increments: {
    KRW: [[10000, 100], [50000, 1000], [100000, 2000], [500000, 5000], [null, 10000]],
    JPY: [[1000, 10], [5000, 100], [10000, 250], [50000, 500], [null, 1000]],
  },
  unit: { KRW: 100, JPY: 10 },
  min_start: { KRW: 1000, JPY: 100 },
  max_bid: { KRW: 100000000, JPY: 10000000 },
} as const satisfies {
  increments: Record<Cur, readonly (readonly [number | null, number])[]>;
  unit: Record<Cur, number>; min_start: Record<Cur, number>; max_bid: Record<Cur, number>;
};

export const AUCTION_DURATIONS = [1, 3, 5, 7] as const;
export const EXTEND_MINUTES = 5;
export const PAY_HOURS = 48;

/** 기능 플래그. 없으면 경매 API 는 404, 화면은 흔적 없음 */
export const auctionEnabled = () => process.env.NEXT_PUBLIC_AUCTION === "1";

export type AuctionStatus = "live" | "awaiting_payment" | "paid" | "unsold" | "unpaid" | "cancelled";

/** auction_state(0046) 응답 — GET /api/auctions/[id]/state 가 그대로 돌려준다 */
export type AuctionState = {
  id: string; code: string; listing_id: string; status: AuctionStatus; currency: Cur;
  start_price: number; current_price: number; bid_count: number; bidder_count: number;
  ends_at: string; original_ends_at: string; extended_count: number; closed_at: string | null;
  pay_due_at: string | null; final_price: number | null; duration_days: number; relist_of: string | null;
  min_bid: number; server_now: string; extend_minutes: number;
  viewer: {
    signed_in: boolean; is_seller: boolean; bidder_no: number | null; my_max: number | null;
    leading: boolean; won: boolean; can_pay: boolean; tx_id: string | null; bid_banned_until: string | null;
  };
  bids: { no: number; amount: number; kind: "direct" | "auto"; at: string; me: boolean }[];
};

/** place_bid(0046) 응답 */
export type BidResult = {
  auction_id: string; leading: boolean; current_price: number; my_max: number; bid_count: number;
  ends_at: string; extended: boolean; min_bid: number; replayed?: boolean;
};

/** 현재가 → 입찰 단위 (SQL auction_increment 와 같은 표) */
export function increment(cur: Cur, price: number): number {
  for (const [below, step] of AUCTION_RULES.increments[cur]) if (below === null || price < below) return step;
  return AUCTION_RULES.increments[cur].at(-1)![1];
}

/** 금액 단위·상한·(시작가면) 하한 검사 (SQL auction_amount_ok) */
export function amountOk(cur: Cur, amount: number, start = false): boolean {
  return Number.isInteger(amount) && amount > 0 && amount % AUCTION_RULES.unit[cur] === 0
    && amount <= AUCTION_RULES.max_bid[cur] && (!start || amount >= AUCTION_RULES.min_start[cur]);
}

/** 다음 최소 입찰 금액: 입찰 0건이면 시작가, 아니면 현재가 + 단위 */
export const minBid = (cur: Cur, current: number, hasBids: boolean, start: number) =>
  hasBids ? current + increment(cur, current) : start;

/** 마감 = 시작 + 기간, 10분 단위 올림 (SQL auction_ends_at) */
export function endsAt(from: Date, days: number): Date {
  const ms = from.getTime() + days * 86_400_000;
  return new Date(Math.ceil(ms / 600_000) * 600_000);
}

export type ProxyState = { start: number; current: number; leader: string | null; leaderMax: number };
export type ProxyOutcome = { leader: string; price: number; leaderMax: number } | { error: "bid too low" | "invalid amount" };

/** 상한가 입찰 판정 — SQL place_bid 의 가격 계산과 같은 규칙(같은 금액이면 기존 1등). 화면 미리보기·단위 테스트용 */
export function proxyBid(cur: Cur, s: ProxyState, bidder: string, amount: number): ProxyOutcome {
  if (!amountOk(cur, amount)) return { error: "invalid amount" };
  if (s.leader === null) return amount < s.start ? { error: "bid too low" } : { leader: bidder, price: s.start, leaderMax: amount };
  if (s.leader === bidder) return amount <= s.leaderMax ? { error: "bid too low" } : { leader: bidder, price: s.current, leaderMax: amount };
  if (amount < s.current + increment(cur, s.current)) return { error: "bid too low" };
  if (amount > s.leaderMax) return { leader: bidder, price: Math.min(amount, s.leaderMax + increment(cur, s.leaderMax)), leaderMax: amount };
  return { leader: s.leader, price: Math.min(s.leaderMax, amount + increment(cur, amount)), leaderMax: s.leaderMax };
}

/** 마감 5분 안에 현재가가 오르면(또는 첫 입찰) 그 시각 + 5분 */
export function extendedEnd(endsAtMs: number, nowMs: number, priceRose: boolean): number | null {
  return priceRose && endsAtMs - nowMs <= EXTEND_MINUTES * 60_000 ? nowMs + EXTEND_MINUTES * 60_000 : null;
}

/** 입찰 창 예상 결제액 = 입찰가 + 국경 간이면 국제배송비(8,000원/900엔). 결제 때 start_auction_transaction 이 같은 표로 정한다 */
export const estimatedTotal = (cur: Cur, price: number, crossBorder: boolean) => price + directShippingFee(cur, crossBorder);

/** 폴링 간격: 5초, 마감 5분 전부터 2초, 끝난 경매는 멈춤(null) */
export function pollMs(s: Pick<AuctionState, "status" | "ends_at" | "server_now">): number | null {
  if (s.status !== "live") return null;
  return new Date(s.ends_at).getTime() - new Date(s.server_now).getTime() <= EXTEND_MINUTES * 60_000 ? 2000 : 5000;
}

// DB 오류 메시지(raise exception) → i18n 키. 모르는 오류는 일반 문구
const ERRORS: [string, I18nKey][] = [
  ["unauthorized", "auction.err.login"],
  ["cannot bid own auction", "auction.err.own"],
  ["auction ended", "auction.err.ended"],
  ["auction not found", "auction.err.notFound"],
  ["bid too low", "auction.err.tooLow"],
  ["invalid amount", "auction.err.amount"],
  ["bid restricted", "auction.err.restricted"],
  ["suspended", "auction.err.suspended"],
  ["blocked", "auction.err.blocked"],
  ["country not allowed", "auction.err.country"],
  ["profile required", "auction.err.profile"],
  ["new bidder limit", "auction.err.newLimit"],
  ["invalid request id", "auction.err.generic"],
  ["not seller", "auction.err.notSeller"],
  ["listing not available", "auction.err.listing"],
  ["auction already open", "auction.err.alreadyOpen"],
  ["listing has active transaction", "auction.err.listing"],
  ["listing has pending offers", "auction.err.offers"],
  ["invalid duration", "auction.err.duration"],
  ["invalid start price", "auction.err.startPrice"],
  ["invalid price", "auction.err.amount"],
  ["too many live auctions", "auction.err.tooMany"],
  ["auction has bids", "auction.err.hasBids"],
  ["auction not live", "auction.err.ended"],
  ["not winner", "auction.err.notWinner"],
  ["auction not payable", "auction.err.notPayable"],
  ["payment window closed", "auction.err.payClosed"],
  ["auction not relistable", "auction.err.notRelistable"],
  ["auction in progress", "auction.err.alreadyOpen"],
  ["auction listing locked", "auction.err.locked"],
  ["auction listing", "auction.err.useAuction"],
];
export function auctionErrorKey(msg: string): I18nKey {
  return ERRORS.find(([m]) => msg.includes(m))?.[1] ?? "auction.err.generic";
}
const STATUS_409 = new Set<I18nKey>(["auction.err.ended", "auction.err.tooLow", "auction.err.alreadyOpen", "auction.err.hasBids", "auction.err.payClosed", "auction.err.listing"]);
export const auctionErrorStatus = (k: I18nKey) => (k === "auction.err.login" ? 401 : k === "auction.err.notFound" ? 404 : STATUS_409.has(k) ? 409 : 400);
