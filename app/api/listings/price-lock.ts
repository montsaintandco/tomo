import type { SupabaseClient } from "@supabase/supabase-js";

// 판매자 가격 잠금 — 어드민 RPC admin_update_listing(0037)과 같은 규칙.
// 예약중이거나 진행 중 거래(완료·취소가 아닌 거래)가 있으면 가격을 바꿀 수 없다. DB 쪽 최종 방어는 0039 트리거.
export type PriceLock = "reserved" | "activeTx" | "unknown" | null;

export function priceLock(status: string, activeTx: number | null): PriceLock {
  if (status === "reserved") return "reserved";
  if (activeTx === null) return "unknown"; // 조회 실패 — 가격 변경만 막는다(안전 쪽)
  return activeTx > 0 ? "activeTx" : null;
}

export async function loadPriceLock(sb: SupabaseClient, listingId: string, status: string): Promise<PriceLock> {
  if (status === "reserved") return "reserved";
  const { count, error } = await sb.from("transactions").select("id", { count: "exact", head: true })
    .eq("listing_id", listingId).not("status", "in", "(completed,cancelled)");
  return priceLock(status, error ? null : (count ?? 0));
}

export const PRICE_LOCK_ERR = { reserved: "pay.err.priceReserved", activeTx: "pay.err.priceActiveTx", unknown: "pay.err.priceUnknown" } as const;
