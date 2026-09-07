import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { upsertExternalItem } from "@/lib/market/item";
import { SOURCE_LABEL, type MarketSource } from "@/lib/market/types";
import { allow } from "@/lib/ratelimit";

export const runtime = "nodejs";

// 구매대행 신청: 외부 상품 스냅샷 저장(upsert) → request_proxy RPC
// 미들웨어 밖 — 자체 인증 (HANDOFF 규칙)
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!allow(`proxy:${auth.user.id}`, 20)) return NextResponse.json({ error: "too many requests" }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const { source, sourceId, note } = body;
  if (!SOURCE_LABEL[source as MarketSource] || typeof sourceId !== "string" || !sourceId)
    return NextResponse.json({ error: "invalid source" }, { status: 400 });

  // external_items 쓰기는 admin RLS — 서버(service_role)로 upsert.
  // 실파싱 실패·캐시도 없으면 관리자가 가격을 직접 입력한 스냅샷을 허용 (견적 경로라 안전)
  let itemId: string;
  try {
    const admin = createAdminSupabase();
    const result = await upsertExternalItem(admin, source, sourceId, body, { allowClientSnapshot: true });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    itemId = result.id;
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
