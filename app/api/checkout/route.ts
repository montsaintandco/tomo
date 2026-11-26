import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getStripe, krwAmount, createSession } from "@/lib/stripe";

// 미들웨어 밖 — 자체 인증. Stripe 키 없으면 503 (스펙 §9 graceful).
// 거래 생성 후 Stripe 결제창 URL을 내려주고, 확정은 /api/stripe/return(성공 리다이렉트)·웹훅에서 금액 대조 후
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { listingId, intlShippingFee, meetup, transactionId } = await req.json().catch(() => ({}));
  if (typeof listingId !== "string" && typeof transactionId !== "string")
    return NextResponse.json({ error: "invalid listingId" }, { status: 400 });

  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "결제 준비 중" }, { status: 503 });

  type Tx = { id: string; item_price: number; intl_shipping_fee: number; is_cross_border: boolean; currency: string; meetup: boolean; status: string; created_at?: string; stripe_session_id?: string | null };
  let tx: Tx;
  if (typeof transactionId === "string") {
    // 결제 대기 거래 재결제 — RLS가 당사자만 읽게 하고, 구매자·대기 상태만 연다
    const { data } = await supabase.from("transactions").select("id, item_price, intl_shipping_fee, is_cross_border, currency, meetup, status, buyer_id, created_at, stripe_session_id").eq("id", transactionId).maybeSingle();
    if (!data || data.buyer_id !== auth.user.id || data.status !== "pending_payment") return NextResponse.json({ error: "not payable" }, { status: 400 });
    tx = data;
  } else {
    // 거래 생성 + 예약 선점 + 수수료 계산 (DB가 소유권·경합 검증)
    // ponytail: intlShippingFee 미전달 시 0. 국제배송비 견적 UI는 별도(견적 소스 없음) → 생기면 연결
    const { data, error } = await supabase.rpc("start_transaction", {
      p_listing_id: listingId, p_intl_shipping_fee: Number(intlShippingFee) || 0, p_meetup: !!meetup,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    tx = data;
  }

  // 재결제: 열려 있는 결제창이 있으면 그대로 다시 연다. 새 창은 거래 생성 10분 안에만 연다
  // (창은 30분 열리고 DB 예약은 45분 유지 — 0031. 늦게 연 창으로 결제하면 예약이 풀린 뒤라 자동 환불되기 때문)
  if (tx.stripe_session_id?.startsWith("cs_")) {
    const prev = await stripe.checkout.sessions.retrieve(tx.stripe_session_id).catch(() => null);
    if (prev?.status === "open" && prev.url) return NextResponse.json({ url: prev.url, transactionId: tx.id });
    if (prev?.status === "complete") return NextResponse.json({ url: `/api/stripe/return?session_id=${prev.id}`, transactionId: tx.id });
  }
  if (tx.created_at && Date.now() - new Date(tx.created_at).getTime() > 10 * 60_000)
    return NextResponse.json({ error: "결제 가능 시간이 지났어요. 상품 페이지에서 다시 구매해 주세요." }, { status: 400 });

  const base = tx.item_price + (tx.is_cross_border ? tx.intl_shipping_fee : 0);
  const amount = await krwAmount(supabase, base, tx.currency);
  if (amount == null) return NextResponse.json({ error: "결제 준비 중" }, { status: 503 });

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.headers.get("origin") ?? new URL(req.url).origin;
  const { data: profile } = await supabase.from("profiles").select("language").eq("id", auth.user.id).maybeSingle();
  let session;
  try {
    session = await createSession(stripe, {
      kind: "tx", id: tx.id, amount, base, cur: tx.currency, method: "card", lang: profile?.language === "ja" ? "ja" : "ko",
      email: auth.user.email, name: tx.meetup ? "TOMO 안전결제 (만남 거래)" : "TOMO 안전결제", origin, back: `/transactions/${tx.id}`,
    });
  } catch {
    return NextResponse.json({ error: "결제 세션 생성 실패", transactionId: tx.id }, { status: 400 });
  }
  // 확정은 이 창 id가 거래에 적혀 있어야 한다(옛 창 결제는 자동 환불). 기록 못 하면 창을 닫고 열지 않는다
  const { data: updated, error: upErr } = await createAdminSupabase().from("transactions")
    .update({ stripe_session_id: session.id }).eq("id", tx.id).eq("status", "pending_payment").select("id");
  if (upErr || !updated || updated.length === 0) {
    await stripe.checkout.sessions.expire(session.id).catch(() => {});
    return NextResponse.json({ error: "결제 준비 중", transactionId: tx.id }, { status: 503 });
  }
  if (tx.stripe_session_id?.startsWith("cs_")) await stripe.checkout.sessions.expire(tx.stripe_session_id).catch(() => {});
  return NextResponse.json({ url: session.url, transactionId: tx.id });
}