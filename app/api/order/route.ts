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
  const { data: profile } = await supabase.from("profiles").select("language, country").eq("id", auth.user.id).single();
  const lang = profile?.language === "ja" ? "ja" : "ko";

  let order: { id: string; total: number; currency: string; payment_method: string; status: string };
  if (typeof body.orderId === "string") {
    const { data } = await supabase.from("proxy_orders").select("id, total, currency, payment_method, status").eq("id", body.orderId).maybeSingle();
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

  // 승인 라우트가 orderId로 주문을 찾는다(mark_proxy_order_paid는 stripe_session_id 컬럼 재사용). service_role로 기록, 0건이면 열지 않는다
  const orderId = tossOrderId.po(order.id);
  const { data: updated, error: upErr } = await createAdminSupabase().from("proxy_orders")
    .update({ stripe_session_id: orderId }).eq("id", order.id).eq("status", "pending_payment").select("id");
  if (upErr || !updated || updated.length === 0) return NextResponse.json({ error: "결제 준비 중" }, { status: 503 });

  const { count } = await supabase.from("proxy_requests").select("*", { count: "exact", head: true }).eq("order_id", order.id);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.headers.get("origin") ?? new URL(req.url).origin;
  const toss: TossParams = {
    clientKey: keys.clientKey, orderId, amount, customerKey: auth.user.id,
    method: METHODS.includes(order.payment_method as Method) ? (order.payment_method as Method) : "card",
    orderName: t(lang, "order.stripeName", { n: count ?? 1 }),
    successUrl: `${origin}/api/toss/confirm`,
    failUrl: `${origin}/order/${order.id}?pay=fail`,
  };
  return NextResponse.json({ toss, orderId: order.id });
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
