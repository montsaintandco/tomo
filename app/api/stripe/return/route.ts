import { NextResponse } from "next/server";
import { getStripe, type PayKind } from "@/lib/stripe";
import { settleSession, backPath } from "@/lib/stripe-settle";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";

// 결제 성공 리다이렉트(?session_id) → Stripe에서 세션을 직접 조회해 확정(멱등) → 거래/주문 페이지로.
// 세션 id만으로는 아무것도 못 한다: 상태·금액은 Stripe 서버 응답과 DB로 다시 확인한다. 확정 오류는 웹훅이 다시 시도한다.
export async function GET(req: Request) {
  const url = new URL(req.url);
  // 서버(standalone) 안에서 req.url 은 http://0.0.0.0:3000 이라 사이트 주소로 돌려보낸다
  const go = (path: string) => NextResponse.redirect(new URL(path, SITE_URL));
  const sid = url.searchParams.get("session_id") ?? "";
  const stripe = getStripe();
  if (!stripe || !/^cs_[A-Za-z0-9_]+$/.test(sid)) return go("/?pay=fail");

  let s;
  try { s = await stripe.checkout.sessions.retrieve(sid); } catch { return go("/?pay=fail&code=SESSION"); }
  const kind = s.metadata?.kind as PayKind | undefined;
  const id = s.metadata?.id;
  const back = (kind === "tx" || kind === "po") && id ? backPath(kind, id) : "/";
  try {
    const r = await settleSession(stripe, createAdminSupabase(), s);
    if (!r) return go("/?pay=fail&code=SESSION");
    return go(r.status === "paid" ? `${back}?pay=ok` : `${back}?pay=fail&code=${r.code ?? "FAIL"}`);
  } catch (e) {
    console.error("[stripe return] settle error", e instanceof Error ? e.message : e);
    return go(`${back}?pay=fail&code=CHECKING`);
  }
}