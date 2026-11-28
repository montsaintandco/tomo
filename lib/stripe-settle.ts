import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_TAG, type PayKind } from "./stripe";
import { txChargeBase } from "./fees";

// 결제 완료 세션 → DB 확정(멱등). 웹훅과 성공 리다이렉트 둘 다 부른다(먼저 온 쪽이 확정, 나중 쪽은 그대로 통과).
// 원칙: DB가 「확정할 수 없다」고 확실히 답한 결제만 자동 전액 환불한다(이미 다른 결제로 확정·취소됨·금액 바뀜·옛 창).
//       DB·Stripe 조회가 실패하면 던진다 → 웹훅은 500으로 Stripe가 다시 보내고, 리다이렉트는 「잠시 뒤 확인」으로 돌린다.
export type SettleResult = { kind: PayKind; id: string; status: "paid" | "unpaid" | "refunded" | "ignored"; code?: string };

const must = <T,>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

export async function settleSession(stripe: Stripe, admin: SupabaseClient, s: Stripe.Checkout.Session): Promise<SettleResult | null> {
  const m = s.metadata ?? {};
  const kind = m.kind as PayKind | undefined;
  const id = m.id;
  if (m.app !== APP_TAG || (kind !== "tx" && kind !== "po") || !id) return null;   // 다른 앱·환경의 결제는 건드리지 않는다
  if (s.payment_status !== "paid") return { kind, id, status: "unpaid", code: "UNPAID" };
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
  if (!pi) return { kind, id, status: "unpaid", code: "NO_PAYMENT_INTENT" };
  const table = kind === "tx" ? "transactions" : "proxy_orders";
  const cols = kind === "tx"
    ? "status, currency, item_price, intl_shipping_fee, customs_deposit, is_cross_border, stripe_payment_intent_id, stripe_session_id"
    : "status, currency, total, stripe_payment_intent_id, stripe_session_id";

  type Row = { status: string; currency: string; item_price?: number; intl_shipping_fee?: number; customs_deposit?: number | null; is_cross_border?: boolean; total?: number; stripe_payment_intent_id: string | null; stripe_session_id: string | null };
  const row = must(await admin.from(table).select(cols).eq("id", id).maybeSingle(), `${table} read`) as Row | null;
  if (!row) { console.error("[stripe settle] row not found — 환불하지 않음", { pi, kind, id }); return { kind, id, status: "ignored", code: "NOT_FOUND" }; }
  if (row.stripe_payment_intent_id === pi && row.status !== "pending_payment") return { kind, id, status: "paid" }; // 이 결제로 이미 확정(재진입)

  // 이미 (자동)환불이 나간 결제는 확정하지 않는다 — 한쪽이 환불한 뒤 다른 쪽이 확정하는 길을 막는다
  const intent = await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge"] });
  const charge = intent.latest_charge && typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  if ((charge?.amount_refunded ?? 0) > 0) return { kind, id, status: "refunded", code: "ALREADY_REFUNDED" };

  const refund = async (code: string): Promise<SettleResult> => {
    try {
      await stripe.refunds.create({ payment_intent: pi, reason: "duplicate", metadata: { kind, id, app: APP_TAG } }, { idempotencyKey: `auto_${pi}` });
    } catch (e) {
      const c = (e as { code?: string })?.code;
      if (c !== "charge_already_refunded") throw new Error(`auto refund failed ${pi} (${code}): ${e instanceof Error ? e.message : c}`);
    }
    console.error("[stripe settle] 확정 불가 → 자동 전액 환불", { pi, kind, id, code });
    return { kind, id, status: "refunded", code };
  };

  if (row.status !== "pending_payment") return refund("NOT_PENDING");
  if (row.stripe_session_id !== s.id) return refund("STALE_SESSION");
  const base = kind === "tx" ? txChargeBase({ item_price: row.item_price!, intl_shipping_fee: row.intl_shipping_fee!, is_cross_border: !!row.is_cross_border, customs_deposit: row.customs_deposit }) : row.total!;
  if (String(base) !== m.base || row.currency !== m.cur || s.currency !== "krw") return refund("AMOUNT_CHANGED");

  const done = kind === "tx"
    ? must(await admin.rpc("mark_tx_paid", { p_tx_id: id, p_payment_intent_id: pi }), "mark_tx_paid")
    : must(await admin.rpc("mark_proxy_order_paid", { p_session_id: s.id, p_payment_intent_id: pi }), "mark_proxy_order_paid");
  const d = done as { status?: string; stripe_payment_intent_id?: string } | null;
  if (!d) throw new Error(`${kind} confirm returned no row`);
  if (d.stripe_payment_intent_id !== pi || d.status === "pending_payment") {
    // 확정 함수가 확실히 다른 상태를 돌려줌(그 사이 취소·다른 결제 확정) → 이 결제 환불
    return refund(d.status === "cancelled" ? "CANCELLED" : "LOST_RACE");
  }

  // 실제 청구 원화(부분 환불 비율 계산용, 0025 paid_krw). 실패해도 확정은 유지(환불은 PI 금액으로 대신 계산)
  const { error: pkErr } = await admin.from(table).update({ paid_krw: s.amount_total }).eq("id", id).is("paid_krw", null);
  if (pkErr) console.error("[stripe settle] paid_krw 기록 실패", { kind, id, e: pkErr.message });
  return { kind, id, status: "paid" };
}

export const backPath = (kind: PayKind, id: string) => (kind === "tx" ? `/transactions/${id}` : `/order/${id}`);