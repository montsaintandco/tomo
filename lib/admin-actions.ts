import type { SupabaseClient } from "@supabase/supabase-js";
import { runRefund } from "@/lib/refunds";
import { createAdminSupabase } from "@/lib/supabase/admin";

// 운영자 조작 본체 — tomo 어드민 라우트(/api/admin/*, 쿠키 세션)와 운영 API(/api/ops/*, 연결된 운영자 세션)가 같이 쓴다.
// supabase 는 반드시 운영자 「사용자 세션」 클라이언트다. DB 가 is_admin_user()(정지 검사 포함)를 다시 확인하고 활동 기록에 그 운영자를 남긴다.
export type ActionResult = { status: number; body: Record<string, unknown> };

const UUID = /^[0-9a-f-]{36}$/;

/** 운영자 취소·분쟁 처리·강제 구매확정. 환불 행이 생기면 바로 Stripe 환불을 시도한다(실패·키 없음이면 /admin/refunds 대기열). */
export async function adminCancel(supabase: SupabaseClient, b: Record<string, unknown>): Promise<ActionResult> {
  const type = String(b.type ?? "");
  const id = String(b.id ?? "");
  const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 1000) : "";
  const bad = (error: string) => ({ status: 400, body: { error } });
  if (!UUID.test(id)) return bad("invalid id");

  let refundId: string | null = null;
  if (type === "tx") {
    if (!reason) return bad("사유를 적어 주세요");
    const { data, error } = await supabase.rpc("admin_cancel_transaction", { p_tx_id: id, p_reason: reason });
    if (error) return bad(error.message);
    refundId = (data as { refund?: string | null } | null)?.refund ?? null;
  } else if (type === "dispute") {
    const to = b.to === "completed" ? "completed" : b.to === "cancelled" ? "cancelled" : null;
    if (!to) return bad("invalid resolution");
    const { error } = await supabase.rpc("resolve_dispute", { p_tx_id: id, p_to: to, p_note: reason });
    if (error) return bad(error.message);
    if (to === "cancelled") {
      const { data: f } = await supabase.from("refunds").select("id").eq("kind", "tx").eq("transaction_id", id).neq("status", "done").maybeSingle();
      refundId = f?.id ?? null;
    }
  } else if (type === "complete") {
    const { error } = await supabase.rpc("admin_complete_transaction", { p_tx_id: id, p_note: reason });
    if (error) return bad(error.message);
  } else if (type === "proxy") {
    if (!reason) return bad("사유를 적어 주세요");
    const amt = b.refundAmount == null || b.refundAmount === "" ? null : Math.round(Number(b.refundAmount));
    if (amt != null && (!Number.isFinite(amt) || amt < 0)) return bad("invalid refund amount");
    const { data, error } = await supabase.rpc("admin_cancel_proxy", { p_id: id, p_reason: reason, p_refund_amount: amt });
    if (error) return bad(error.message);
    refundId = (data as { refund?: string | null } | null)?.refund ?? null;
  } else {
    return bad("invalid type");
  }

  if (!refundId) return { status: 200, body: { ok: true, refund: null } };
  const result = await runRefund(refundId);
  return { status: 200, body: { ok: true, refund: { id: refundId, ...result } } };
}

const BLOCKER: Record<string, string> = {
  admin: "운영자 계정(먼저 운영자 해제)", transactions: "진행 중 거래", proxy_requests: "진행 중 대행 요청",
  refunds: "환불 대기·실패", payouts: "출금 신청 중", balance: "정산 잔액",
};

/** 회원 완전 삭제 — DB(admin_prepare_user_delete, 0041)가 진행 거래·환불 대기·정산 잔액·출금 대기를 검사하고 익명화·기록, 그 뒤 auth 계정만 지운다. */
export async function adminDeleteUser(supabase: SupabaseClient, viewerId: string, userId: unknown): Promise<ActionResult> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { status: 503, body: { error: "SUPABASE_SERVICE_ROLE_KEY not set" } };
  if (typeof userId !== "string" || !UUID.test(userId) || userId === viewerId) return { status: 400, body: { error: "invalid user" } };

  const { data, error: prepErr } = await supabase.rpc("admin_prepare_user_delete", { p_user: userId });
  if (prepErr) return { status: 400, body: { error: prepErr.message } };
  const r = data as { ok: boolean; blockers?: Record<string, unknown> } | null;
  if (!r?.ok) {
    const b = r?.blockers ?? {};
    const why = Object.entries(b)
      .map(([k, v]) => `${BLOCKER[k] ?? k}${typeof v === "number" ? ` ${v}건` : k === "balance" ? ` ${JSON.stringify(v)}` : ""}`)
      .join(", ");
    return { status: 409, body: { error: `삭제할 수 없어요: ${why || "확인 필요"}`, blockers: b } };
  }
  const { error } = await createAdminSupabase().auth.admin.deleteUser(userId);
  if (error) return { status: 500, body: { error: `프로필은 익명화했지만 로그인 계정 삭제 실패: ${error.message}` } };
  return { status: 200, body: { deleted: true } };
}
