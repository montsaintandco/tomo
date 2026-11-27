import type { SupabaseClient } from "@supabase/supabase-js";
import { customsCharge } from "./fees";
import { getStripe } from "./stripe";
import { createAdminSupabase } from "./supabase/admin";
import { rows } from "./safe";

// 환불 실행 (0025). 순서: DB 상태 변경 + refunds(pending) → Stripe 환불(Idempotency-Key = 환불 id) → refund_mark.
// Stripe 실패·키 없음이면 refunds 행이 failed로 남고 /admin/refunds에서 「다시 시도」.

type Cur = "KRW" | "JPY";

/** 부분 환불 원화 = round(실제 청구 원화 × 환불액 ÷ 주문 총액). 결제의 남은 환불 가능액을 넘지 않는다. */
export function refundKrw(paidKrw: number, amount: number, total: number, balanceKrw: number): number {
  if (!(paidKrw > 0) || !(amount > 0) || !(total > 0)) return 0;
  const v = Math.round((paidKrw * Math.min(amount, total)) / total);
  return Math.max(0, Math.min(v, Math.max(0, balanceKrw)));
}

/** 대행 주문 금액 재계산 — DB proxy_order_amount(0025)·create_proxy_order(0020)와 같은 규칙. 항목 없으면 0 */
export function proxyOrderAmount(items: { price: number; currency: Cur }[], orderCurrency: Cur, rate: number, intlShipping: number): number {
  const sub = items.reduce((s, i) => s + (i.currency === orderCurrency ? i.price : Math.round(i.price * rate)), 0);
  if (sub <= 0) return 0;
  return sub + intlShipping + customsCharge(sub, intlShipping, orderCurrency);
}

export type CancelPreview = { amount: number; cap: number; currency: Cur; full: boolean };

/** 항목 하나를 취소할 때 환불 기본값과 상한 — DB admin_cancel_proxy와 같은 규칙.
 *  items = 아직 취소되지 않은 항목(대상 포함). 남는 항목이 없으면 미환불 잔액 전부. */
export function proxyCancelPreview(o: {
  total: number; refunded: number; intlShipping: number; currency: Cur; rate: number;
  items: { id: string; price: number; currency: Cur }[]; targetId: string;
}): CancelPreview {
  const cap = Math.max(0, o.total - o.refunded);
  const left = o.items.filter((i) => i.id !== o.targetId);
  const before = proxyOrderAmount(o.items, o.currency, o.rate, o.intlShipping);
  const after = proxyOrderAmount(left, o.currency, o.rate, o.intlShipping);
  const amount = left.length === 0 ? cap : Math.min(Math.max(before - after, 0), cap);
  return { amount, cap, currency: o.currency, full: amount > 0 && amount === cap };
}

