import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { settleSession } from "@/lib/stripe-settle";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs"; // raw body로 서명 검증

// Stripe 웹훅: 서명 검증 → 결제 완료 세션 확정(멱등). 성공 리다이렉트를 못 탄 결제(창 닫음·네트워크)를 여기서 잡는다.
// 확정 중 DB·Stripe 오류는 500 → Stripe가 최대 3일 동안 다시 보낸다.
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "no signature" }, { status: 400 });

  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(await req.text(), sig, secret); }
  catch { return NextResponse.json({ error: "bad signature" }, { status: 400 }); }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    try {
      const r = await settleSession(stripe, createAdminSupabase(), event.data.object as Stripe.Checkout.Session);
      if (r && r.status !== "paid" && r.status !== "unpaid") console.error("[stripe webhook]", r);
    } catch (e) {
      console.error("[stripe webhook] settle error → retry", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "retry" }, { status: 500 });
    }
  }
  return NextResponse.json({ received: true });
}