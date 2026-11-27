import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/listings";
import { refreshRates } from "@/lib/fx-refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 환율 자동 갱신. 부르는 쪽: ① DB pg_cron(매일 09:30 KST, 헤더 x-cron-secret = Vault tomo_cron_secret, 0042)
// ② 어드민 /admin/rates 「지금 갱신」·「보류 값 적용」(운영자 세션, force).
export async function POST(req: Request) {
  const admin = createAdminSupabase();
  const secret = req.headers.get("x-cron-secret") ?? "";
  let by = "";
  if (secret) {
    const { data } = await admin.rpc("cron_secret_ok", { p_secret: secret });
    if (data === true) by = "cron";
  }
  let force = false;
  if (!by) {
    const viewer = await getViewer(await createServerSupabase());
    if (!viewer?.isAdmin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    by = `admin:${viewer.id}`;
    force = (await req.json().catch(() => ({}))).force === true;
  }
  const run = await refreshRates(admin, { force, by });
  return NextResponse.json({ ok: run.ok, status: run.status }, { status: run.ok ? 200 : 502 });
}
