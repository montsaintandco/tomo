import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { upsertExternalItem } from "@/lib/market/item";
import { SOURCE_LABEL, type MarketSource } from "@/lib/market/types";
import { allow } from "@/lib/ratelimit";
import { apiError, reqLang } from "@/lib/api-error";

export const runtime = "nodejs";

// 장바구니 담기: 외부 상품 스냅샷 upsert(service_role) → cart_items insert(본인 RLS). 미들웨어 밖 — 자체 인증
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const lang = reqLang(req);
  if (!auth.user) return apiError(lang, "pay.err.unauthorized", 401);
  if (!allow(`cart:${auth.user.id}`, 40)) return apiError(lang, "pay.err.busy", 429);

  const body = await req.json().catch(() => ({}));
  const { source, sourceId } = body;
  if (!SOURCE_LABEL[source as MarketSource] || typeof sourceId !== "string" || !sourceId)
    return apiError(lang, "pay.err.invalidSource");

  let itemId: string;
  try {
    const admin = createAdminSupabase();
    const result = await upsertExternalItem(admin, source, sourceId, body, { allowClientSnapshot: false });
    // upsertExternalItem 문구는 한국어 고정 — 상태로 언어별 키를 고른다(409 품절 / 409 확인 불가 / 그 밖)
    if ("error" in result) {
      if ("code" in result && result.code === "auction") return apiError(lang, "pay.err.auction", 409);
      if (result.status === 409) return apiError(lang, result.error.includes("품절") ? "pay.err.soldOut" : "pay.err.cannotVerify", 409);
      return apiError(lang, "pay.err.cart", result.status);
    }
    itemId = result.id;
  } catch {
    return apiError(lang, "pay.err.cartNotReady", 503);
  }

  const { error } = await supabase.from("cart_items").upsert({ user_id: auth.user.id, external_item_id: itemId }, { onConflict: "user_id,external_item_id", ignoreDuplicates: true });
  if (error) return apiError(lang, "pay.err.cart");
  const { count } = await supabase.from("cart_items").select("*", { count: "exact", head: true }).eq("user_id", auth.user.id);
  return NextResponse.json({ itemId, count: count ?? 0 }, { status: 201 });
}
