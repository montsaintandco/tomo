import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { runRefund } from "@/lib/refunds";

export const runtime = "nodejs";

// 환불 대기열 「다시 시도」 — 같은 환불 id를 Idempotency-Key로 보내므로 두 번 눌러도 이중 환불되지 않는다
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer?.isAdmin) return NextResponse.json({ error: "admin only" }, { status: 403 });
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const result = await runRefund(id);
  return NextResponse.json({ id, ...result }, { status: result.status === "done" ? 200 : 202 });
}
