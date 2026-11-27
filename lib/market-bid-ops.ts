// 입찰 대행 운영 조작 본체(M5) — tomo 어드민 /api/admin/market-bids(쿠키 운영자 세션)와 운영 API /api/ops/market-bids(연결 운영자 세션)가 같이 쓴다.
// sb = 운영자 「사용자 세션」(DB 가 is_admin_user()·활동 기록을 본다). admin = service_role(매입·주문 전환·승인 해제 기록). 돈 판정은 0052 가 한다.
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "./admin-actions";
import { releaseAuth, settleWon } from "./market-bid.server";
import { MB_OPS, type MbOp } from "./market-bid-admin";

const int = (v: unknown) => { const n = Number(v); return Number.isInteger(n) ? n : null; };
const txt = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const isMbOp = (v: unknown): v is MbOp => typeof v === "string" && (MB_OPS as readonly string[]).includes(v);

/** expected = 화면에서 본 상태(필수 아님: 운영 API 는 runOp 가 먼저 대조한다). Stripe 가 없으면 매입·해제를 못 하므로 낙찰·해제는 503 */
export async function runMbOp(sb: SupabaseClient, admin: SupabaseClient, stripe: Stripe | null, id: string, op: MbOp,
  b: Record<string, unknown>, expected: string | null): Promise<ActionResult> {
  const bad = (error: string, status = 400) => ({ status, body: { error } });
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const r = await sb.rpc(fn, args);
    return r.error ? { err: r.error.message } : { data: r.data as Record<string, unknown> };
  };
  if ((op === "won" || op === "lost" || op === "missed" || op === "cancel") && !stripe) return bad("STRIPE_KEYS_MISSING", 503);

  if (op === "placed") {
    const amount = int(b.amount);
    const ends = txt(b.ends_at, 40);
    if (!amount || amount <= 0) return bad("amount (엔, 정수) required");
    if (ends && Number.isNaN(Date.parse(ends))) return bad("ends_at must be ISO time");
    const r = await rpc("market_bid_set_placed", { p_id: id, p_amount: amount, p_note: txt(b.note), p_expected: expected, p_ends_at: ends || null });
    return "err" in r ? bad(r.err!) : { status: 200, body: { ok: true, status: r.data!.status } };
  }
  if (op === "outbid") {
    const price = int(b.price);
    if (!price) return bad("price (엔) required");
    const r = await rpc("market_bid_set_outbid", { p_id: id, p_price: price, p_note: txt(b.note), p_expected: expected });
    return "err" in r ? bad(r.err!) : { status: 200, body: { ok: true, status: r.data!.status } };
  }
  if (op === "hold") {
    const r = await rpc("market_bid_hold", { p_id: id, p_reason: txt(b.reason ?? b.note, 300), p_expected: expected });
    return "err" in r ? bad(r.err!) : { status: 200, body: { ok: true, status: r.data!.status } };
  }
  if (op === "won") {
    const final = int(b.final_price);
    const ship = b.ship == null || b.ship === "" ? null : int(b.ship);
    if (!final || final <= 0 || (b.ship != null && b.ship !== "" && (ship == null || ship < 0))) return bad("final_price (엔), ship (엔, 선택) required");
    const r = await rpc("market_bid_set_won", { p_id: id, p_final: final, p_ship: ship, p_note: txt(b.note), p_expected: expected });
    if ("err" in r) return bad(r.err!);
    const d = r.data!;
    // 검사 실패 → DB 가 보류로 바꿨다. 매입하지 않는다
    if (d.status === "hold") return { status: 409, body: { error: `mb: held (${d.reason})`, status: "hold", reason: d.reason, capture_krw: d.capture_krw, auth_krw: d.auth_krw } };
    const w = await settleWon(stripe!, admin, id);
    return { status: w.status === "ordered" ? 200 : 202, body: { ok: w.status !== "capture_failed", status: w.status, order_id: w.orderId ?? null,
      order_code: w.orderCode ?? null, capture_krw: d.capture_krw, again: !!d.again, error: w.error ?? null } };
  }
  // 유찰·못 넣음·운영 취소 → 승인 해제(실패하면 releasing 으로 남아 크론이 다시 한다)
  const to = op === "cancel" ? "cancelled" : op;
  const fin = op === "lost" ? int(b.final_seen) : null;
  const r = await rpc("market_bid_release", { p_id: id, p_to: to, p_reason: txt(b.reason ?? b.note, 300), p_final_seen: fin, p_expected: expected });
  if ("err" in r) return bad(r.err!);
  const rel = r.data!.release_auth_id as string | null;
  let released: boolean | null = null; let error: string | null = null;
  if (rel) {
    try { await releaseAuth(stripe!, admin, rel); released = true; } catch (e) { released = false; error = e instanceof Error ? e.message : String(e); }
  }
  return { status: 200, body: { ok: true, status: r.data!.status, released, error } };
}

/** 설정 변경(접수 스위치·한도). 운영자 세션 RPC */
export async function saveMbSettings(sb: SupabaseClient, b: Record<string, unknown>): Promise<ActionResult> {
  const p: Record<string, unknown> = {};
  if (typeof b.accepting === "boolean") p.accepting = b.accepting;
  for (const k of ["cap_max_jpy", "max_open", "max_open_per_user", "daily_cap_jpy", "min_lead_minutes", "max_lead_hours"]) {
    if (b[k] != null && b[k] !== "") { const n = int(b[k]); if (n == null) return { status: 400, body: { error: `${k} must be integer` } }; p[k] = n; }
  }
  if (!Object.keys(p).length) return { status: 400, body: { error: "nothing to change" } };
  const r = await sb.rpc("admin_market_bid_settings", { p });
  return r.error ? { status: 400, body: { error: r.error.message } } : { status: 200, body: { ok: true, settings: r.data } };
}
