import type { SupabaseClient } from "@supabase/supabase-js";
import { loadItem } from "./market/item";
import { LIVE_SOURCES, type MarketSource, type MarketItemDetail } from "./market/types";

// 결제 직전 재확인(03#9). /api/order 가 create_proxy_order 전에 부른다.
// 마켓을 다시 읽어 external_items 를 갱신하고, 고객이 본 가격(seen)과 비교한다.
// 오름·품절·확인 불가는 결제를 멈춘다. 내림은 그대로 진행한다(새 가격으로 주문된다).

// DB create_proxy_order(0035)의 신선도 기준과 같다. 바꾸면 SQL 도 같이 바꾼다.
export const ORDER_FRESH_MS = 15 * 60_000;

export type RecheckKind = "ok" | "down" | "up" | "sold" | "unverified" | "auction";
export type Cached = { price: number; status: string; fetchedAt: string };
export type Live = { price: number; soldOut: boolean; auction?: boolean } | null;

// 순수 판정. live=null 은 다시 읽지 못한 것(파서 실패·차단·지원 안 하는 마켓).
// 다시 못 읽어도 마지막 확인이 15분 안이면 그 값을 믿는다(DB 기준과 같다).
export function recheckDecision(seen: number, cached: Cached, live: Live, now: number): { kind: RecheckKind; price: number } {
  let price: number;
  // 경매는 가격·품절보다 먼저 막는다(B0) — 이미 장바구니에 담긴 것도 결제 직전에 거부
  if (live?.auction) return { kind: "auction", price: Math.round(Number(live.price) || cached.price) };
  if (live && Number.isFinite(live.price) && live.price > 0) {
    if (live.soldOut) return { kind: "sold", price: Math.round(live.price) };
    price = Math.round(live.price);
  } else if (live?.soldOut) {
    return { kind: "sold", price: cached.price };
  } else {
    if (cached.status === "sold") return { kind: "sold", price: cached.price };
    const at = new Date(cached.fetchedAt).getTime();
    if (!Number.isFinite(at) || now - at > ORDER_FRESH_MS) return { kind: "unverified", price: cached.price };
    price = cached.price;
  }
  if (price > seen) return { kind: "up", price };
  if (price < seen) return { kind: "down", price };
  return { kind: "ok", price };
}

export const BLOCKING: readonly RecheckKind[] = ["up", "sold", "unverified", "auction"];

export type RecheckRow = { id: string; source: MarketSource; source_id: string; title: string; price: number; currency: "KRW" | "JPY"; status: string; fetched_at: string };
export type RecheckChange = { id: string; title: string; kind: RecheckKind; from: number; to: number; currency: "KRW" | "JPY" };

const CONCURRENCY = 4; // 마켓이 서버 IP 를 막지 않게 한 번에 4개씩

// rows: 주문할 항목(본인 장바구니에서 읽은 것). seen: 고객 화면 가격(항목 통화). 없으면 DB 가격과 비교.
// 다시 읽은 값은 service_role(admin)로 external_items 에 적는다. 적기에 실패하면 throw(호출 측 503).
export async function recheckItems(admin: SupabaseClient, rows: RecheckRow[], seen: Record<string, unknown>, now = Date.now()): Promise<RecheckChange[]> {
  const out: RecheckChange[] = [];
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const lives = await Promise.all(batch.map((r) => (LIVE_SOURCES.includes(r.source) ? loadItem(r.source, r.source_id) : Promise.resolve(null))));
    for (let j = 0; j < batch.length; j++) {
      const r = batch[j];
      const live: MarketItemDetail | null = lives[j];
      const s = Number(seen[r.id]);
      const shown = Number.isFinite(s) && s >= 0 ? s : r.price;
      const d = recheckDecision(shown, { price: r.price, status: r.status, fetchedAt: r.fetched_at }, live ? { price: live.price, soldOut: !!live.soldOut, auction: !!live.auction } : null, now);
      const priced = !!live && Number.isFinite(live.price) && live.price > 0;
      // 경매는 fetched_at 을 새로 쓰지 않는다(다음 재확인이 마켓을 못 읽어도 신선한 캐시로 통과하지 않게)
      if (live && !live.auction && (priced || live.soldOut)) {
        const { error } = await admin.from("external_items")
          .update({ ...(priced ? { price: Math.round(live.price) } : {}), status: live.soldOut ? "sold" : "active", fetched_at: new Date(now).toISOString() })
          .eq("id", r.id);
        if (error) throw new Error(`recheck write failed: ${error.message}`);
      }
      out.push({ id: r.id, title: r.title, kind: d.kind, from: shown, to: d.price, currency: r.currency });
    }
  }
  return out;
}
