import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/listings";
import { translateTexts } from "@/lib/translate";
import { apiError, reqLang } from "@/lib/api-error";

export const runtime = "nodejs";

const UUID = /^[0-9a-f-]{36}$/;

// 운영자 상품 제목·가격 수정 — 검사·기록은 DB(admin_update_listing, 0037, 운영자 세션)가 한다.
// 제목이 바뀌면 상대 언어 번역 제목도 갱신한다(번역 행은 판매자만 쓸 수 있어 service_role). 번역 실패해도 수정은 유지된다.
export async function POST(req: Request) {
  const lang = reqLang(req);
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer?.isAdmin) return apiError(lang, "admin.err.adminOnly", 403);

  const b = await req.json().catch(() => ({}));
  const id = String(b.id ?? "");
  if (!UUID.test(id)) return apiError(lang, "admin.err.invalid", 400);
  const title = typeof b.title === "string" ? b.title.trim() : null;
  const price = b.price == null || b.price === "" ? null : Number(b.price);
  if (title != null && (title.length < 1 || title.length > 80)) return apiError(lang, "admin.err.title", 400);
  if (price != null && (!Number.isInteger(price) || price < 0 || price > 100_000_000)) return apiError(lang, "admin.err.price", 400);
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) : "";

  const { data: before } = await supabase.from("listings").select("title, source_language").eq("id", id).maybeSingle();
  if (!before) return apiError(lang, "admin.err.notFound", 404);

  const { data, error } = await supabase.rpc("admin_update_listing", { p_id: id, p_title: title, p_price: price, p_note: note });
  if (error) {
    if (/active transaction/.test(error.message)) return apiError(lang, "admin.err.activeTx", 409);
    if (/nothing to change/.test(error.message)) return apiError(lang, "admin.err.noChange", 400);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const after = data as { title: string; price: number } | null;

  let translated: boolean | null = null;
  if (after && after.title !== before.title) {
    const from = before.source_language === "ja" ? "ja" : "ko";
    const to = from === "ko" ? "ja" : "ko";
    const out = await translateTexts([after.title], from, to);
    translated = false;
    if (out?.[0] && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { error: tErr } = await createAdminSupabase().from("listing_translations")
        .update({ title: out[0] }).eq("listing_id", id).eq("language", to);
      translated = !tErr;
    }
  }
  return NextResponse.json({ ok: true, title: after?.title, price: after?.price, translated });
}
