import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

// API 라우트는 미들웨어 보호 밖 — 자체 인증 필수 (HANDOFF 주의사항).
// Stripe 키 미설정 시 503 "결제 준비 중"으로 graceful degrade (스펙 §9).
// 전체 Checkout 세션 로직(start_transaction → Stripe → attach_payment_intent → {url})은
// Plan 04 Task 2에서 완성 (STRIPE_SECRET_KEY 확보 후).
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { listingId } = await req.json().catch(() => ({}));
  if (typeof listingId !== "string")
    return NextResponse.json({ error: "invalid listingId" }, { status: 400 });

  if (!process.env.STRIPE_SECRET_KEY)
    return NextResponse.json({ error: "결제 준비 중" }, { status: 503 });

  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
