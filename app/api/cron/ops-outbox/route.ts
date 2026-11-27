import { createAdminSupabase } from "@/lib/supabase/admin";
import { flushOutbox, OPS_API_VERSION, OPS_SITE, type OutboxRow } from "@/lib/ops-bridge";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 운영 이벤트 보내기. 부르는 쪽: DB pg_cron 1분마다(헤더 x-cron-secret = Vault tomo_cron_secret, 0043).
// OPS_HOOK_URL·OPS_HOOK_TOKEN 이 없으면 아무것도 잡지 않는다(이벤트는 outbox 에 남고 24시간 지나면 포기).
export async function POST(req: Request) {
  const admin = createAdminSupabase();
  const secret = req.headers.get("x-cron-secret") ?? "";
  const { data: okSecret } = secret ? await admin.rpc("cron_secret_ok", { p_secret: secret }) : { data: false };
  if (okSecret !== true) return Response.json({ error: "unauthorized" }, { status: 401 });
  const hook = process.env.OPS_HOOK_URL; const token = process.env.OPS_HOOK_TOKEN;
  if (!hook || !token) return Response.json({ ok: true, skipped: "OPS_HOOK_URL/OPS_HOOK_TOKEN not set" });

  const r = await flushOutbox({
    siteUrl: SITE_URL,
    claim: async () => {
      const { data, error } = await admin.rpc("ops_outbox_claim", { p_limit: 50 });
      if (error) throw new Error(error.message);
      return (data ?? []) as OutboxRow[];
    },
    mark: async (id, ok, err) => { await admin.rpc("ops_outbox_mark", { p_id: id, p_ok: ok, p_error: err }); },
    send: (body) => fetch(hook, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-ops-version": String(OPS_API_VERSION), "x-ops-site": OPS_SITE.key },
      body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
    }),
  });
  return Response.json({ ok: true, ...r });
}
