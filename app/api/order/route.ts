import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { tossKeys, krwAmount, tossOrderId, type TossParams } from "@/lib/toss";
import { t } from "@/lib/i18n";

export const runtime = "nodejs";

type Method = "card" | "kakao_pay" | "naver_pay";
const METHODS: Method[] = ["card", "kakao_pay", "naver_pay"];

// 주문 생성 → 토스 결제창 파라미터. 키 없으면 주문 만들기 전에 503 (스펙 §3). 미들웨어 밖 — 자체 인증
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const keys = tossKeys();
  if (!keys) return NextResponse.json({ error: "결제 준비 중" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const method: Method = METHODS.includes(body.method) ? body.method : "card";

  let order: { id: string; total: number; currency: string; payment_method: string; status: string };
  if (typeof body.orderId === "string") {
    const { data } = await supabase.from("proxy_orders").select("id, total, currency, payment_method, status").eq("id", body.orderId).maybeSingle();
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

  const amount = await krwAmount(supabase, order.total, order.currency);
  if (amount == null) return NextResponse.json({ error: "결제 준비 중" }, { status: 503 });

  // 승인 라우트가 orderId로 주문을 찾는다(mark_proxy_order_paid는 stripe_session_id 컬럼 재사용). service_role로 기록, 0건이면 열지 않는다
  const orderId = tossOrderId.po(order.id);
  const { data: updated, error: upErr } = await createAdminSupabase().from("proxy_orders")
    .update({ stripe_session_id: orderId }).eq("id", order.id).eq("status", "pending_payment").select("id");
  if (upErr || !updated || updated.length === 0) return NextResponse.json({ error: "결제 준비 중" }, { status: 503 });

  const { count } = await supabase.from("proxy_requests").select("*", { count: "exact", head: true }).eq("order_id", order.id);
  const { data: profile } = await supabase.from("profiles").select("language").eq("id", auth.user.id).single();
  const lang = profile?.language === "ja" ? "ja" : "ko";
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const toss: TossParams = {
    clientKey: keys.clientKey, orderId, amount, customerKey: auth.user.id,
    method: METHODS.includes(order.payment_method as Method) ? (order.payment_method as Method) : "card",
    orderName: t(lang, "order.stripeName", { n: count ?? 1 }),
    successUrl: `${origin}/api/toss/confirm`,
    failUrl: `${origin}/order/${order.id}?pay=fail`,
  };
  return NextResponse.json({ toss, orderId: order.id });
}

// 주문 취소: RPC로 결제 전 주문만 취소. 취소된 주문은 승인 라우트가 pending이 아니라서 확정하지 않는다
export async function DELETE(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { orderId } = body;
  if (typeof orderId !== "string" || !orderId) return NextResponse.json({ error: "invalid order" }, { status: 400 });

  const { error } = await supabase.rpc("cancel_proxy_order", { p_id: orderId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
