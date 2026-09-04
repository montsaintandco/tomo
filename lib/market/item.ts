import type { SupabaseClient } from "@supabase/supabase-js";
import { mercariItem } from "@/lib/market/mercari";
import { yahooAuctionItem } from "@/lib/market/yahoo-auction";
import { daangnItem } from "@/lib/market/daangn";
import { joongnaItem } from "@/lib/market/joongna";
import { LIVE_SOURCES, SOURCE_CURRENCY, type MarketSource, type MarketItemDetail } from "@/lib/market/types";

export async function loadItem(source: MarketSource, id: string): Promise<MarketItemDetail | null> {
  try {
    if (source === "mercari") return await mercariItem(id);
    if (source === "yahoo_auction") return await yahooAuctionItem(id);
    if (source === "daangn") return await daangnItem(id);
    if (source === "joongna") return await joongnaItem(id);
  } catch {
    return null; // 파서 실패·품절·차단 → 캐시 폴백
  }
  return null;
}

// 카트는 주문 시 자동 결제라 가격은 서버가 직접 파싱한 값만 신뢰 — 클라이언트 스냅샷은 견적 경로(proxy)에서만.
export async function upsertExternalItem(
  admin: SupabaseClient,
  source: MarketSource,
  sourceId: string,
  body: { title?: unknown; url?: unknown; images?: unknown; sellerName?: unknown },
  opts: { allowClientSnapshot: boolean }
): Promise<{ id: string } | { error: string; status: number }> {
  const live = LIVE_SOURCES.includes(source) ? await loadItem(source, sourceId) : null;
  const now = new Date().toISOString();

  if (live) {
    const { data, error } = await admin.from("external_items").upsert({
      source, source_id: sourceId, url: live.url, title: live.title,
      price: Math.round(live.price), currency: SOURCE_CURRENCY[source],
      images: live.images.slice(0, 8), seller_name: live.sellerName ?? "",
      status: live.soldOut ? "sold" : "active", fetched_at: now,
    }, { onConflict: "source,source_id" }).select("id").single();
    if (error) return { error: error.message, status: 400 };
    if (live.soldOut && !opts.allowClientSnapshot) return { error: "품절된 상품이에요", status: 409 }; // 카트는 자동 결제라 품절은 담기 단계에서 거부
    return { id: data.id };
  }

  const { data: cached } = await admin.from("external_items").select("id").eq("source", source).eq("source_id", sourceId).maybeSingle();
  if (cached) return { id: cached.id }; // 가격·fetched_at은 건드리지 않음 — RPC의 stale 가드가 이어서 적용

  if (opts.allowClientSnapshot) {
    const { title, url, images, sellerName } = body;
    if (typeof title !== "string" || !title || typeof url !== "string") return { error: "invalid item", status: 400 };
    const p = Number((body as { price?: unknown }).price);
    if (!Number.isFinite(p) || p < 0) return { error: "invalid price", status: 400 };
    const { data, error } = await admin.from("external_items").upsert({
      source, source_id: sourceId, url, title, price: Math.round(p), currency: SOURCE_CURRENCY[source],
      images: Array.isArray(images) ? images.slice(0, 8) : [],
      seller_name: typeof sellerName === "string" ? sellerName : "",
      // 클라이언트 스냅샷은 견적 전용 — fetched_at을 과거로 박아 RPC stale 가드가 카트 주문을 막게 함 (라이브 파싱 성공 시 덮어씀)
      status: "active", fetched_at: new Date(0).toISOString(),
    }, { onConflict: "source,source_id" }).select("id").single();
    if (error) return { error: error.message, status: 400 };
    return { id: data.id };
  }

  return { error: "상품 정보를 확인할 수 없어요. 상세 페이지에서 다시 시도해 주세요.", status: 409 };
}
