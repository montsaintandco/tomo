// 마이페이지 미확인 숫자 — 메뉴 배지(레이아웃·홈 목록)와 홈 「할 일」이 같은 숫자를 본다. 서버 전용.
// 진행 보드 단계 묶기(progressCounts)는 순수 함수라 tests/unit/my-progress.test.ts 가 본다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { auctionEnabled, payNeededCount, sellerChoiceCount } from "@/lib/auction";

// auctions = auctionPay(낙찰 결제 필요) + auctionChoice(유찰·미결제 뒤 선택 필요). 플래그가 꺼지면 0(조회도 안 한다)
export type MyBadges = { orders: number; sales: number; offers: number; notifications: number; auctions: number; auctionPay: number; auctionChoice: number };
export type BadgeKey = keyof MyBadges;

const RECEIVE = ["shipped", "shipped_international", "delivered"];

export async function myBadges(supabase: SupabaseClient, me: string): Promise<MyBadges> {
  const [ship, receive, offersIn, unread, { pay, choice }] = await Promise.all([
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("seller_id", me).eq("status", "paid"),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("buyer_id", me).in("status", RECEIVE),
    supabase.from("offers").select("id, listings!inner(seller_id)", { count: "exact", head: true }).eq("listings.seller_id", me).eq("status", "pending"),
    supabase.rpc("unread_notifications"), // 0027 미적용·오류면 0
    auctionTodo(supabase, me),
  ]);
  return {
    orders: receive.count ?? 0,
    sales: ship.count ?? 0,
    offers: offersIn.count ?? 0,
    notifications: typeof unread.data === "number" ? unread.data : 0,
    auctions: pay + choice, auctionPay: pay, auctionChoice: choice,
  };
}

async function auctionTodo(supabase: SupabaseClient, me: string): Promise<{ pay: number; choice: number }> {
  if (!auctionEnabled()) return { pay: 0, choice: 0 };
  const [bids, mine] = await Promise.all([
    supabase.rpc("my_auction_bids", { p_limit: 100 }),
    supabase.from("auctions").select("listing_id, status, listings(sale_type, status)").eq("seller_id", me).order("created_at", { ascending: false }).limit(200),
  ]);
  return {
    pay: payNeededCount(Array.isArray(bids.data) ? bids.data : [], Date.now()),
    choice: sellerChoiceCount((mine.data ?? []) as unknown as Parameters<typeof sellerChoiceCount>[0]),
  };
}

// ── 진행 보드 — 진행 중인 구매(직거래 transactions + 구매대행 proxy_requests)를 4단계로 묶는다 ──
export const PROGRESS_STEPS = ["paid", "sent", "intl", "arrived"] as const;
export type ProgressStep = (typeof PROGRESS_STEPS)[number];

const TX_STEP: Record<string, ProgressStep> = {
  paid: "paid", shipped: "sent", shipped_to_center: "sent", center_received: "sent",
  shipped_international: "intl", delivered: "arrived",
};
const PROXY_STEP: Record<string, ProgressStep> = {
  paid: "paid", purchasing: "paid", center_received: "sent", shipped_international: "intl", delivered: "arrived",
};
export const TX_PROGRESS = Object.keys(TX_STEP);
export const PROXY_PROGRESS = Object.keys(PROXY_STEP);

/** 단계별 건수. 구매대행은 같은 주문(order_id)을 한 건으로 센다(가장 앞 단계 기준 — 덜 온 상품이 있으면 아직 그 단계) */
export function progressCounts(tx: { status: string }[], proxy: { status: string; order_id: string | null }[]): Record<ProgressStep, number> {
  const out: Record<ProgressStep, number> = { paid: 0, sent: 0, intl: 0, arrived: 0 };
  for (const r of tx) { const s = TX_STEP[r.status]; if (s) out[s]++; }
  const orders = new Map<string, ProgressStep>();
  for (const r of proxy) {
    const s = PROXY_STEP[r.status];
    if (!s) continue;
    if (!r.order_id) { out[s]++; continue; }
    const prev = orders.get(r.order_id);
    if (!prev || PROGRESS_STEPS.indexOf(s) < PROGRESS_STEPS.indexOf(prev)) orders.set(r.order_id, s);
  }
  for (const s of orders.values()) out[s]++;
  return out;
}
