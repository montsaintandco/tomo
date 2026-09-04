import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs"; // stripe SDK + raw body

// Stripe webhook: 서명 검증 → checkout 완료 시 결제확정(멱등). RLS·미들웨어 밖, 서명으로 인증.
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "no signature" }, { status: 400 });

  const body = await req.text(); // raw body for signature verification
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as { id: string; metadata?: { transaction_id?: string; proxy_order_id?: string }; payment_intent?: string | { id: string } | null };
    const txId = s.metadata?.transaction_id;
    const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
    if (txId && pi) {
      const admin = createAdminSupabase();
      // PI 기록(멱등: pending일 때만) 후 결제확정. mark_paid는 stripe_payment_intent_id UNIQUE로 재시도 안전
      await admin.from("transactions").update({ stripe_payment_intent_id: pi })
        .eq("id", txId).eq("status", "pending_payment");
      await admin.rpc("mark_paid", { p_payment_intent_id: pi });
    }
    const orderId = s.metadata?.proxy_order_id;
    if (orderId && !pi) console.error("[stripe webhook] proxy order session completed without payment_intent", { orderId, session: s.id });
    if (orderId && pi) {
      const { data } = await createAdminSupabase().rpc("mark_proxy_order_paid", { p_session_id: s.id, p_payment_intent_id: pi });
      if (data?.status !== "paid") console.error("[stripe webhook] proxy order not paid after checkout", { orderId, session: s.id, status: data?.status });
    }
  }
  return NextResponse.json({ received: true });
}
