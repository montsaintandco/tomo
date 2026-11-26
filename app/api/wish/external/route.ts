import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { allow } from "@/lib/ratelimit";
import { apiError, reqLang } from "@/lib/api-error";
import { tableMissing } from "@/lib/safe";
import { parseKeys, parseWish, validId, validSource, wishKey } from "@/components/search/wish";

// 해외 상품 찜(0038 external_wishlists). 로그인 세션으로 쓰고 RLS 가 본인 행만 허용한다.
//   GET ?keys=source:id,...  → { keys: [찜한 키] }   (카드 묶음 조회, 최대 100개)
//   GET (keys 없음)          → { items: [최근 100건] }
//   POST { source, sourceId, title, price, currency, thumb } → 찜(이미 찜이면 성공)
//   DELETE ?source=&id=      → 해제
async function auth(req: Request) {
  const lang = reqLang(req);
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return { lang, supabase, user: data.user };
}

export async function GET(req: Request) {
  const { lang, supabase, user } = await auth(req);
  if (!user) return apiError(lang, "search.wishErr.login", 401);
  const sp = new URL(req.url).searchParams;
  if (sp.has("keys")) {
    const keys = parseKeys(sp.get("keys"));
    if (keys.length === 0) return NextResponse.json({ keys: [] });
    const { data, error } = await supabase.from("external_wishlists").select("source, source_id")
      .eq("user_id", user.id).in("source_id", keys.map((k) => k.sourceId));
    if (error) return tableMissing(error) ? NextResponse.json({ keys: [] }) : apiError(lang, "search.wishErr.failed", 500);
    const want = new Set(keys.map((k) => wishKey(k.source, k.sourceId)));
    return NextResponse.json({ keys: (data ?? []).map((r) => wishKey(r.source, r.source_id)).filter((k) => want.has(k)) });
  }
  const { data, error } = await supabase.from("external_wishlists")
    .select("source, source_id, title, price, currency, thumb, created_at")
    .eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (error) return tableMissing(error) ? NextResponse.json({ items: [] }) : apiError(lang, "search.wishErr.failed", 500);
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  const { lang, supabase, user } = await auth(req);
  if (!user) return apiError(lang, "search.wishErr.login", 401);
  if (!allow(`xwish:${user.id}`, 60)) return apiError(lang, "search.wishErr.tooMany", 429);
  const w = parseWish(await req.json().catch(() => null));
  if (!w) return apiError(lang, "search.wishErr.invalid", 400);
  const { error } = await supabase.from("external_wishlists").insert({
    user_id: user.id, source: w.source, source_id: w.sourceId, title: w.title, price: w.price, currency: w.currency, thumb: w.thumb,
  });
  if (error && error.code !== "23505") { // 이미 찜한 경우는 성공으로 본다
    return apiError(lang, tableMissing(error) ? "search.wishErr.notReady" : "search.wishErr.failed", tableMissing(error) ? 503 : 400);
  }
  return NextResponse.json({ wished: true });
}

export async function DELETE(req: Request) {
  const { lang, supabase, user } = await auth(req);
  if (!user) return apiError(lang, "search.wishErr.login", 401);
  if (!allow(`xwish:${user.id}`, 60)) return apiError(lang, "search.wishErr.tooMany", 429);
  const sp = new URL(req.url).searchParams;
  const source = sp.get("source"), id = sp.get("id");
  if (!validSource(source) || !validId(id)) return apiError(lang, "search.wishErr.invalid", 400);
  const { error } = await supabase.from("external_wishlists").delete().eq("user_id", user.id).eq("source", source).eq("source_id", id);
  if (error) return apiError(lang, tableMissing(error) ? "search.wishErr.notReady" : "search.wishErr.failed", tableMissing(error) ? 503 : 400);
  return NextResponse.json({ wished: false });
}
