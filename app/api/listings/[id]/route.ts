import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { translateListing } from "@/lib/translate";

const CATEGORIES = ["figure","camera","fashion","kpop","game","vintage","etc"];
const METHODS = ["direct","shipping","both"];
const CONDITIONS = ["new","like_new","good","fair","poor"];
const PAYERS = ["seller","buyer"];
const SHIP_DAYS = ["1_2","2_3","4_7"];

// 내 상품 수정 — RLS(update own listing)가 소유권을 지키고, 여기선 검증 + 번역 갱신만
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { title, description, price, category, tradeMethod, crossBorder, images,
    condition, shippingPayer, shipDays, allowOffers } = body;
  if (!title || typeof title !== "string" || title.length > 80 ||
      !description || typeof description !== "string" || description.length > 2000 ||
      !Number.isInteger(price) || price < 0 || price > 100000000)
    return NextResponse.json({ error: "invalid fields" }, { status: 400 });
  if (!CATEGORIES.includes(category) || !METHODS.includes(tradeMethod) ||
      !CONDITIONS.includes(condition) || !PAYERS.includes(shippingPayer) || !SHIP_DAYS.includes(shipDays))
    return NextResponse.json({ error: "invalid fields" }, { status: 400 });

  const { data: current } = await supabase.from("listings").select("seller_id, source_language").eq("id", id).maybeSingle();
  if (!current || current.seller_id !== auth.user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const patch: Record<string, unknown> = {
    title, description, price, category, trade_method: tradeMethod, cross_border_enabled: !!crossBorder,
    condition, shipping_payer: shippingPayer, ship_days: shipDays, allow_offers: price > 0 && !!allowOffers,
  };
  if (Array.isArray(images) && images.length > 0) patch.images = images.slice(0, 5);

  const { error } = await supabase.from("listings").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // 제목·설명이 바뀌었으니 상대 언어 번역도 갱신 (실패해도 수정은 유지)
  const from = current.source_language as "ko" | "ja";
  const translated = await translateListing({ title, description, from });
  if (translated) {
    await supabase.from("listing_translations").upsert({
      listing_id: id, language: from === "ko" ? "ja" : "ko",
      title: translated.title, description: translated.description,
    }, { onConflict: "listing_id,language" });
  }
  return NextResponse.json({ id });
}
