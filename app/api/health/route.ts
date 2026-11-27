import { createClient } from "@supabase/supabase-js";
import { allow, clientIp } from "@/lib/ratelimit";

// 스모크·외부 감시용. DB를 실제로 한 번 읽어 정지·장애를 잡는다. version 은 배포된 커밋(scripts/smoke.mjs 가 새 배포 도착을 이걸로 기다린다).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!allow(`health:${clientIp(req)}`, 30)) return new Response(null, { status: 429 });
  const version = process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev";
  const t = Date.now();
  let db = false;
  let embeds = "skip";
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { error } = await sb.from("listings").select("id").limit(1).abortSignal(AbortSignal.timeout(5000));
    db = !error;
    // 0051: 거래 화면이 쓰는 임베드(관계 이름 포함)와 경매 임베드. 깨지면(PGRST201 모호 등) 스모크가 잡는다. 사이트 상태(ok)와는 따로 둔다
    if (db) {
      const r = await Promise.all([
        sb.from("transactions").select("id, listings!transactions_listing_id_fkey(id)").limit(0).abortSignal(AbortSignal.timeout(5000)),
        sb.from("auctions").select("id, listings(id)").limit(0).abortSignal(AbortSignal.timeout(5000)),
      ]);
      embeds = r.map((x) => x.error ? x.error.code || "error" : "").filter(Boolean).join(",") || "ok";
    }
  } catch { /* 주소 없음·타임아웃 */ }
  return Response.json({ ok: db, db: db ? "ok" : "down", embeds, ms: Date.now() - t, version },
    { status: db ? 200 : 503, headers: { "cache-control": "no-store" } });
}
