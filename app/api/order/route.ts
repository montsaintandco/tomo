import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getStripe, krwAmount, createSession, type PayMethod } from "@/lib/stripe";
import { t } from "@/lib/i18n";

export const runtime = "nodejs";

type Method = PayMethod;
const METHODS: Method[] = ["card", "kakao_pay", "naver_pay"];

// 주문 생성 → Stripe 결제창 URL. 키 없으면 주문 만들기 전에 503 (스펙 §3). 미들웨어 밖 — 자체 인증
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "결제 준비 중" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const method: Method = METHODS.includes(body.method) ? body.method : "card";
  const { data: profile } = await supabase.from("profiles").select("language, country").eq("id", auth.user.id).single();
  const lang = profile?.language === "ja" ? "ja" : "ko";

  let order: { id: string; total: number; currency: string; payment_method: string; status: string; stripe_session_id?: string | null };
  if (typeof body.orderId === "string") {
    const { data } = await supabase.from("proxy_orders").select("id, total, currency, payment_method, status, stripe_session_id").eq("id", body.orderId).maybeSingle();
    if (!data || data.status !== "pending_payment") return NextResponse.json({ error: "order not payable" }, { status: 400 });
    order = data;
  } else {
    const ship = body.ship ?? {};
    if (!Array.isArray(body.itemIds) || body.itemIds.length === 0) return NextResponse.json({ error: "empty order" }, { status: 400 });
    const book = await prepareAddress(supabase, auth.user.id, profile?.country === "KR", ship, body.addressId, lang);
    if ("error" in book) return NextResponse.json({ error: book.error }, { status: 400 });
    const { data, error } = await supabase.rpc("create_proxy_order", {
      p_item_ids: body.itemIds, p_method: method,
      p_ship_name: String(ship.name ?? ""), p_ship_phone: String(ship.phone ?? ""), p_ship_postal: String(ship.postal ?? ""),
      p_ship_address: String(ship.address ?? ""), p_ship_note: String(ship.note ?? "").slice(0, 300),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    order = data;
    // 한국 수취: 주문에 통관부호 스냅샷. 실패하면 결제 전 주문을 취소하고 알린다
    if (book.addressId) {
      const { error: pErr } = await supabase.rpc("attach_order_pccc", { p_order_id: order.id, p_address_id: book.addressId });
      if (pErr) {
        await supabase.rpc("cancel_proxy_order", { p_id: order.id });
        return NextResponse.json({ error: t(lang, "addr.pcccRequired") }, { status: 400 });
      }
    }
  }

  const amount = await krwAmount(supabase, order.total, order.currency);
  if (amount == null) return NextResponse.json({ error: "결제 준비 중" }, { status: 503 });

  const { count } = await supabase.from("proxy_requests").select("*", { count: "exact", head: true }).eq("order_id", order.id);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.headers.get("origin") ?? new URL(req.url).origin;
  const prevSession = order.stripe_session_id?.startsWith("cs_") ? order.stripe_session_id : null;
  // 옛 창이 열려 있으면 그대로, 이미 결제됐으면 확정 경로로 보낸다(새 창으로 덮어쓰면 그 결제가 옛 창 취급돼 환불된다)
  if (prevSession) {
    const prev = await stripe.checkout.sessions.retrieve(prevSession).catch(() => null);
    if (prev?.status === "open" && prev.url) return NextResponse.json({ url: prev.url, orderId: order.id });
    if (prev?.status === "complete") return NextResponse.json({ url: `/api/stripe/return?session_id=${prev.id}`, orderId: order.id });
  }
  let session;
  try {
    session = await createSession(stripe, {
      kind: "po", id: order.id, amount, base: order.total, cur: order.currency, lang, email: auth.user.email,
      method: METHODS.includes(order.payment_method as Method) ? (order.payment_method as Method) : "card",
      name: t(lang, "order.stripeName", { n: count ?? 1 }), origin, back: `/order/${order.id}`,
    });
  } catch {
    return NextResponse.json({ error: "결제 세션 생성 실패", orderId: order.id }, { status: 400 });
  }

  // 확정은 stripe_session_id로 주문을 찾는다(mark_proxy_order_paid). service_role로 기록, 0건이면 세션을 만료하고 열지 않는다
  const { data: updated, error: upErr } = await createAdminSupabase().from("proxy_orders")
    .update({ stripe_session_id: session.id }).eq("id", order.id).eq("status", "pending_payment").select("id");
  if (upErr || !updated || updated.length === 0) {
    await stripe.checkout.sessions.expire(session.id).catch(() => {});
    return NextResponse.json({ error: "결제 준비 중" }, { status: 503 });
  }
  // 재결제: 이전 세션은 더 이상 확정되지 않으니 만료시켜 고객이 끝내지 못하게 한다(끝내도 확정 단계가 자동 환불)
  if (prevSession) await stripe.checkout.sessions.expire(prevSession).catch(() => {});
  return NextResponse.json({ url: session.url, orderId: order.id });
}
type Ship = { name?: unknown; phone?: unknown; postal?: unknown; address?: unknown; note?: unknown; pccc?: unknown };

// 주소록(0028) 준비. 테이블이 없거나 읽지 못하면 아무것도 안 한다(기존 profiles.ship_* 흐름 그대로).
// 한국 수취 + 주소록 있음: 통관부호 필수 → 고른 배송지에 저장(없으면 새로 만듦)하고 그 id 를 돌려준다.
// 주소록이 비어 있으면 이번 배송지를 기본으로 저장(다음 주문 프리필 — 0028 뒤에는 profiles.ship_* 를 못 읽는다).
async function prepareAddress(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>, uid: string, kr: boolean, ship: Ship, addressId: unknown, lang: "ko" | "ja",
): Promise<{ addressId: string | null } | { error: string }> {
  const probe = await supabase.from("addresses").select("id, pccc").eq("user_id", uid);
  if (probe.error) return { addressId: null };
  const list = probe.data ?? [];
  const s = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);
  const row = { name: s(ship.name, 60), phone: s(ship.phone, 30), postal: s(ship.postal, 12), address: s(ship.address), note: s(ship.note) };
  if (!kr) {
    if (list.length === 0 && row.name && row.phone && row.postal && row.address) {
      await supabase.from("addresses").insert({ ...row, user_id: uid, is_default: true });
    }
    return { addressId: null };
  }
  const pccc = s(ship.pccc, 20).toUpperCase();
  if (!/^P[0-9]{12}$/.test(pccc)) return { error: t(lang, "addr.pcccRequired") };
  const hit = typeof addressId === "string" ? list.find((a) => a.id === addressId) : undefined;
  if (hit) {
    if (hit.pccc !== pccc) {
      const { error } = await supabase.from("addresses").update({ pccc }).eq("id", hit.id);
      if (error) return { error: t(lang, "addr.fail") };
    }
    return { addressId: hit.id };
  }
  const { data, error } = await supabase.from("addresses")
    .insert({ ...row, pccc, user_id: uid, is_default: list.length === 0 }).select("id").single();
  if (error || !data) return { error: t(lang, error?.message?.includes("address limit") ? "addr.limit" : "addr.fail") };
  return { addressId: data.id };
}

// 주문 취소: RPC로 결제 전 주문만 취소 → 열린 Stripe 세션 만료(그래도 결제되면 확정 단계가 자동 환불)
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
  if (stripe && order?.stripe_session_id?.startsWith("cs_")) await stripe.checkout.sessions.expire(order.stripe_session_id).catch(() => {});
  return NextResponse.json({ ok: true });
}