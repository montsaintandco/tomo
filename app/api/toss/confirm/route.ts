import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { tossKeys, tossConfirm, krwAmount, parseTossOrderId } from "@/lib/toss";

export const runtime = "nodejs";

// 토스 성공 리다이렉트(successUrl?paymentKey&orderId&amount) → DB 금액 대조 → 승인 API → 결제확정(멱등) → 페이지로.
// 미들웨어·RLS 밖(service_role): 인증은 "우리가 만든 orderId + 토스 승인 성공"이 담당. 금액이 다르면 승인하지 않는다.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const paymentKey = url.searchParams.get("paymentKey") ?? "";
  const orderId = url.searchParams.get("orderId") ?? "";
  const amount = Number(url.searchParams.get("amount"));
  const parsed = parseTossOrderId(orderId);
  const keys = tossKeys();
  if (!parsed || !paymentKey || !Number.isFinite(amount) || !keys) return NextResponse.redirect(new URL("/?pay=fail", url.origin));

  const admin = createAdminSupabase();
  const back = parsed.kind === "tx" ? `/transactions/${parsed.id}` : `/order/${parsed.id}`;
  const fail = (code: string) => NextResponse.redirect(new URL(`${back}?pay=fail&code=${encodeURIComponent(code)}`, url.origin));

  // 1. 기대 금액 (DB 기준으로 다시 계산)
  let expected: number | null = null; let pending = false;
  if (parsed.kind === "tx") {
    const { data: tx } = await admin.from("transactions").select("status, currency, item_price, intl_shipping_fee, is_cross_border").eq("id", parsed.id).maybeSingle();
    if (!tx) return fail("NOT_FOUND");
    pending = tx.status === "pending_payment";
    expected = await krwAmount(admin, tx.item_price + (tx.is_cross_border ? tx.intl_shipping_fee : 0), tx.currency);
  } else {
    const { data: o } = await admin.from("proxy_orders").select("status, currency, total, stripe_session_id").eq("id", parsed.id).maybeSingle();
    if (!o || o.stripe_session_id !== orderId) return fail("NOT_FOUND");
    pending = o.status === "pending_payment";
    expected = await krwAmount(admin, o.total, o.currency);
  }
  if (!pending) return NextResponse.redirect(new URL(back, url.origin)); // 이미 확정(재진입) — 그냥 페이지로
  if (expected == null || expected !== amount) return fail("AMOUNT_MISMATCH");

  // 2. 승인 — 같은 paymentKey 재승인은 토스가 ALREADY_PROCESSED_PAYMENT로 응답, 아래 확정은 멱등이라 계속 진행
  const r = await tossConfirm(keys.secretKey, { paymentKey, orderId, amount });
  if (!r.ok && r.error.code !== "ALREADY_PROCESSED_PAYMENT") return fail(r.error.code);

  // 3. 확정 — 기존 DB 함수 재사용 (paymentKey를 stripe_payment_intent_id 자리에)
  if (parsed.kind === "tx") {
    await admin.from("transactions").update({ stripe_payment_intent_id: paymentKey }).eq("id", parsed.id).eq("status", "pending_payment");
    await admin.rpc("mark_paid", { p_payment_intent_id: paymentKey });
  } else {
    const { data } = await admin.rpc("mark_proxy_order_paid", { p_session_id: orderId, p_payment_intent_id: paymentKey });
    if (data?.status !== "paid") console.error("[toss confirm] proxy order not paid", { orderId, paymentKey, status: data?.status });
  }
  return NextResponse.redirect(new URL(`${back}?pay=ok`, url.origin));
}
