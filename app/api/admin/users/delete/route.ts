import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { createAdminSupabase } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f-]{36}$/;
const BLOCKER: Record<string, string> = {
  admin: "운영자 계정(먼저 운영자 해제)", transactions: "진행 중 거래", proxy_requests: "진행 중 대행 요청",
  refunds: "환불 대기·실패", payouts: "출금 신청 중", balance: "정산 잔액",
};

// 운영자가 사용자 계정 완전 삭제 — DB(admin_prepare_user_delete, 0041)가 진행 거래·환불 대기·정산 잔액·출금 대기를 검사하고,
// 통과하면 프로필 익명화·정지·상품 숨김·푸시 삭제 + 활동 기록. 그 뒤 auth 계정만 지운다(거래 기록 보존).
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer?.isAdmin) return NextResponse.json({ error: "admin only" }, { status: 403 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });

  const { userId } = await req.json().catch(() => ({}));
  if (typeof userId !== "string" || !UUID.test(userId) || userId === viewer.id)
    return NextResponse.json({ error: "invalid user" }, { status: 400 });

  // 운영자 세션으로 부른다 → DB 가 is_admin_user(정지 검사 포함)를 다시 확인하고 기록에 운영자 이름을 남긴다
  const { data, error: prepErr } = await supabase.rpc("admin_prepare_user_delete", { p_user: userId });
  if (prepErr) return NextResponse.json({ error: prepErr.message }, { status: 400 });
  const r = data as { ok: boolean; blockers?: Record<string, unknown> } | null;
  if (!r?.ok) {
    const b = r?.blockers ?? {};
    const why = Object.entries(b)
      .map(([k, v]) => `${BLOCKER[k] ?? k}${typeof v === "number" ? ` ${v}건` : k === "balance" ? ` ${JSON.stringify(v)}` : ""}`)
      .join(", ");
    return NextResponse.json({ error: `삭제할 수 없어요: ${why || "확인 필요"}`, blockers: b }, { status: 409 });
  }

  const { error } = await createAdminSupabase().auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: `프로필은 익명화했지만 로그인 계정 삭제 실패: ${error.message}` }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
