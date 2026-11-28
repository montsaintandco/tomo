import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getStripe, krwAmount, createSession } from "@/lib/stripe";
import { directShippingFee, txChargeBase } from "@/lib/fees";
import { t, type Lang } from "@/lib/i18n";
import { apiError, reqLang } from "@/lib/api-error";
import { auctionEnabled, auctionErrorKey, auctionErrorStatus } from "@/lib/auction";

// start_transaction 오류 → 사용자 언어 문구. 모르는 오류는 일반 문구(내부 메시지는 보이지 않는다)
function rpcError(lang: Lang, msg: string) {
  if (msg.includes("listing not available") || msg.includes("listing not found")) return apiError(lang, "pay.err.listingGone", 409);
  if (msg.includes("cannot buy own listing")) return apiError(lang, "pay.err.ownListing");
  if (msg.includes("shipping only")) return apiError(lang, "pay.err.shippingOnly");
  if (msg.includes("auction listing")) return apiError(lang, "auction.err.useAuction", 409);
  if (msg.includes("ship weight required")) return apiError(lang, "pay.err.needWeight", 409);
  if (msg.includes("rate missing")) return apiError(lang, "pay.err.notReady", 503);
  return apiError(lang, "pay.err.order");
}

// 미들웨어 밖 — 자체 인증. Stripe 키 없으면 503 (스펙 §9 graceful).
// 거래 생성 후 Stripe 결제창 URL을 내려주고, 확정은 /api/stripe/return(성공 리다이렉트)·웹훅에서 금액 대조 후
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const rl = reqLang(req);
  if (!auth.user) return apiError(rl, "pay.err.unauthorized", 401);

  // intlShippingFee 는 받지 않는다(01#15) — 국제배송비는 서버 표(lib/fees.ts directShippingFee)와 DB(0035)가 정한다
  // auctionId: 낙찰 결제(0047 start_auction_transaction) — /api/auctions/[id]/pay 가 이 경로로 넘긴다
  const { listingId, meetup, transactionId, auctionId } = await req.json().catch(() => ({}));
  if (typeof listingId !== "string" && typeof transactionId !== "string" && typeof auctionId !== "string") return apiError(rl, "pay.err.invalidListing");
  if (typeof auctionId === "string" && !auctionEnabled()) return apiError(rl, "auction.err.off", 404);

  const stripe = getStripe();
  if (!stripe) return apiError(rl, "pay.err.notReady", 503);
  const { data: profile } = await supabase.from("profiles").select("language").eq("id", auth.user.id).maybeSingle();
  const lang: Lang = profile?.language === "ja" ? "ja" : profile?.language === "ko" ? "ko" : rl;

  type Tx = { id: string; item_price: number; intl_shipping_fee: number; customs_deposit?: number | null; is_cross_border: boolean; currency: string; meetup: boolean; status: string; created_at?: string; stripe_session_id?: string | null };
  let tx: Tx;
  if (typeof transactionId === "string") {
    // 결제 대기 거래 재결제 — RLS가 당사자만 읽게 하고, 구매자·대기 상태만 연다
    const { data } = await supabase.from("transactions").select("id, item_price, intl_shipping_fee, customs_deposit, is_cross_border, currency, meetup, status, buyer_id, created_at, stripe_session_id").eq("id", transactionId).maybeSingle();
    if (!data || data.buyer_id !== auth.user.id || data.status !== "pending_payment") return apiError(lang, "pay.err.notPayable");
    // 낙찰 거래면 경매가 아직 결제 대기여야 한다(미결제 확정 뒤 옛 거래로 창을 열지 않게). 새 창 10분 규칙은 아래 그대로
    const { data: au } = await createAdminSupabase().from("auctions").select("status").eq("tx_id", data.id).maybeSingle();
    if (au && au.status !== "awaiting_payment") return apiError(lang, "pay.err.notPayable");
    tx = data;
  } else if (typeof auctionId === "string") {
    // 낙찰자 「결제하기」: DB 가 낙찰자·결제 기한(pay_due_at)·국제배송비·수수료를 정한다. 열린 결제 대기 거래가 있으면 그것을 돌려준다
    const { data, error } = await supabase.rpc("start_auction_transaction", { p_auction: auctionId });
    if (error) { const k = auctionErrorKey(error.message); return apiError(lang, k, auctionErrorStatus(k)); }
    tx = data;
  } else {
    // 거래 생성 + 예약 선점 + 수수료 계산 (DB가 소유권·경합 검증)
    // 국제배송비: 상품 통화 기준 서버 값. 국경 간 거래가 아니면 DB가 0으로 둔다.
    // 0035 적용 뒤에는 DB가 같은 값을 스스로 정한다(인자 무시 — RPC 직접 호출 변조도 막힘)
    const { data: l } = await supabase.from("listings").select("currency").eq("id", listingId).maybeSingle();
    if (!l) return apiError(lang, "pay.err.listingGone", 409);
    const { data, error } = await supabase.rpc("start_transaction", {
      p_listing_id: listingId, p_intl_shipping_fee: directShippingFee(l.currency === "JPY" ? "JPY" : "KRW"), p_meetup: !!meetup,
    });
    if (error) return rpcError(lang, error.message);
    tx = data;
  }

  // 재결제: 열려 있는 결제창이 있으면 그대로 다시 연다. 새 창은 거래 생성 10분 안에만 연다
  // (창은 30분 열리고 DB 예약은 45분 유지 — 0031. 늦게 연 창으로 결제하면 예약이 풀린 뒤라 자동 환불되기 때문)
  if (tx.stripe_session_id?.startsWith("cs_")) {
    const prev = await stripe.checkout.sessions.retrieve(tx.stripe_session_id).catch(() => null);
    if (prev?.status === "open" && prev.url) return NextResponse.json({ url: prev.url, transactionId: tx.id });
    if (prev?.status === "complete") return NextResponse.json({ url: `/api/stripe/return?session_id=${prev.id}`, transactionId: tx.id });
  }
  if (tx.created_at && Date.now() - new Date(tx.created_at).getTime() > 10 * 60_000)
    return apiError(lang, "pay.err.expired");

  const base = txChargeBase(tx);   // 0057: 상품가 + 국제배송비 + 통관 예치금(DB tx_charge_base)
  const amount = await krwAmount(supabase, base, tx.currency);
  if (amount == null) return apiError(lang, "pay.err.notReady", 503);

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.headers.get("origin") ?? new URL(req.url).origin;
  let session;
  try {
    session = await createSession(stripe, {
      kind: "tx", id: tx.id, amount, base, cur: tx.currency, method: "card", lang,
      email: auth.user.email, name: tx.meetup ? "TOMO 안전결제 (만남 거래)" : "TOMO 안전결제", origin, back: `/transactions/${tx.id}`,
    });
  } catch {
    return NextResponse.json({ error: t(lang, "pay.err.session"), code: "pay.err.session", transactionId: tx.id }, { status: 400 });
  }
  // 확정은 이 창 id가 거래에 적혀 있어야 한다(옛 창 결제는 자동 환불). 기록 못 하면 창을 닫고 열지 않는다
  const { data: updated, error: upErr } = await createAdminSupabase().from("transactions")
    .update({ stripe_session_id: session.id }).eq("id", tx.id).eq("status", "pending_payment").select("id");
  if (upErr || !updated || updated.length === 0) {
    await stripe.checkout.sessions.expire(session.id).catch(() => {});
    return NextResponse.json({ error: t(lang, "pay.err.notReady"), code: "pay.err.notReady", transactionId: tx.id }, { status: 503 });
  }
  if (tx.stripe_session_id?.startsWith("cs_")) await stripe.checkout.sessions.expire(tx.stripe_session_id).catch(() => {});
  return NextResponse.json({ url: session.url, transactionId: tx.id });
}