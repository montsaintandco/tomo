import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { upsertExternalItem } from "@/lib/market/item";
import { SOURCE_LABEL, type MarketSource } from "@/lib/market/types";

export const runtime = "nodejs";

// 장바구니 담기: 외부 상품 스냅샷 upsert(service_role) → cart_items insert(본인 RLS). 미들웨어 밖 — 자체 인증
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { source, sourceId } = body;
  if (!SOURCE_LABEL[source as MarketSource] || typeof sourceId !== "string" || !sourceId)
    return NextResponse.json({ error: "invalid source" }, { status: 400 });

  let itemId: string;
  try {
    const admin = createAdminSupabase();
    const result = await upsertExternalItem(admin, source, sourceId, body, { allowClientSnapshot: false });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    itemId = result.id;
  } catch {
    return NextResponse.json({ error: "장바구니 준비 중이에요 (서버 설정 필요)" }, { status: 503 });
  }

  const { error } = await supabase.from("cart_items").upsert({ user_id: auth.user.id, external_item_id: itemId }, { onConflict: "user_id,external_item_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { count } = await supabase.from("cart_items").select("*", { count: "exact", head: true }).eq("user_id", auth.user.id);
  return NextResponse.json({ itemId, count: count ?? 0 }, { status: 201 });
}
