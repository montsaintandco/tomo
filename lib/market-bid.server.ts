// 해외 마켓 경매 입찰 대행 M2: 결제창(승인만) 열기·승인 확정·승인 해제·매입. DB 정본은 0050 함수(service_role).
// 멱등 키: 매입 mb_capture_<신청 id>, 해제 mb_cancel_<승인 id>(docs/aaa/15 4.4). 같은 Stripe 계정을 에어쉽과 같이 쓰므로
// metadata.app(APP_TAG)이 다른 세션은 건드리지 않는다.
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_TAG, createSession } from "./stripe";

export type MbSettle = { kind: "mb"; id: string; status: "authorized" | "released" | "unpaid" | "ignored"; code?: string; back: string };

type AuthRow = { id: string; bid_id: string; payment_intent_id: string | null; amount_krw: number; status: string; captured_krw: number | null };

const must = <T,>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

async function backFor(admin: SupabaseClient, bidId: string): Promise<string> {
  const { data } = await admin.from("market_bids").select("source, source_id").eq("id", bidId).maybeSingle();
  return data ? `/global/${data.source}/${data.source_id}` : "/mypage/notifications";
}

/** 신청(pending_auth)에 결제창을 연다. 열린 창이 있으면 그대로, 이미 끝난 창이면 확정 경로로. 앞 창은 만료시킨다 */
export async function openBidCheckout(stripe: Stripe, admin: SupabaseClient, o: {
  bid: { id: string; code: string; auth_krw: number; source: string; source_id: string };
  name: string; lang: "ko" | "ja"; email?: string | null; origin: string;
}): Promise<string> {
  const { data: open } = await admin.from("market_bid_auths").select("stripe_session_id").eq("bid_id", o.bid.id).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (open?.stripe_session_id) {
    const prev = await stripe.checkout.sessions.retrieve(open.stripe_session_id).catch(() => null);
    if (prev?.status === "open" && prev.url) return prev.url;
    if (prev?.status === "complete") return `/api/stripe/return?session_id=${prev.id}`;
  }
  const s = await createSession(stripe, {
    kind: "mb", id: o.bid.id, amount: o.bid.auth_krw, base: o.bid.auth_krw, cur: "KRW", name: o.name, method: "card",
    lang: o.lang, email: o.email, origin: o.origin, back: `/global/${o.bid.source}/${o.bid.source_id}`, manual: true,
  });
  const { data, error } = await admin.rpc("market_bid_attach_session", { p_bid: o.bid.id, p_session: s.id, p_amount_krw: o.bid.auth_krw });
  if (error) {
    await stripe.checkout.sessions.expire(s.id).catch(() => {});
    throw new Error(`market_bid_attach_session: ${error.message}`);
  }
  for (const sid of ((data as { expire?: string[] })?.expire ?? [])) await stripe.checkout.sessions.expire(sid).catch(() => {});
  if (!s.url) throw new Error("checkout url missing");
  return s.url;
}

/**
 * 승인만 하는 결제창 완료 → DB 확정(멱등). 웹훅·복귀가 같이 부른다.
 * 실측(2026-11-27 테스트 모드): 완료 세션은 status complete + payment_status unpaid, PaymentIntent requires_capture.
 * 승인 유효 시각은 charge.payment_method_details.card.capture_before(정본). DB 가 거절하면(만료·취소된 신청, 옛 창, 같은 상품 선점,
 * 유효 기간 부족) 그 승인을 바로 해제한다. DB·Stripe 오류는 던진다(웹훅 500 → Stripe 재전송).
 */
