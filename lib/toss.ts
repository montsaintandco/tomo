import type { SupabaseClient } from "@supabase/supabase-js";

// 토스페이먼츠 서버 헬퍼. 키 없으면 null → 호출부에서 503 graceful (스펙 §9).
// 한국 사업자라 Stripe 불가 → 토스. 결제 통화는 KRW뿐이라 JPY 주문은 환율표(JPY_KRW)로 환산해 청구한다.
// DB 컬럼은 그대로 재사용: stripe_payment_intent_id = 토스 paymentKey, stripe_session_id = 우리 orderId (마이그레이션 없음)

const API = "https://api.tosspayments.com/v1";

export function tossKeys(): { clientKey: string; secretKey: string } | null {
  const clientKey = process.env.TOSS_CLIENT_KEY;
  const secretKey = process.env.TOSS_SECRET_KEY;
  return clientKey && secretKey ? { clientKey, secretKey } : null;
}

function auth(secretKey: string) {
  return { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`, "Content-Type": "application/json" };
}

export type TossError = { code: string; message: string };

// 결제 승인 — 성공 리다이렉트의 paymentKey/orderId/amount로 확정. 금액은 호출 전에 DB와 대조할 것
export async function tossConfirm(secretKey: string, body: { paymentKey: string; orderId: string; amount: number }):
  Promise<{ ok: true; status: string } | { ok: false; error: TossError }> {
  const res = await fetch(`${API}/payments/confirm`, { method: "POST", headers: auth(secretKey), body: JSON.stringify(body), cache: "no-store" });
  const j = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, status: String(j.status ?? "") };
  return { ok: false, error: { code: String(j.code ?? "UNKNOWN"), message: String(j.message ?? "") } };
}

// 결제 조회 — 부분 환불 전에 토스 잔액(balanceAmount)을 확인해 초과 취소를 막는다
export type TossPayment = { totalAmount: number; balanceAmount: number; status: string };
export async function tossPayment(secretKey: string, paymentKey: string):
  Promise<{ ok: true; payment: TossPayment } | { ok: false; error: TossError }> {
  const res = await fetch(`${API}/payments/${encodeURIComponent(paymentKey)}`, { headers: auth(secretKey), cache: "no-store" });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: { code: String(j.code ?? "UNKNOWN"), message: String(j.message ?? "") } };
  return { ok: true, payment: { totalAmount: Number(j.totalAmount) || 0, balanceAmount: Number(j.balanceAmount) || 0, status: String(j.status ?? "") } };
}

// 취소(환불). cancelAmount 없으면 남은 잔액 전부. idempotencyKey(= refunds.id)로 재시도해도 두 번 취소되지 않는다
export async function tossCancel(secretKey: string, paymentKey: string, reason: string,
  opts: { cancelAmount?: number; idempotencyKey?: string } = {}):
  Promise<{ ok: true; canceledKrw: number | null } | { ok: false; error: TossError }> {
  const headers: Record<string, string> = auth(secretKey);
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  const body: Record<string, unknown> = { cancelReason: reason.slice(0, 200) || "환불" };
  if (opts.cancelAmount != null) body.cancelAmount = opts.cancelAmount;
  const res = await fetch(`${API}/payments/${encodeURIComponent(paymentKey)}/cancel`, {
    method: "POST", headers, body: JSON.stringify(body), cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: { code: String(j.code ?? "UNKNOWN"), message: String(j.message ?? "") } };
  const cancels = Array.isArray(j.cancels) ? j.cancels : [];
  const last = cancels[cancels.length - 1];
  return { ok: true, canceledKrw: last ? Number(last.cancelAmount) || null : null };
}

// 청구 금액(KRW). KRW면 그대로, JPY면 환율표로 환산. 환율표가 없으면 결제를 열지 않는다(null)
export async function krwAmount(supabase: SupabaseClient, amount: number, currency: string): Promise<number | null> {
  if (currency === "KRW") return Math.round(amount);
  const { data } = await supabase.from("exchange_rates").select("rate").eq("pair", "JPY_KRW").maybeSingle();
  const rate = Number(data?.rate);
  return rate > 0 ? Math.round(amount * rate) : null;
}

// 토스 orderId 규칙: 6~64자, 영문·숫자·-_ . 우리 id를 접두사로 감싸 승인 시 되돌린다
export const tossOrderId = { tx: (id: string) => `tx_${id}`, po: (id: string) => `po_${id}` };
export function parseTossOrderId(orderId: string): { kind: "tx" | "po"; id: string } | null {
  const m = /^(tx|po)_([0-9a-f-]{36})$/.exec(orderId);
  return m ? { kind: m[1] as "tx" | "po", id: m[2] } : null;
}

// 클라이언트로 내려보내는 결제창 파라미터
export type TossParams = {
  clientKey: string; orderId: string; amount: number; orderName: string; customerKey: string;
  successUrl: string; failUrl: string; method: "card" | "kakao_pay" | "naver_pay";
};
