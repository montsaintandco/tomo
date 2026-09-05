import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { tossKeys, krwAmount, tossOrderId, type TossParams } from "@/lib/toss";

// 미들웨어 밖 — 자체 인증. 토스 키 없으면 503 (스펙 §9 graceful).
// 거래 생성 후 결제창 파라미터를 내려주고, 승인은 /api/toss/confirm(성공 리다이렉트)에서 금액 대조 후 확정
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { listingId, intlShippingFee, meetup, transactionId } = await req.json().catch(() => ({}));
  if (typeof listingId !== "string" && typeof transactionId !== "string")
    return NextResponse.json({ error: "invalid listingId" }, { status: 400 });

  const keys = tossKeys();
  if (!keys) return NextResponse.json({ error: "결제 준비 중" }, { status: 503 });

  type Tx = { id: string; item_price: number; intl_shipping_fee: number; is_cross_border: boolean; currency: string; meetup: boolean; status: string };
  let tx: Tx;
  if (typeof transactionId === "string") {
    // 결제 대기 거래 재결제 — RLS가 당사자만 읽게 하고, 구매자·대기 상태만 연다
    const { data } = await supabase.from("transactions").select("id, item_price, intl_shipping_fee, is_cross_border, currency, meetup, status, buyer_id").eq("id", transactionId).maybeSingle();
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

  const amount = await krwAmount(supabase, tx.item_price + (tx.is_cross_border ? tx.intl_shipping_fee : 0), tx.currency);
  if (amount == null) return NextResponse.json({ error: "결제 준비 중" }, { status: 503 });

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const toss: TossParams = {
    clientKey: keys.clientKey, orderId: tossOrderId.tx(tx.id), amount, customerKey: auth.user.id, method: "card",
    orderName: tx.meetup ? "TOMO 안전결제 (만남 거래)" : "TOMO 안전결제",
    successUrl: `${origin}/api/toss/confirm`,
    failUrl: `${origin}/transactions/${tx.id}?pay=fail`,
  };
  return NextResponse.json({ toss, transactionId: tx.id });
}
