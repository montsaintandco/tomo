import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { SOURCE_LABEL, type MarketSource } from "@/lib/market/types";

export const runtime = "nodejs";

// 구매대행 신청: 외부 상품 스냅샷 저장(upsert) → request_proxy RPC
// 미들웨어 밖 — 자체 인증 (HANDOFF 규칙)
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { source, sourceId, title, price, currency, url, images, sellerName, note } = body;
  if (!SOURCE_LABEL[source as MarketSource] || typeof sourceId !== "string" || !sourceId)
    return NextResponse.json({ error: "invalid source" }, { status: 400 });
  if (typeof title !== "string" || !title || typeof url !== "string")
    return NextResponse.json({ error: "invalid item" }, { status: 400 });
  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) return NextResponse.json({ error: "invalid price" }, { status: 400 });
  if (currency !== "JPY" && currency !== "KRW")
    return NextResponse.json({ error: "invalid currency" }, { status: 400 });

  // external_items 쓰기는 admin RLS — 서버(service_role)로 upsert.
  // 키 없으면 캐시 없이 진행 불가하므로 안내
  let itemId: string;
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin.from("external_items").upsert({
      source, source_id: sourceId, url, title,
      price: Math.round(p), currency,
      images: Array.isArray(images) ? images.slice(0, 8) : [],
      seller_name: typeof sellerName === "string" ? sellerName : "",
      status: "active", fetched_at: new Date().toISOString(),
    }, { onConflict: "source,source_id" }).select("id").single();
    if (error) throw error;
    itemId = data.id;
  } catch {
    return NextResponse.json({ error: "대행 신청 준비 중이에요 (서버 설정 필요)" }, { status: 503 });
  }

  const { data: request, error } = await supabase.rpc("request_proxy", {
    p_external_item_id: itemId,
    p_note: typeof note === "string" ? note.slice(0, 500) : "",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: request.id }, { status: 201 });
}
