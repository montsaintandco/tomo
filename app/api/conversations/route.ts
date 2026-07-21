import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

// API 라우트는 미들웨어 보호 밖 — 자체 인증 필수 (HANDOFF 주의사항)
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { listingId } = await req.json().catch(() => ({}));
  if (typeof listingId !== "string")
    return NextResponse.json({ error: "invalid listingId" }, { status: 400 });

  const { data: listing } = await supabase.from("listings")
    .select("id, seller_id").eq("id", listingId).maybeSingle();
  if (!listing) return NextResponse.json({ error: "listing not found" }, { status: 404 });
  if (listing.seller_id === auth.user.id)
    return NextResponse.json({ error: "cannot chat on own listing" }, { status: 400 });

  const { data: existing } = await supabase.from("conversations")
    .select("id").eq("listing_id", listingId).eq("buyer_id", auth.user.id).maybeSingle();
  if (existing) return NextResponse.json({ id: existing.id });

  const { data: created, error } = await supabase.from("conversations").insert({
    listing_id: listingId, buyer_id: auth.user.id, seller_id: listing.seller_id,
  }).select("id").single();
  if (error) {
    // unique(listing_id, buyer_id) 경합 → 재조회
    const { data: retry } = await supabase.from("conversations")
      .select("id").eq("listing_id", listingId).eq("buyer_id", auth.user.id).maybeSingle();
    if (retry) return NextResponse.json({ id: retry.id });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ id: created.id }, { status: 201 });
}
