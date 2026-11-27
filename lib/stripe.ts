import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

// Stripe 서버 헬퍼. 키 없으면 null → 호출부에서 503 graceful (스펙 §9).
// 결제 통화는 KRW(약관 그대로). JPY 상품·주문은 환율표(JPY_KRW)로 환산해 청구한다. KRW는 zero-decimal → 원값 그대로(×100 금지).
// DB 컬럼: stripe_payment_intent_id = PaymentIntent id, stripe_session_id = Checkout Session id (거래는 0031에서 추가).
let _stripe: Stripe | null = null;
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!_stripe) _stripe = new Stripe(key);
  return _stripe;
}

// 청구 금액(KRW). KRW면 그대로, JPY면 환율표로 환산. 환율표가 없으면 결제를 열지 않는다(null). DB 오류는 던진다
export async function krwAmount(supabase: SupabaseClient, amount: number, currency: string): Promise<number | null> {
  if (currency === "KRW") return Math.round(amount);
  const { data, error } = await supabase.from("exchange_rates").select("rate").eq("pair", "JPY_KRW").maybeSingle();
  if (error) throw new Error(`exchange_rates: ${error.message}`);
  const rate = Number(data?.rate);
  return rate > 0 ? Math.round(amount * rate) : null;
}

export type PayMethod = "card" | "kakao_pay" | "naver_pay";
export type PayKind = "tx" | "po";
// mb = 해외 마켓 경매 입찰 신청(0050). 승인만 잡고(capture_method manual) 낙찰 때 실제 금액만 매입한다. 확정 경로는 lib/market-bid.server.ts
// mbp = 매입 실패 뒤 고객 재결제(0053, 즉시 결제)
// 같은 Stripe 계정을 다른 앱·환경이 같이 써도 남의 결제를 건드리지 않게 세션에 표시한다
export const APP_TAG = `tomo:${process.env.NEXT_PUBLIC_SITE_URL ?? "local"}`;
export const SESSION_MINUTES = 30; // Stripe 최소값. DB 예약 유지(0031, 45분)보다 짧아야 한다

// Checkout Session 생성. allowed_payment_method_types는 필터라 계정·고객에게 안 되는 수단은 안 보일 뿐이다.
// 고른 간편결제 + 카드(해외·국내 kr_card)를 같이 열고, 그래도 결제수단 오류면 카드만으로 1회 재시도(다른 오류는 그대로 던진다).
// base/cur = 세션을 만들 때의 DB 금액(원래 통화). 확정 때 DB와 이것만 대조하고, 청구 원화(amount_total)는 우리가 만든 값이라 그대로 믿는다.
export async function createSession(stripe: Stripe, o: {
  kind: PayKind | "mb" | "mbp"; id: string; amount: number; base: number; cur: string; name: string; method: PayMethod; lang: "ko" | "ja";
  email?: string | null; origin: string; back: string;
  manual?: boolean; // 승인만(카드만). 완료 세션 = payment_status unpaid + PaymentIntent requires_capture
}): Promise<Stripe.Checkout.Session> {
  const metadata = { app: APP_TAG, kind: o.kind, id: o.id, base: String(o.base), cur: o.cur };
  type T = "card" | "kr_card" | "kakao_pay" | "naver_pay";
  const create = (types: T[]) => stripe.checkout.sessions.create({
    mode: "payment",
    allowed_payment_method_types: types,
    line_items: [{ quantity: 1, price_data: { currency: "krw", unit_amount: o.amount, product_data: { name: o.name } } }],
    client_reference_id: `${o.kind}_${o.id}`,
    metadata,
    payment_intent_data: o.manual ? { metadata, capture_method: "manual" } : { metadata },
    customer_email: o.email ?? undefined,
    locale: o.lang,
    expires_at: Math.floor(Date.now() / 1000) + SESSION_MINUTES * 60 + 30,
    success_url: `${o.origin}/api/stripe/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${o.origin}${o.back}`,
  });
  if (o.manual) return await create(["card"]); // 승인만은 카드만(간편결제·kr_card 의 사전 승인은 확인 못 함)
  try { return await create(o.method === "card" ? ["card", "kr_card"] : [o.method, "card", "kr_card"]); }
  catch (e) {
    const retry = e instanceof Stripe.errors.StripeInvalidRequestError && /payment[_ ]method/i.test(e.message);
    if (!retry) throw e;
    return await create(["card"]);
  }
}