export async function settleMarketBidSession(stripe: Stripe, admin: SupabaseClient, s: Stripe.Checkout.Session): Promise<MbSettle | null> {
  const m = s.metadata ?? {};
  if (m.app !== APP_TAG || m.kind !== "mb" || !m.id) return null;
  const id = m.id;
  const back = await backFor(admin, id);
  if (s.status !== "complete") return { kind: "mb", id, status: "unpaid", code: "OPEN", back };
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
  if (!pi) return { kind: "mb", id, status: "unpaid", code: "NO_PAYMENT_INTENT", back };
  const intent = await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge"] });
  if (intent.status !== "requires_capture") {
    // 승인만 하는 창인데 다른 상태(실패·이미 취소·즉시 청구) — 확정하지 않는다. 즉시 청구는 생길 수 없지만 생기면 운영자가 본다
    console.error("[mb settle] requires_capture 아님", { pi, status: intent.status, id });
    return { kind: "mb", id, status: "unpaid", code: `PI_${intent.status}`, back };
  }
  const charge = intent.latest_charge && typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  const cb = charge?.payment_method_details?.card?.capture_before;
  const r = must(await admin.rpc("market_bid_authorized", {
    p_session: s.id, p_payment_intent: pi, p_amount_krw: intent.amount, p_capture_before: cb ? new Date(cb * 1000).toISOString() : null,
  }), "market_bid_authorized") as { ok: boolean; reason?: string; release_auth_id?: string };
  if (r.ok) return { kind: "mb", id, status: "authorized", back };
  if (!r.release_auth_id) {
    console.error("[mb settle] 신청 행 없음 — 해제하지 않음", { pi, id, reason: r.reason });
    return { kind: "mb", id, status: "ignored", code: "NOT_FOUND", back };
  }
  await releaseAuth(stripe, admin, r.release_auth_id);
  return { kind: "mb", id, status: "released", code: (r.reason ?? "VOID").toUpperCase().replace(/\s+/g, "_"), back };
}

/** 승인 해제(PaymentIntent cancel). 승인 행이 releasing 일 때만 Stripe 를 부른다. 이미 취소된 PI 는 성공으로 본다 */
export async function releaseAuth(stripe: Stripe, admin: SupabaseClient, authId: string): Promise<AuthRow> {
  const a = must(await admin.from("market_bid_auths").select("id, bid_id, payment_intent_id, amount_krw, status, captured_krw").eq("id", authId).maybeSingle(), "auth read") as AuthRow | null;
  if (!a) throw new Error(`auth not found ${authId}`);
  if (a.status === "released") return a;
  if (a.status !== "releasing") throw new Error(`auth ${authId} not releasing (${a.status})`);
  if (a.payment_intent_id) {
    try {
      await stripe.paymentIntents.cancel(a.payment_intent_id, {}, { idempotencyKey: `mb_cancel_${a.id}` });
    } catch (e) {
      const cur = await stripe.paymentIntents.retrieve(a.payment_intent_id);
      if (cur.status !== "canceled") throw new Error(`release failed ${a.payment_intent_id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return must(await admin.rpc("market_bid_auth_released", { p_auth: a.id }), "market_bid_auth_released") as AuthRow;
}

/**
 * 매입(PaymentIntent capture, 일부 금액). 금액은 DB 가 계산한 값만 넘긴다(M3 market_bid_set_won 의 capture_krw).
 * 남은 승인액은 Stripe 가 자동으로 풀어 준다. 이미 매입된 PI 는 Stripe 값으로 기록만 한다(재시도 안전).
 */
export async function captureAuth(stripe: Stripe, admin: SupabaseClient, authId: string, amountKrw: number): Promise<AuthRow> {
  const a = must(await admin.from("market_bid_auths").select("id, bid_id, payment_intent_id, amount_krw, status, captured_krw").eq("id", authId).maybeSingle(), "auth read") as AuthRow | null;
  if (!a) throw new Error(`auth not found ${authId}`);
  if (a.status === "captured") return a;
  if (a.status !== "authorized" || !a.payment_intent_id) throw new Error(`auth ${authId} not capturable (${a.status})`);
  if (!Number.isInteger(amountKrw) || amountKrw <= 0 || amountKrw > a.amount_krw) throw new Error(`capture amount ${amountKrw} > ${a.amount_krw}`);
  let got: Stripe.PaymentIntent;
  try {
    got = await stripe.paymentIntents.capture(a.payment_intent_id, { amount_to_capture: amountKrw }, { idempotencyKey: `mb_capture_${a.bid_id}` });
  } catch (e) {
    got = await stripe.paymentIntents.retrieve(a.payment_intent_id);
    if (got.status !== "succeeded") throw new Error(`capture failed ${a.payment_intent_id}: ${e instanceof Error ? e.message : e}`);
  }
  if (got.status !== "succeeded") throw new Error(`capture not succeeded ${got.status}`);
  return must(await admin.rpc("market_bid_auth_captured", { p_auth: a.id, p_captured_krw: got.amount_received }), "market_bid_auth_captured") as AuthRow;
}
