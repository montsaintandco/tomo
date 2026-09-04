import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { createAdminSupabase } from "@/lib/supabase/admin";

// 운영자가 사용자 계정 완전 삭제 — 프로필은 익명화·정지 후 남기고(거래 기록 보존) auth 계정만 지운다
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer?.isAdmin) return NextResponse.json({ error: "admin only" }, { status: 403 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });

  const { userId } = await req.json().catch(() => ({}));
  if (typeof userId !== "string" || userId === viewer.id) return NextResponse.json({ error: "invalid user" }, { status: 400 });

  const admin = createAdminSupabase();
  await admin.from("profiles").update({ suspended: true, nickname: "탈퇴한 사용자", deleted_at: new Date().toISOString() }).eq("id", userId);
  await admin.from("listings").update({ hidden: true }).eq("seller_id", userId);
  await admin.from("push_subscriptions").delete().eq("user_id", userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
