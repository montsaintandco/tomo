import { createAdminSupabase } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { runMarketBidStripeCron } from "@/lib/market-bid.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 입찰 대행 Stripe 작업(0052). 부르는 쪽: pg_cron 1분(tomo_market_bids_stripe, 헤더 x-cron-secret = Vault tomo_cron_secret).
// 승인 해제 대기(releasing) 다시 해제 · 낙찰(won) 2분 넘은 건 매입·주문 전환 재시도. DB 판정은 pg_cron 이 cron_market_bids() 로 따로 한다.
// 플래그와 상관없이 돈다(접수가 꺼져도 진행 중 승인은 풀려야 한다). 할 일이 없으면 기록하지 않는다.
export async function POST(req: Request) {
  const admin = createAdminSupabase();
  const secret = req.headers.get("x-cron-secret") ?? "";
  const { data: okSecret } = secret ? await admin.rpc("cron_secret_ok", { p_secret: secret }) : { data: false };
  if (okSecret !== true) return Response.json({ error: "unauthorized" }, { status: 401 });
  const stripe = getStripe();
  if (!stripe) return Response.json({ ok: true, skipped: "STRIPE_SECRET_KEY not set" });
  try {
    const r = await runMarketBidStripeCron(stripe, admin);
    const did = r.released + r.releaseFailed + r.ordered + r.captureFailed + r.pending;
    if (did) await admin.from("cron_runs").insert({ job: "market_bids_stripe", ok: r.errors.length === 0, detail: { ...r, errors: r.errors.slice(0, 5) } });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("cron_runs").insert({ job: "market_bids_stripe", ok: false, detail: { error: msg.slice(0, 300) } });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
