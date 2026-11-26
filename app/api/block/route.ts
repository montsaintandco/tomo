import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { allow } from "@/lib/ratelimit";
import { apiError, reqLang } from "@/lib/api-error";
import { tableMissing } from "@/lib/safe";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 차단·해제 — POST { userId, block: boolean } → block_user / unblock_user RPC(0033).
// 실제 차단 효과(대화·메시지·가격제안 금지)는 DB 정책이 건다.
export async function POST(req: Request) {
  const lang = reqLang(req);
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return apiError(lang, "trust.err.login", 401);
  if (!allow(`block:${auth.user.id}`, 20)) return apiError(lang, "trust.err.tooMany", 429);

  const { userId, block } = await req.json().catch(() => ({}));
  if (typeof userId !== "string" || !UUID.test(userId) || typeof block !== "boolean") return apiError(lang, "trust.err.invalid", 400);
  if (userId === auth.user.id) return apiError(lang, "trust.err.self", 400);

  const { error } = await supabase.rpc(block ? "block_user" : "unblock_user", { p_id: userId });
  if (error) {
    if (tableMissing(error)) return apiError(lang, "trust.err.notReady", 503);
    if ((error.message ?? "").includes("not found")) return apiError(lang, "trust.err.notFound", 404);
    return apiError(lang, "trust.err.failed", 400);
  }
  return NextResponse.json({ blocked: block });
}
