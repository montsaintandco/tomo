import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { t } from "@/lib/i18n";

export const runtime = "nodejs";

type Method = "card" | "kakao_pay" | "naver_pay";
const METHODS: Method[] = ["card", "kakao_pay", "naver_pay"];

// 주문 생성 → Stripe Checkout. 키 없으면 주문 만들기 전에 503 (스펙 §3). 미들웨어 밖 — 자체 인증
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "결제 준비 중" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const method: Method = METHODS.includes(body.method) ? body.method : "card";

  let order: { id: string; total: number; currency: string; payment_method: string; status: string; stripe_session_id?: string | null };
  if (typeof body.orderId === "string") {
    const { data } = await supabase.from("proxy_orders").select("id, total, currency, payment_method, status, stripe_session_id").eq("id", body.orderId).maybeSingle();
    if (!data || data.status !== "pending_payment") return NextResponse.json({ error: "order not payable" }, { status: 400 });
    order = data;
  } else {
    const ship = body.ship ?? {};
    if (!Array.isArray(body.itemIds) || body.itemIds.length === 0) return NextResponse.json({ error: "empty order" }, { status: 400 });
    const { data, error } = await supabase.rpc("create_proxy_order", {
      p_item_ids: body.itemIds, p_method: method,
      p_ship_name: String(ship.name ?? ""), p_ship_phone: String(ship.phone ?? ""), p_ship_postal: String(ship.postal ?? ""),
      p_ship_address: String(ship.address ?? ""), p_ship_note: String(ship.note ?? "").slice(0, 300),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    order = data;
  }

  const { count } = await supabase.from("proxy_requests").select("*", { count: "exact", head: true }).eq("order_id", order.id);
  const { data: profile } = await supabase.from("profiles").select("language").eq("id", auth.user.id).single();
  const lang = profile?.language === "ja" ? "ja" : "ko";
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const create = (types: Method[]) => stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: types,
    line_items: [{ quantity: 1, price_data: {
      currency: order.currency.toLowerCase(), unit_amount: order.total, // KRW/JPY zero-decimal
      product_data: { name: t(lang, "order.stripeName", { n: count ?? 1 }) },
    } }],
    metadata: { proxy_order_id: order.id },
    success_url: `${origin}/order/${order.id}`,
    cancel_url: `${origin}/order/${order.id}`,
  });
  let session: Stripe.Checkout.Session;
  try {
    try { session = await create([order.payment_method as Method]); }
    catch (e) {
      // 결제수단 자체가 거부된 경우에만 카드로 1회 재시도 — 다른 에러(네트워크 등)는 그대로 전파
      const retryable = order.payment_method !== "card" && e instanceof Stripe.errors.StripeInvalidRequestError
        && /payment_method_types|payment method/i.test(e.message);
      if (!retryable) throw e;
      session = await create(["card"]);
    }
  } catch {
    return NextResponse.json({ error: "결제 세션 생성 실패" }, { status: 400 });
  }

  // 세션 id 기록은 service_role. 실패하면(0건 갱신 포함) 웹훅이 결제를 못 찍으니 세션을 만료시키고 대기 상태로 남긴다
  try {
    const { data: updated, error } = await createAdminSupabase().from("proxy_orders")
      .update({ stripe_session_id: session.id }).eq("id", order.id).eq("status", "pending_payment").select("id");
    if (error) throw error;
    if (!updated || updated.length === 0) throw new Error("order not pending");
  } catch {
    await stripe.checkout.sessions.expire(session.id).catch(() => {});
    return NextResponse.json({ error: "결제 준비 중" }, { status: 503 });
  }

  // 재결제 시 이전 세션은 웹훅이 더 이상 매칭할 수 없으니 만료시켜 고객이 완료하지 못하게 한다
  if (order.stripe_session_id) await stripe.checkout.sessions.expire(order.stripe_session_id).catch(() => {});

  return NextResponse.json({ url: session.url });
}

// 주문 취소: RPC로 결제 전 주문만 취소 → 취소 후 열린 세션이 결제되면 웹훅이 못 찍으니 세션 만료
export async function DELETE(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { orderId } = body;
  if (typeof orderId !== "string" || !orderId) return NextResponse.json({ error: "invalid order" }, { status: 400 });

  const { data: order } = await supabase.from("proxy_orders").select("stripe_session_id").eq("id", orderId).maybeSingle();
  const { error } = await supabase.rpc("cancel_proxy_order", { p_id: orderId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const stripe = getStripe();
  if (order?.stripe_session_id && stripe) await stripe.checkout.sessions.expire(order.stripe_session_id).catch(() => {});

  return NextResponse.json({ ok: true });
}
