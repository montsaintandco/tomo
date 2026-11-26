import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { runRefund } from "@/lib/refunds";

export const runtime = "nodejs";

const UUID = /^[0-9a-f-]{36}$/;

// 운영자 취소·분쟁 처리·강제 구매확정. DB 상태 변경(운영자 세션, is_admin_user 검사) → 환불 행이 생기면 바로 Stripe 환불 시도.
// Stripe 실패·키 없음이면 상태 변경은 유지되고 환불은 /admin/refunds 대기열에 남는다.
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer?.isAdmin) return NextResponse.json({ error: "admin only" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const type = String(b.type ?? "");
  const id = String(b.id ?? "");
  const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 1000) : "";
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  let refundId: string | null = null;
  if (type === "tx") {
    if (!reason) return NextResponse.json({ error: "사유를 적어 주세요" }, { status: 400 });
    const { data, error } = await supabase.rpc("admin_cancel_transaction", { p_tx_id: id, p_reason: reason });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    refundId = (data as { refund?: string | null } | null)?.refund ?? null;
  } else if (type === "dispute") {
    const to = b.to === "completed" ? "completed" : b.to === "cancelled" ? "cancelled" : null;
    if (!to) return NextResponse.json({ error: "invalid resolution" }, { status: 400 });
    const { error } = await supabase.rpc("resolve_dispute", { p_tx_id: id, p_to: to, p_note: reason });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (to === "cancelled") {
      const { data: f } = await supabase.from("refunds").select("id").eq("kind", "tx").eq("transaction_id", id).neq("status", "done").maybeSingle();
      refundId = f?.id ?? null;
    }
  } else if (type === "complete") {
    const { error } = await supabase.rpc("admin_complete_transaction", { p_tx_id: id, p_note: reason });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (type === "proxy") {
    if (!reason) return NextResponse.json({ error: "사유를 적어 주세요" }, { status: 400 });
    const amt = b.refundAmount == null || b.refundAmount === "" ? null : Math.round(Number(b.refundAmount));
    if (amt != null && (!Number.isFinite(amt) || amt < 0)) return NextResponse.json({ error: "invalid refund amount" }, { status: 400 });
    const { data, error } = await supabase.rpc("admin_cancel_proxy", { p_id: id, p_reason: reason, p_refund_amount: amt });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    refundId = (data as { refund?: string | null } | null)?.refund ?? null;
  } else {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }

  if (!refundId) return NextResponse.json({ ok: true, refund: null });
  const result = await runRefund(refundId);
  return NextResponse.json({ ok: true, refund: { id: refundId, ...result } });
}
