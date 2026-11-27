// 자체 상품 경매(U1·U2, docs/aaa/14-auction.md). DB 정본은 0046·0047 함수다. 여기는 화면 표시·미리 계산·오류 문구용.
// AUCTION_RULES 는 0046 auction_settings.rules 기본값과 글자 그대로 같아야 한다(tests/unit/auction.test.ts 가 비교).
import { directShippingFee } from "./fees";
import { t, type I18nKey, type Lang } from "./i18n";

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

// ── 화면 표시(U3·U4) ──

/** 카드·검색에 붙이는 경매 칸(플래그가 꺼져 있으면 빈 글자 — 기존 조회 그대로). auctions 의 공개 열만 고른다(구현 기록 2번) */
const AUCTION_COLS = ", sale_type, auctions(status, bid_count, ends_at, created_at)";
/** 타입은 늘 경매 칸이 있는 것으로 둔다(문자열 select 의 결과 타입 추론용). 값은 플래그가 꺼지면 빈 글자 */
export const auctionSelect = () => (auctionEnabled() ? AUCTION_COLS : "") as typeof AUCTION_COLS;
export type CardAuction = { status: AuctionStatus; bid_count: number; ends_at: string; created_at: string };

/** 상품에 붙은 경매 행(다시 경매면 여러 줄) 중 열린 것, 없으면 가장 최근 것 */
export function pickAuction<T extends { status: string; created_at: string }>(rows?: T[] | null): T | null {
  if (!rows?.length) return null;
  const open = rows.filter((r) => r.status === "live" || r.status === "awaiting_payment");
  return [...(open.length ? open : rows)].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

export const ENDING_SOON_MS = 3_600_000;

/** 남은 밀리초 → 일·시·분·초(음수는 0) */
export function splitMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** 상세 카운트다운: 하루 이상 「2일 3시간」, 한 시간 이상 「3시간 5분」, 그 아래 「4분 05초」, 끝나면 「마감」 */
export function countdownText(lang: Lang, ms: number): string {
  if (ms <= 0) return t(lang, "auction.left.end");
  const { d, h, m, s } = splitMs(ms);
  if (d > 0) return t(lang, "auction.left.d", { d, h });
  if (h > 0) return t(lang, "auction.left.h", { h, m });
  return t(lang, "auction.left.m", { m, s: String(s).padStart(2, "0") });
}

/** 카드 남은 시간(한 단위): 「2일 남음」「3시간 남음」「25분 남음」, 1분 미만은 「1분 남음」, 끝나면 「마감」 */
export function timeLeftShort(lang: Lang, ms: number): string {
  if (ms <= 0) return t(lang, "auction.left.end");
  const { d, h, m } = splitMs(ms);
  if (d > 0) return t(lang, "auction.short.d", { n: d });
  if (h > 0) return t(lang, "auction.short.h", { n: h });
  return t(lang, "auction.short.m", { n: Math.max(1, m) });
}

/** 카드 한 줄 정보. now 는 호출부가 넘긴다(서버 렌더 시각) */
export function cardAuctionInfo(a: CardAuction, now: number) {
  const left = new Date(a.ends_at).getTime() - now;
  return { live: a.status === "live" && left > 0, left, soon: a.status === "live" && left > 0 && left <= ENDING_SOON_MS, bids: a.bid_count };
}

/** 서버 시각 - 내 시계. 카운트다운은 Date.now() + skew 로 센다 */
export const clockSkew = (serverNow: string, clientNow: number) => new Date(serverNow).getTime() - clientNow;

export type ViewerPhase = "seller" | "leading" | "outbid" | "none" | "won" | "lost" | "ended";
/** 보는 사람 기준 상태 — 패널 문구·마이페이지 배지가 같은 판정을 쓴다 */
export function viewerPhase(s: Pick<AuctionState, "status" | "viewer">): ViewerPhase {
  const v = s.viewer;
  if (v.is_seller) return "seller";
  if (s.status === "live") return v.leading ? "leading" : v.my_max != null ? "outbid" : "none";
  if (v.won) return "won";
  return v.my_max != null ? "lost" : "ended";
}

/** 판매자가 다시 경매·일반 전환을 고를 수 있는가(0047 auction_relistable 과 같은 조건, 가장 최근 경매일 때) */
export const sellerCanRelist = (status: AuctionStatus, listingStatus: string) =>
  status === "unsold" || status === "unpaid" || status === "cancelled" || (status === "paid" && listingStatus === "active");

/** 마이페이지 할 일: 내가 낙찰했고 기한 안에 결제해야 하는 건수(my_auction_bids 행) */
export const payNeededCount = (rows: { won: boolean; status: string; pay_due_at: string | null }[], now: number) =>
  rows.filter((a) => a.won && a.status === "awaiting_payment" && !!a.pay_due_at && new Date(a.pay_due_at).getTime() > now).length;

/** 마이페이지 할 일: 유찰·미결제로 끝나 판매자가 다시 경매/전환을 골라야 하는 상품 수.
 *  rows 는 내 경매(최신순). 같은 상품은 가장 최근 경매만 본다(다시 경매했으면 옛 행은 끝난 일), 일반 전환한 상품은 뺀다 */
export function sellerChoiceCount(rows: { listing_id: string; status: string; listings: { sale_type: string } | null }[]): number {
  const seen = new Set<string>();
  let n = 0;
  for (const a of rows) {
    if (seen.has(a.listing_id)) continue;
    seen.add(a.listing_id);
    if (a.listings?.sale_type === "auction" && (a.status === "unsold" || a.status === "unpaid")) n++;
  }
  return n;
}

/** 현재가의 10배를 넘는 상한은 한 번 더 확인(A-2) */
export const needsBigConfirm = (amount: number, current: number) => current > 0 && amount > current * 10;

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
  ["bid voided", "auction.err.voided"],   // 0048 운영자가 무효 처리한 입찰자
  ["auction listing", "auction.err.useAuction"],
];
export function auctionErrorKey(msg: string): I18nKey {
  return ERRORS.find(([m]) => msg.includes(m))?.[1] ?? "auction.err.generic";
}
const STATUS_409 = new Set<I18nKey>(["auction.err.ended", "auction.err.tooLow", "auction.err.alreadyOpen", "auction.err.hasBids", "auction.err.payClosed", "auction.err.listing"]);
export const auctionErrorStatus = (k: I18nKey) => (k === "auction.err.login" ? 401 : k === "auction.err.notFound" ? 404 : STATUS_409.has(k) ? 409 : 400);
