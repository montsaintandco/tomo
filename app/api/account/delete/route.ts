import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

// 본인 계정 삭제. 1) 익명화·상품 숨김(deactivate_my_account) 2) service_role 키가 있으면 auth 계정 완전 삭제.
// 키가 없으면 비활성화만 되고 202로 알린다 (키 투입 후 자동으로 완전 삭제로 승격)
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { label } = await req.json().catch(() => ({ label: "탈퇴한 사용자" }));
  const { error } = await supabase.rpc("deactivate_my_account", { p_label: String(label ?? "탈퇴한 사용자").slice(0, 40) });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await supabase.auth.signOut();
    return NextResponse.json({ deleted: false, deactivated: true }, { status: 202 });
  }
  const admin = createAdminSupabase();
  await admin.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("id", auth.user.id);
  await admin.from("push_subscriptions").delete().eq("user_id", auth.user.id);
  const { error: delErr } = await admin.auth.admin.deleteUser(auth.user.id);
  if (delErr) return NextResponse.json({ error: delErr.message, deactivated: true }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
