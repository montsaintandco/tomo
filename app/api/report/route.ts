import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { allow } from "@/lib/ratelimit";
import { apiError, reqLang } from "@/lib/api-error";
import { tableMissing } from "@/lib/safe";

const TYPES = ["listing", "user", "conversation"];
const REASONS = ["spam", "fraud", "prohibited", "abuse", "other"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 신고 접수 — POST { targetType, targetId, reason, detail? } → report_target RPC(0033).
// 같은 대상은 1인 1건(RPC 가 기존 건을 돌려준다), 분당 5건은 메모리 + DB 둘 다 막는다.
export async function POST(req: Request) {
  const lang = reqLang(req);
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return apiError(lang, "trust.err.login", 401);
  if (!allow(`report:${auth.user.id}`, 5)) return apiError(lang, "trust.err.tooMany", 429);

  const { targetType, targetId, reason, detail } = await req.json().catch(() => ({}));
  if (!TYPES.includes(targetType) || typeof targetId !== "string" || !UUID.test(targetId) || !REASONS.includes(reason)
    || (detail !== undefined && typeof detail !== "string"))
    return apiError(lang, "trust.err.invalid", 400);

  const { data, error } = await supabase.rpc("report_target", {
    p_type: targetType, p_id: targetId, p_reason: reason, p_detail: (detail ?? "").slice(0, 1000),
  });
  if (error) {
    if (tableMissing(error)) return apiError(lang, "trust.err.notReady", 503);
    const m = error.message ?? "";
    if (m.includes("too many")) return apiError(lang, "trust.err.tooMany", 429);
    if (m.includes("not found")) return apiError(lang, "trust.err.notFound", 404);
    if (m.includes("self")) return apiError(lang, "trust.err.self", 400);
    return apiError(lang, "trust.err.failed", 400);
  }
  return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 });
}