/** 주문들의 항목별 취소 미리보기 (결제된 주문만). 0025 미적용이면 환불 합 0으로 본다. key = proxy_requests.id */
export async function loadCancelPreviews(supabase: SupabaseClient, orderIds: string[]): Promise<Record<string, CancelPreview>> {
  const ids = [...new Set(orderIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const [oRes, rRes, fRes] = await Promise.all([
    supabase.from("proxy_orders").select("id, status, currency, total, rate, intl_shipping, stripe_payment_intent_id").in("id", ids),
    supabase.from("proxy_requests").select("id, order_id, status, quote_item_price, external_items(price, currency)").in("order_id", ids),
    supabase.from("refunds").select("proxy_order_id, amount").in("proxy_order_id", ids),
  ]);
  type O = { id: string; status: string; currency: Cur; total: number; rate: number; intl_shipping: number; stripe_payment_intent_id: string | null };
  type R = { id: string; order_id: string; status: string; quote_item_price: number | null; external_items: { price: number; currency: Cur } | null };
  const reqs = rows(rRes as never) as R[];
  const refunded: Record<string, number> = {};
  for (const f of rows(fRes as never) as { proxy_order_id: string; amount: number }[]) refunded[f.proxy_order_id] = (refunded[f.proxy_order_id] ?? 0) + f.amount;
  const out: Record<string, CancelPreview> = {};
  for (const o of rows(oRes as never) as O[]) {
    if (o.status !== "paid" || !o.stripe_payment_intent_id) continue;
    const items = reqs.filter((r) => r.order_id === o.id && r.status !== "cancelled" && r.external_items)
      .map((r) => ({ id: r.id, price: r.quote_item_price ?? r.external_items!.price, currency: r.external_items!.currency }));
    for (const it of items) {
      out[it.id] = proxyCancelPreview({ total: o.total, refunded: refunded[o.id] ?? 0, intlShipping: o.intl_shipping,
        currency: o.currency, rate: Number(o.rate), items, targetId: it.id });
    }
  }
  return out;
}

export type RefundResult = { status: "done" | "failed" | "pending"; error?: string };

/** 환불 1건을 Stripe에 보낸다 (service_role 클라이언트). 이미 done이면 그대로. */
export async function processRefund(admin: SupabaseClient, id: string): Promise<RefundResult> {
  const { data: f, error } = await admin.from("refunds")
    .select("id, kind, transaction_id, proxy_order_id, payment_key, amount, is_full, reason, status").eq("id", id).maybeSingle();
  if (error || !f) return { status: "pending", error: error?.message ?? "환불 행 없음" };
  if (f.status === "done") return { status: "done" };
  if (f.status === "void") return { status: "failed", error: "VOID: 무효 처리된 환불 — 보내지 않음" };

  const fail = async (msg: string): Promise<RefundResult> => {
    await admin.rpc("refund_mark", { p_id: id, p_ok: false, p_error: msg, p_amount_krw: null });
    return { status: "failed", error: msg };
  };
  // Stripe 전환(2026-11-23) 전 토스 결제는 Stripe로 환불할 수 없다 → 토스 상점관리자에서 직접 처리
  if (!String(f.payment_key).startsWith("pi_")) return fail("LEGACY_TOSS: 토스 결제 건 — 토스 상점관리자에서 직접 환불");
  const stripe = getStripe();
  if (!stripe) return fail("STRIPE_KEYS_MISSING: Stripe 키 없음");

  // 환불 비율의 분모(주문/거래 통화 총액)와 실제 청구 원화
  let total = 0; let paidKrw: number | null = null;
  if (f.kind === "tx") {
    const { data: t } = await admin.from("transactions").select("item_price, intl_shipping_fee, is_cross_border, paid_krw").eq("id", f.transaction_id).maybeSingle();
    if (t) { total = t.item_price + (t.is_cross_border ? t.intl_shipping_fee : 0); paidKrw = t.paid_krw ?? null; }
  } else {
    const { data: o } = await admin.from("proxy_orders").select("total, paid_krw").eq("id", f.proxy_order_id).maybeSingle();
    if (o) { total = o.total; paidKrw = o.paid_krw ?? null; }
  }
  if (!(total > 0)) return fail("TOTAL_UNKNOWN: 원 거래 금액을 못 읽음");

  let paid: number; let balance: number;
  try {
    const pi = await stripe.paymentIntents.retrieve(f.payment_key, { expand: ["latest_charge"] });
    const ch = pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
    paid = paidKrw ?? pi.amount_received;
    balance = Math.max(0, (ch?.amount_captured ?? pi.amount_received) - (ch?.amount_refunded ?? 0));
  } catch (e) { return fail(`PI_LOOKUP: ${e instanceof Error ? e.message : "조회 실패"}`); }

  // 전액: 남은 잔액 전부(이미 0이면 끝난 것으로 본다). 부분: 청구 원화 비율, 잔액 상한
  const amount = f.is_full ? balance : refundKrw(paid, f.amount, total, balance);
  if (amount <= 0) {
    if (f.is_full) { const { error: me } = await admin.rpc("refund_mark", { p_id: id, p_ok: true, p_error: null, p_amount_krw: null }); return me ? { status: "pending", error: me.message } : { status: "done" }; }
    return fail(`ZERO_AMOUNT: 환불 원화 0 (남은 금액 ${balance})`);
  }
  try {
    // 기록 실패 뒤 재시도로 같은 환불이 두 번 나가지 않게 먼저 찾는다. 키에 금액을 넣어 잔액이 바뀐 재시도도 키 충돌이 없다
    const prev = await stripe.refunds.list({ payment_intent: f.payment_key, limit: 100 });
    const hit = prev.data.find((x) => x.metadata?.refund_id === f.id && x.status !== "failed" && x.status !== "canceled");
    if (hit) {
      const { error: me } = await admin.rpc("refund_mark", { p_id: id, p_ok: true, p_error: null, p_amount_krw: hit.amount });
      return me ? { status: "pending", error: `Stripe 환불은 됐지만 기록 실패: ${me.message}` } : { status: "done" };
    }
    await stripe.refunds.create({ payment_intent: f.payment_key, amount, reason: "requested_by_customer", metadata: { refund_id: f.id } }, { idempotencyKey: `${f.id}:${amount}` });
  } catch (e) { return fail(`STRIPE_REFUND: ${e instanceof Error ? e.message : "환불 실패"}`); }

  const { error: me } = await admin.rpc("refund_mark", { p_id: id, p_ok: true, p_error: null, p_amount_krw: amount });
  if (me) return { status: "pending", error: `Stripe 환불은 됐지만 기록 실패: ${me.message}` };
  return { status: "done" };
}
/** 라우트용: service_role 없으면 대기열에 남긴다. */
export async function runRefund(id: string): Promise<RefundResult> {
  let admin: SupabaseClient;
  try { admin = createAdminSupabase(); } catch { return { status: "pending", error: "SUPABASE_SERVICE_ROLE_KEY 없음" }; }
  try { return await processRefund(admin, id); } catch (e) { return { status: "pending", error: e instanceof Error ? e.message : "unknown" }; }
}
