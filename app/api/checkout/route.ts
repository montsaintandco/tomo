import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

// 미들웨어 밖 — 자체 인증. Stripe 키 없으면 503 (스펙 §9 graceful).
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { listingId, intlShippingFee, meetup } = await req.json().catch(() => ({}));
  if (typeof listingId !== "string")
    return NextResponse.json({ error: "invalid listingId" }, { status: 400 });

  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "결제 준비 중" }, { status: 503 });

  // 거래 생성 + 예약 선점 + 수수료 계산 (DB가 소유권·경합 검증)
  // ponytail: intlShippingFee 미전달 시 0. 국제배송비 견적 UI는 별도(견적 소스 없음) → 생기면 연결
  const { data: tx, error } = await supabase.rpc("start_transaction", {
    p_listing_id: listingId, p_intl_shipping_fee: Number(intlShippingFee) || 0, p_meetup: !!meetup,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const amount = tx.item_price + (tx.is_cross_border ? tx.intl_shipping_fee : 0);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: (tx.currency as string).toLowerCase(),
        unit_amount: amount, // KRW/JPY zero-decimal — 원값 그대로
        product_data: { name: tx.meetup ? "TOMO 안전결제 (만남 거래)" : "TOMO 안전결제" },
      },
    }],
    metadata: { transaction_id: tx.id },
    success_url: `${origin}/transactions/${tx.id}`,
    cancel_url: `${origin}/transactions/${tx.id}`,
  });
  return NextResponse.json({ url: session.url });
}
