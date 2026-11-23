import type { SupabaseClient } from "@supabase/supabase-js";
import { customsCharge } from "./fees";
import { tossKeys, tossPayment, tossCancel } from "./toss";
import { createAdminSupabase } from "./supabase/admin";
import { rows } from "./safe";

// 환불 실행 (0025). 순서: DB 상태 변경 + refunds(pending) → 토스 취소(Idempotency-Key = 환불 id) → refund_mark.
// 토스 실패·키 없음이면 refunds 행이 failed로 남고 /admin/refunds에서 「다시 시도」.

type Cur = "KRW" | "JPY";

/** 부분 환불 원화 = round(실제 청구 원화 × 환불액 ÷ 주문 총액). 토스 잔액을 넘지 않는다. */
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

/** 환불 1건을 토스에 보낸다 (service_role 클라이언트). 이미 done이면 그대로. */
export async function processRefund(admin: SupabaseClient, id: string): Promise<RefundResult> {
  const { data: f, error } = await admin.from("refunds")
    .select("id, kind, transaction_id, proxy_order_id, payment_key, amount, is_full, reason, status").eq("id", id).maybeSingle();
  if (error || !f) return { status: "pending", error: error?.message ?? "환불 행 없음" };
  if (f.status === "done") return { status: "done" };

  const fail = async (msg: string): Promise<RefundResult> => {
    await admin.rpc("refund_mark", { p_id: id, p_ok: false, p_error: msg, p_amount_krw: null });
    return { status: "failed", error: msg };
  };
  const keys = tossKeys();
  if (!keys) return fail("TOSS_KEYS_MISSING: 토스 키 없음");

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

  const p = await tossPayment(keys.secretKey, f.payment_key);
  if (!p.ok) return fail(`${p.error.code}: ${p.error.message}`);
  const paid = paidKrw ?? p.payment.totalAmount;   // 0025 전 결제는 paid_krw가 비어 토스 총액으로 대신

  let cancelAmount: number | undefined;
  if (!f.is_full) {
    cancelAmount = refundKrw(paid, f.amount, total, p.payment.balanceAmount);
    if (cancelAmount <= 0) return fail(`ZERO_AMOUNT: 환불 원화 0 (토스 잔액 ${p.payment.balanceAmount})`);
  }
  const r = await tossCancel(keys.secretKey, f.payment_key, f.reason, { cancelAmount, idempotencyKey: f.id });
  if (!r.ok && !(f.is_full && r.error.code === "ALREADY_CANCELED_PAYMENT")) return fail(`${r.error.code}: ${r.error.message}`);

  const krw = r.ok ? (r.canceledKrw ?? cancelAmount ?? p.payment.balanceAmount) : null;
  const { error: me } = await admin.rpc("refund_mark", { p_id: id, p_ok: true, p_error: null, p_amount_krw: krw });
  if (me) return { status: "pending", error: `토스 취소는 됐지만 기록 실패: ${me.message}` };
  return { status: "done" };
}

/** 라우트용: service_role 없으면 대기열에 남긴다. */
export async function runRefund(id: string): Promise<RefundResult> {
  let admin: SupabaseClient;
  try { admin = createAdminSupabase(); } catch { return { status: "pending", error: "SUPABASE_SERVICE_ROLE_KEY 없음" }; }
  try { return await processRefund(admin, id); } catch (e) { return { status: "pending", error: e instanceof Error ? e.message : "unknown" }; }
}
