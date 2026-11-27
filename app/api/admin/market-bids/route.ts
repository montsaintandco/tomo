import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/listings";
import { getStripe } from "@/lib/stripe";
import { isMbOp, runMbOp, saveMbSettings } from "@/lib/market-bid-ops";

export const runtime = "nodejs";

// 입찰 대행 운영 조작(M5). 본체는 lib/market-bid-ops.ts(운영 API 와 공용). 운영자 쿠키 세션 = DB 가 운영자·활동 기록을 본다
// body = { id, op: placed|outbid|hold|lost|won|missed|cancel, expected_status, ...값 } 또는 { settings: {...} }
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer?.isAdmin) return NextResponse.json({ error: "admin only" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.settings && typeof b.settings === "object") {
    const r = await saveMbSettings(supabase, b.settings as Record<string, unknown>);
    return NextResponse.json(r.body, { status: r.status });
  }
  const id = String(b.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !isMbOp(b.op)) return NextResponse.json({ error: "invalid id/op" }, { status: 400 });
  const expected = typeof b.expected_status === "string" && b.expected_status ? b.expected_status : null;
  const r = await runMbOp(supabase, createAdminSupabase(), getStripe(), id, b.op, b, expected);
  return NextResponse.json(r.body, { status: r.status });
}
