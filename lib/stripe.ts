import Stripe from "stripe";

// 서버 전용 Stripe 싱글턴. 키 없으면 null → 호출부에서 503 graceful (스펙 §9).
// 금액 단위: KRW·JPY는 Stripe에서 zero-decimal 통화 → 원값 그대로 전달 (×100 금지).
let _stripe: Stripe | null = null;
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!_stripe) _stripe = new Stripe(key);
  return _stripe;
}
