import type { SupabaseClient } from "@supabase/supabase-js";
import { adminCancel, adminDeleteUser, type ActionResult } from "@/lib/admin-actions";
import { runRefund, loadCancelPreviews } from "@/lib/refunds";
import { agingLevel, PROXY_STAGE, type AgingStage } from "@/lib/admin-aging";
import { SITE_URL } from "@/lib/site";
import { CENTER_COUNTRY, OPS_API_VERSION, OPS_CAPABILITIES, OPS_EVENT_TYPES, OPS_SITE, UUID_RE, type OpResult, type OpsScope } from "@/lib/ops-bridge";
import { listParam, opsFail, opsOk, paging, runOp, withActorSession, type OpsCtx } from "@/lib/ops-server";
import { auctionAging, isAuctionTab } from "@/lib/auction-admin";
import { isMbTab, isMbWorkerResult, mbAging, mbWorkerPlan, MB_OPS, MB_OP_SCOPE } from "@/lib/market-bid-admin";
import { runMbOp, saveMbSettings } from "@/lib/market-bid-ops";
import { getStripe } from "@/lib/stripe";
import { parseOrderCode } from "@/lib/order-code";
import { INSPECTION_BUCKET, INSPECTION_MAX_PHOTOS, isInspectionKind, loadInspections, newPhotoPath, photoPathOk, type InspectionKind } from "@/lib/inspection";

// 운영 API v1 경로 표. 경로·요청·응답 형태는 docs/aaa/12 9장. 조작은 모두 기존 RPC·lib/admin-actions.ts 를 운영자 세션으로 부른다.

type Handler = (ctx: OpsCtx, p: string[]) => Promise<Response>;
type Route = { method: "GET" | "POST"; path: string; need: OpsScope | null; h: Handler; sys?: true };   // sys = 워커 경로(시스템 주체 전용, 0055)

const res = (r: ActionResult): OpResult => r;
const rpcRes = (r: { data: unknown; error: { message: string } | null }, okStatus = 200): OpResult =>
  r.error ? { status: 400, body: { error: r.error.message } } : { status: okStatus, body: { result: r.data } };
const country = <T extends { center?: string | null }>(r: T) => ({ ...r, center_country: r.center ? CENTER_COUNTRY[r.center] ?? null : null });
const str = (v: unknown, max = 1000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bad = (msg: string) => opsFail(400, msg);
const uuidOr404 = (id: string) => (UUID_RE.test(id) ? null : opsFail(404, "not found"));
type Q = PromiseLike<{ data: unknown; error: { message: string } | null; count?: number | null }>;
const list = async (q: Q) => {
  const r = await q;
  return r.error ? opsFail(502, `db: ${r.error.message}`) : opsOk({ items: r.data ?? [], total: r.count ?? null });
};
const statusOf = (admin: SupabaseClient, table: string, id: string, col = "status") => async () => {
  const { data } = await admin.from(table).select(col).eq("id", id).maybeSingle();
  return data ? String((data as unknown as Record<string, unknown>)[col]) : null;
};

const PROXY_COLS = `id, status, center, quote_item_price, quote_fee, quote_shipping, quote_total, intl_tracking, note, cancel_reason, cancel_requested_at,
  refund_amount, order_id, created_at, updated_at, external_items(title, title_translated, url, source, price, currency),
  customer:profiles!proxy_requests_user_id_fkey(id, nickname), proxy_orders(code, status, currency, total, paid_krw)`;
const TX_COLS = `id, code, status, center, is_cross_border, meetup, item_price, intl_shipping_fee, platform_fee, currency, paid_krw, refund_pending,
  dispute_reason, dispute_resolution, disputed_from, cancel_reason, domestic_tracking, intl_tracking, created_at, updated_at, delivered_at,
  listing:listings!transactions_listing_id_fkey(id, title, status), buyer:profiles!transactions_buyer_id_fkey(id, nickname), seller:profiles!transactions_seller_id_fkey(id, nickname)`;
// 지연 표시(lib/admin-aging.ts 기준 그대로). 행마다 aging_level(warn|late|null)·aging_since. 운영자 차례가 아닌 단계는 null
type Row = Record<string, unknown>;
const aged = (stageOf: (r: Row) => [AgingStage, string] | null) => (r: Row) => {
  const s = stageOf(r);
  const since = s ? (r[s[1]] as string | null) : null;
  return { ...r, aging_level: s ? agingLevel(since, s[0]) : null, aging_since: since };
};
const proxyAging = aged((r) => r.status === "paid" && r.cancel_requested_at ? ["cancel_req", "cancel_requested_at"]
  : PROXY_STAGE[String(r.status)] ? [PROXY_STAGE[String(r.status)]!, "updated_at"] : null);
const txAging = aged((r) => r.status === "disputed" ? ["dispute", "updated_at"]
  : r.status === "shipped_to_center" || r.status === "center_received" ? ["center", "updated_at"] : null);
const openAging = (stage: AgingStage) => aged((r) => (r.status === "open" ? [stage, "created_at"] : null));
const listAged = async (q: Q, f: (r: Row) => Row) => {
  const r = await q;
  return r.error ? opsFail(502, `db: ${r.error.message}`) : opsOk({ items: ((r.data ?? []) as Row[]).map(f), total: r.count ?? null });
};

const centerOf = (s: string) => ({ KR: "SEOUL", JP: "NARITA", SEOUL: "SEOUL", NARITA: "NARITA" } as Record<string, string>)[s.toUpperCase()] ?? null;

// ── 조회 ──
const meta: Handler = async () => opsOk({
  api_version: OPS_API_VERSION, site: { ...OPS_SITE, url: SITE_URL }, capabilities: OPS_CAPABILITIES, events: OPS_EVENT_TYPES,
  money_actions: ["proxy.cancel", "trades.cancel", "trades.complete", "disputes.resolve", "refunds.run", "payouts.paid", "payouts.reject", "users.delete", "ledger.adjust", "market_bids.won", "market_bids.missed", "market_bids.cancel", "market_bids.settings"],
});

const health: Handler = async ({ admin }) => {
  const t = Date.now();
  const day = new Date(t - 86_400_000).toISOString();
  const [runs, pending, failing, dead, last, errs] = await Promise.all([
    admin.from("cron_runs").select("job, ok, created_at").order("created_at", { ascending: false }).limit(300),
    admin.from("ops_outbox").select("id", { count: "exact", head: true }).is("sent_at", null).is("dead_at", null),
    admin.from("ops_outbox").select("id", { count: "exact", head: true }).is("sent_at", null).is("dead_at", null).gt("attempts", 0),
    admin.from("ops_outbox").select("id", { count: "exact", head: true }).gte("dead_at", day),
    admin.from("ops_outbox").select("sent_at").not("sent_at", "is", null).order("sent_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("error_events").select("id", { count: "exact", head: true }).gte("last_at", day),
  ]);
  const cron: Record<string, { ok: boolean; at: string }> = {};
  for (const r of (runs.data ?? []) as { job: string; ok: boolean; created_at: string }[]) cron[r.job] ??= { ok: r.ok, at: r.created_at };
  return opsOk({
    version: process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev", db: runs.error ? "down" : "ok", db_ms: Date.now() - t, cron,
    outbox: { hook_configured: !!process.env.OPS_HOOK_URL, pending: pending.count, failing: failing.count, dead_24h: dead.count,
      last_sent_at: (last.data as { sent_at: string } | null)?.sent_at ?? null },
    errors_24h: errs.count,
  });
};

/** 「내 차례」 건수 — 지연(overdue) 기준은 lib/admin-aging.ts. 조회 실패한 줄은 count=null(「확인 못 함」) */
const counts: Handler = async ({ admin }) => {
  const now = Date.now();
  type Spec = { key: string; label: string; capability: string; url: string; stage: AgingStage; since: string; q: Q };
  const pr = (cols: string) => admin.from("proxy_requests").select(cols, { count: "exact" });
  const specs: Spec[] = [
    { key: "proxy.purchase", label: "구매 필요", capability: "proxy", url: "/admin/orders", stage: PROXY_STAGE.paid!, since: "updated_at",
      q: pr("updated_at").eq("status", "paid").is("cancel_requested_at", null).order("updated_at").limit(1000) },
    { key: "proxy.cancel_requested", label: "취소 요청", capability: "proxy", url: "/admin/proxy?f=cancelreq", stage: "cancel_req", since: "cancel_requested_at",
      q: pr("cancel_requested_at").eq("status", "paid").not("cancel_requested_at", "is", null).order("cancel_requested_at").limit(1000) },
    { key: "proxy.inbound", label: "입고 대기", capability: "proxy", url: "/admin/orders", stage: "inbound", since: "updated_at",
      q: pr("updated_at").eq("status", "purchasing").order("updated_at").limit(1000) },
    { key: "proxy.intl_ship", label: "발송 대기", capability: "proxy", url: "/admin/orders", stage: "intl_ship", since: "updated_at",
      q: pr("updated_at").eq("status", "center_received").order("updated_at").limit(1000) },
    { key: "center.c2c", label: "센터 처리", capability: "center", url: "/admin/center", stage: "center", since: "updated_at",
      q: admin.from("transactions").select("updated_at", { count: "exact" }).in("status", ["shipped_to_center", "center_received"]).order("updated_at").limit(1000) },
    { key: "disputes.open", label: "분쟁", capability: "disputes", url: "/admin/disputes", stage: "dispute", since: "updated_at",
      q: admin.from("transactions").select("updated_at", { count: "exact" }).eq("status", "disputed").order("updated_at").limit(1000) },
    { key: "support.open", label: "문의 미답변", capability: "support", url: "/admin/support", stage: "support", since: "created_at",
      q: admin.from("support_tickets").select("created_at", { count: "exact" }).eq("status", "open").order("created_at").limit(1000) },
    { key: "refunds.pending", label: "환불 대기", capability: "refunds", url: "/admin/refunds", stage: "refund", since: "created_at",
      q: admin.from("refunds").select("created_at", { count: "exact" }).in("status", ["pending", "failed"]).order("created_at").limit(1000) },
    { key: "payouts.requested", label: "출금 요청", capability: "payouts", url: "/admin/payouts", stage: "payout", since: "requested_at",
      q: admin.from("payouts").select("requested_at", { count: "exact" }).eq("status", "requested").order("requested_at").limit(1000) },
    { key: "reports.open", label: "신고", capability: "reports", url: "/admin/reports", stage: "report", since: "created_at",
      q: admin.from("reports").select("created_at", { count: "exact" }).eq("status", "open").order("created_at").limit(1000) },
  ];
  const auc = admin.rpc("auction_ops_counts");   // 0048. 실패하면 경매 세 줄이 count=null
  const mbc = admin.rpc("market_bid_ops_counts");   // 0052. 실패하면 입찰 대행 네 줄이 count=null
  const out = await Promise.all(specs.map(async (s) => {
    const r = await s.q;
    const base = { key: s.key, label: s.label, capability: s.capability, url: SITE_URL + s.url };
    if (r.error) return { ...base, count: null, overdue: null };
    const rows = (r.data ?? []) as Record<string, string>[];
    return { ...base, count: r.count ?? rows.length, overdue: rows.filter((x) => agingLevel(x[s.since], s.stage, now) === "late").length };
  }));
  const a = await auc;
  const c = (a.error ? null : a.data) as Record<string, number> | null;
  const line = (key: string, label: string, tab: string, count: string, overdue: string | null) => ({
    key, label, capability: "auction", url: `${SITE_URL}/admin/auctions?tab=${tab}`,
    count: c ? Number(c[count] ?? 0) : null, overdue: c ? (overdue ? Number(c[overdue] ?? 0) : 0) : null,
  });
  const m = await mbc;
  const mc = (m.error ? null : m.data) as Record<string, number> | null;
  const mline = (key: string, label: string, tab: string, count: string, overdue: string | null) => ({
    key, label, capability: "market_auction", url: `${SITE_URL}/admin/market-bids?tab=${tab}`,
    count: mc ? Number(mc[count] ?? 0) : null, overdue: mc ? (overdue ? Number(mc[overdue] ?? 0) : 0) : null,
  });
  return opsOk([...out,
    line("auction.pay_due", "경매 결제 기한 임박(12시간)", "awaiting", "pay_due_soon", "pay_overdue"),
    line("auction.unpaid", "경매 미결제 뒤 판매자 선택 대기", "unpaid", "seller_choice", "seller_choice_old"),
    line("auction.flagged", "경매 의심 표시", "flagged", "flagged", null),
    // 입찰 대행(0052) 4줄: 입찰 필요(마감 2시간 안 = 지연), 보류(전부 지연), 낙찰 구매 필요(메루카리 24시간 기한, 18시간 지나면 지연), 매입 실패
    mline("market_bid.to_place", "마켓 입찰 필요", "to_place", "to_place", "to_place_soon"),
    mline("market_bid.hold", "마켓 입찰 보류", "hold", "hold", "hold"),
    mline("market_bid.won_check", "마켓 낙찰 확인 대기(워커)", "hold", "won_check", "won_check"),
    mline("market_bid.to_buy", "마켓 낙찰 구매 필요", "won", "to_buy", "to_buy_late"),
    mline("market_bid.capture_failed", "마켓 낙찰 매입 실패", "won", "capture_failed", "capture_failed")]);
};

// ── U5 경매(0048). 읽기 = admin_auctions·admin_auction_detail(서버 권한, 상한은 마감 뒤에만). 조작 = 운영자 세션 RPC, 돈이 안 움직여 ops ──
const auctionsList: Handler = async ({ admin, url }) => {
  const { from, limit } = paging(url);
  const tab = url.searchParams.get("status") || "live";
  if (!isAuctionTab(tab)) return bad("status must be live|awaiting|unpaid|ended|flagged|all");
  const r = await admin.rpc("admin_auctions", { p_tab: tab, p_q: str(url.searchParams.get("q"), 80) || null, p_limit: limit, p_offset: from });
  if (r.error) return opsFail(502, `db: ${r.error.message}`);
  const d = (r.data ?? { items: [], total: 0 }) as { items: Row[]; total: number };
  const now = Date.now();
  return opsOk({ items: d.items.map((x) => {
    const ag = auctionAging(x as Parameters<typeof auctionAging>[0], now);
    return { ...x, aging_level: ag?.level ?? null, aging_text: ag?.text ?? null };
  }), total: d.total });
};
const auctionDetail: Handler = async ({ admin }, [id]) => {
  const nf = uuidOr404(id); if (nf) return nf;
  const r = await admin.rpc("admin_auction_detail", { p_id: id });
  if (r.error) return opsFail(502, `db: ${r.error.message}`);
  return r.data ? opsOk(r.data) : opsFail(404, "not found");
};
const auctionOp = (act: "close" | "void_bid"): Handler => async (ctx, [id]) => {
  const nf = uuidOr404(id); if (nf) return nf;
  const note = str(ctx.body.note, 500);
  if (!note) return bad("note required");
  const bidder = str(ctx.body.bidder_id, 40);
  if (act === "void_bid" && !UUID_RE.test(bidder)) return bad("bidder_id (uuid) required");
  return runOp(ctx, { action: `auctions.${act}`, target: id, current: statusOf(ctx.admin, "auctions", id),
    run: async (sb) => rpcRes(act === "close"
      ? await sb!.rpc("admin_close_auction", { p_auction: id, p_note: note })
      : await sb!.rpc("admin_void_bid", { p_auction: id, p_bidder: bidder, p_note: note })) });
};
// 경고 해제: strike_id 는 이 경매의 경고이거나 이 경매 낙찰자의 경고. expected_status = active
const auctionClearStrike: Handler = async (ctx, [id]) => {
  const nf = uuidOr404(id); if (nf) return nf;
  const sid = str(ctx.body.strike_id, 40);
  const note = str(ctx.body.note, 500);
  if (!UUID_RE.test(sid)) return bad("strike_id (uuid) required");
  if (!note) return bad("note required");
  const [{ data: st }, { data: au }] = await Promise.all([
    ctx.admin.from("auction_strikes").select("user_id, auction_id").eq("id", sid).maybeSingle(),
    ctx.admin.from("auctions").select("winner_id").eq("id", id).maybeSingle(),
  ]);
  if (!st || !au || (st.auction_id !== id && st.user_id !== au.winner_id)) return opsFail(404, "strike not in this auction");
  return runOp(ctx, { action: "auctions.clear_strike", target: sid,
    current: async () => {
      const { data } = await ctx.admin.from("auction_strikes").select("lifted_at").eq("id", sid).maybeSingle();
      return data ? (data.lifted_at ? "lifted" : "active") : null;
    },
    run: async (sb) => rpcRes(await sb!.rpc("admin_clear_strike", { p_strike: sid, p_note: note })) });
};

// ── M5 입찰 대행(0052). 읽기 = admin_market_bids·admin_market_bid_detail(서버 권한). 조작 = lib/market-bid-ops.ts(운영자 세션 + 서버 매입·해제) ──
const mbList: Handler = async ({ admin, url }) => {
  const { from, limit } = paging(url);
  const tab = url.searchParams.get("status") || "to_place";
  if (!isMbTab(tab)) return bad("status must be to_place|bidding|hold|won|ended|all");
  const r = await admin.rpc("admin_market_bids", { p_tab: tab, p_q: str(url.searchParams.get("q"), 80) || null, p_limit: limit, p_offset: from });
  if (r.error) return opsFail(502, `db: ${r.error.message}`);
  const d = (r.data ?? { items: [], total: 0 }) as { items: Row[]; total: number };
  const now = Date.now();
  return opsOk({ items: d.items.map((x) => {
    const ag = mbAging(x as Parameters<typeof mbAging>[0], now);
    return { ...x, aging_level: ag?.level ?? null, aging_text: ag?.text ?? null };
  }), total: d.total });
};
const mbDetail: Handler = async ({ admin }, [id]) => {
  const nf = uuidOr404(id); if (nf) return nf;
  const r = await admin.rpc("admin_market_bid_detail", { p_id: id });
  if (r.error) return opsFail(502, `db: ${r.error.message}`);
  return r.data ? opsOk(r.data) : opsFail(404, "not found");
};
const mbSettingsGet: Handler = async ({ admin }) => {
  const r = await admin.from("market_bid_settings").select("*").maybeSingle();
  return r.error ? opsFail(502, `db: ${r.error.message}`) : opsOk(r.data);
};
// expected_status = accepting|paused(지금 접수 스위치)
const mbSettingsPost: Handler = async (ctx) => runOp(ctx, { action: "market_bids.settings", target: "settings",
  current: async () => { const { data } = await ctx.admin.from("market_bid_settings").select("accepting").maybeSingle(); return data ? (data.accepting ? "accepting" : "paused") : null; },
  run: async (sb) => saveMbSettings(sb!, ctx.body) });
// 조작: 입찰됨·밀림·보류·유찰 = ops, 낙찰 매입·못 넣음·운영 취소(승인 해제 강제) = money(lib/market-bid-admin.ts MB_OP_SCOPE)
const mbOpRoutes: Route[] = MB_OPS.map((op) => ({ method: "POST", path: `market-bids/:id/${op}`, need: MB_OP_SCOPE[op], h: async (ctx, [id]) => {
  const nf = uuidOr404(id); if (nf) return nf;
  return runOp(ctx, { action: `market_bids.${op}`, target: id, current: statusOf(ctx.admin, "market_bids", id),
    run: async (sb) => runMbOp(sb!, ctx.admin, getStripe(), id, op, ctx.body, String(ctx.body.expected_status), { workerClosed: op === "executor" }) });
} }));

// ── 0055 워커 연결(에어쉽 입찰 워커 다리 작업 전용, 시스템 주체·ops). 서버 권한(service_role)으로 DB 함수를 부른다. 매입은 여기서 못 한다 ──
// 대기 목록: executor='airship' · authorized(기본). ?ids=a,b(최대 100) 면 상태·실행자 상관없이 그 건들(에어쉽 행 맞추기용)
const MB_WORKER_COLS = `id, code, status, executor, executor_ref, armed_at, source, source_id, cap_jpy, seen_price_jpy, seen_bids, ends_at,
  authorized_at, auth_expires_at, placed_at, last_bid_jpy, worker_final_jpy, hold_reason, updated_at,
  item:external_items!market_bids_external_item_id_fkey(url, title, images)`;
const mbWorkerQueue: Handler = async ({ admin, url }) => {
  const ids = listParam(url, "ids");
  if (ids.length > 100 || ids.some((x) => !UUID_RE.test(x))) return bad("ids must be up to 100 uuids");
  let q = admin.from("market_bids").select(MB_WORKER_COLS, { count: "exact" });
  q = ids.length ? q.in("id", ids) : q.eq("executor", "airship").eq("status", "authorized");
  const r = await q.order("ends_at").limit(200);
  if (r.error) return opsFail(502, `db: ${r.error.message}`);
  return opsOk({ items: ((r.data ?? []) as unknown as (Row & { item: { url: string; title: string; images: string[] | null } | null })[]).map(({ item, ...x }) =>
    ({ ...x, url: item?.url ?? null, title: item?.title ?? null, image: item?.images?.[0] ?? null })), total: r.count ?? null });
};
// 워커 건이 아니면 상태 앞에 「manual:」을 붙여 expected_status 대조에서 409 가 나게 한다
const workerStatusOf = (admin: SupabaseClient, id: string) => async () => {
  const { data } = await admin.from("market_bids").select("status, executor").eq("id", id).maybeSingle();
  return data ? (data.executor === "airship" ? String(data.status) : `${data.executor}:${data.status}`) : null;
};
const mbArmed: Handler = async (ctx, [id]) => {
  const nf = uuidOr404(id); if (nf) return nf;
  const ref = str(ctx.body.executor_ref, 100);
  if (!ref) return bad("executor_ref required");
  return runOp(ctx, { action: "market_bids.armed", target: id, current: workerStatusOf(ctx.admin, id), session: false,
    run: async () => rpcRes(await ctx.admin.rpc("market_bid_set_armed", { p_id: id, p_ref: ref, p_expected: String(ctx.body.expected_status) })) });
};
const mbWorkerResult: Handler = async (ctx, [id]) => {
  const nf = uuidOr404(id); if (nf) return nf;
  const result = ctx.body.result;
  if (!isMbWorkerResult(result)) return bad("result must be placed|outbid|lost|failed|unknown|won");
  const expected = String(ctx.body.expected_status);
  return runOp(ctx, { action: `market_bids.worker.${result}`, target: id, current: workerStatusOf(ctx.admin, id), session: false,
    run: async () => {
      const { data: b } = await ctx.admin.from("market_bids").select("placed_at").eq("id", id).maybeSingle();
      const plan = mbWorkerPlan(result, ctx.body, !!b?.placed_at);
      if (typeof plan === "string") return { status: 400, body: { error: plan } };
      if (plan.op === "worker_won") return rpcRes(await ctx.admin.rpc("market_bid_worker_won", { p_id: id, p_final: plan.final, p_expected: expected }));
      return res(await runMbOp(ctx.admin, ctx.admin, getStripe(), id, plan.op, plan.body, expected));
    } });
};
// 건강 신호(1분마다, 덮어쓰기). 멱등 기록 없음(request_id 불필요)
const mbWorkerHealth: Handler = async ({ admin, body }) => {
  const r = await admin.rpc("market_bid_worker_health", { p: body });
  return r.error ? opsFail(400, r.error.message) : opsOk(r.data);
};

/** 검색어 → uuid 또는 정확한 번호. 상자에 적힌 「TOMO TX000123」·「t12」 같은 입력도 받는다(T4) */
export const opsCodeQ = (q: string) => {
  const s = q.trim().replace(/^TOMO\s*/i, "");
  return UUID_RE.test(s) ? s : (parseOrderCode(s)?.code ?? s.toUpperCase());
};

async function orderIdsByCode(admin: SupabaseClient, raw: string): Promise<string[] | null> {
  if (!raw) return null;
  const q = opsCodeQ(raw);
  if (UUID_RE.test(q)) return [q];
  const { data } = await admin.from("proxy_orders").select("id").eq("code", q);
  return (data ?? []).map((r) => r.id as string);
}

const proxyList: Handler = async ({ admin, url }) => {
  const { from, to } = paging(url);
  let q = admin.from("proxy_requests").select(PROXY_COLS, { count: "exact" }).order("updated_at", { ascending: false }).range(from, to);
  const st = listParam(url, "status");
  if (st.length) q = q.in("status", st);
  if (url.searchParams.get("cancel_requested") === "1") q = q.not("cancel_requested_at", "is", null);
  const ids = await orderIdsByCode(admin, str(url.searchParams.get("q"), 60));
  if (ids) q = q.in("order_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const r = await q;
  if (r.error) return opsFail(502, `db: ${r.error.message}`);
  return opsOk({ items: (r.data ?? []).map((x) => proxyAging(country(x as { center: string | null }))), total: r.count });
};

const proxyDetail: Handler = async ({ admin }, [id]) => {
  const nf = uuidOr404(id); if (nf) return nf;
  const { data: item, error } = await admin.from("proxy_requests").select(PROXY_COLS).eq("id", id).maybeSingle();
  if (error) return opsFail(502, `db: ${error.message}`);
  if (!item) return opsFail(404, "not found");
  const orderId = (item as { order_id: string | null }).order_id;
  const [order, siblings, refunds, previews] = orderId ? await Promise.all([
    admin.from("proxy_orders").select("id, code, status, currency, subtotal, intl_shipping, service_fee, total, rate, paid_krw, payment_method, ship_name, ship_phone, ship_postal, ship_address, ship_note, ship_pccc, created_at, updated_at").eq("id", orderId).maybeSingle(),
    admin.from("proxy_requests").select("id, status, center, quote_total, cancel_requested_at, external_items(title, price, currency)").eq("order_id", orderId).order("created_at"),
    admin.from("refunds").select("id, status, amount, currency, amount_krw, is_full, reason, attempts, last_error, created_at, done_at").eq("proxy_order_id", orderId).order("created_at"),
    loadCancelPreviews(admin, [orderId]),
  ]) : [null, null, null, {} as Record<string, never>];
  return opsOk({ item: country(item as { center: string | null }), order: order?.data ?? null,
    items: (siblings?.data ?? []).map((x) => country(x as { center: string | null })), refunds: refunds?.data ?? [], cancel_preview: previews[id] ?? null });
};

const txList = (fixed?: { status?: string[]; center?: boolean }): Handler => async ({ admin, url }, [center]) => {
  const { from, to } = paging(url);
  let q = admin.from("transactions").select(TX_COLS, { count: "exact" }).order("updated_at", { ascending: false }).range(from, to);
  const st = fixed?.status ?? listParam(url, "status");
  if (st.length) q = q.in("status", st);
  if (fixed?.center) {
    const c = centerOf(center ?? "");
    if (!c) return opsFail(404, "unknown center (SEOUL|NARITA|KR|JP)");
    q = q.eq("center", c);
  }
  const code = opsCodeQ(str(url.searchParams.get("q"), 60));
  if (code) q = UUID_RE.test(code) ? q.eq("id", code) : q.eq("code", code);
  const r = await q;
  if (r.error) return opsFail(502, `db: ${r.error.message}`);
  return opsOk({ items: (r.data ?? []).map((x) => txAging(country(x as { center: string | null }))), total: r.count });
};

const txDetail: Handler = async ({ admin }, [id]) => {
  const nf = uuidOr404(id); if (nf) return nf;
  const [t, refunds] = await Promise.all([
    admin.from("transactions").select(TX_COLS).eq("id", id).maybeSingle(),
    admin.from("refunds").select("id, status, amount, currency, amount_krw, is_full, reason, attempts, last_error, created_at, done_at").eq("transaction_id", id).order("created_at"),
  ]);
  if (t.error) return opsFail(502, `db: ${t.error.message}`);
  if (!t.data) return opsFail(404, "not found");
  return opsOk({ item: country(t.data as { center: string | null }), refunds: refunds.data ?? [] });
};

const REFUND_COLS = "id, kind, status, amount, currency, amount_krw, is_full, reason, attempts, last_error, transaction_id, proxy_order_id, proxy_request_id, user_id, created_at, done_at, customer:profiles!refunds_user_id_fkey(nickname)";
const refundsList: Handler = async ({ admin, url }) => {
  const { from, to } = paging(url);
  return list(admin.from("refunds").select(REFUND_COLS, { count: "exact" }).in("status", listParam(url, "status", ["pending", "failed"]))
    .order("created_at", { ascending: true }).range(from, to));
};
const payoutsList: Handler = async ({ admin, url }) => {
  const { from, to } = paging(url);
  return list(admin.from("payouts").select("id, user_id, currency, amount, bank_name, account_number, account_holder, status, admin_note, requested_at, processed_at, seller:profiles!payouts_user_id_fkey(nickname)", { count: "exact" })
    .in("status", listParam(url, "status", ["requested"])).order("requested_at", { ascending: true }).range(from, to));
};
const supportList: Handler = async ({ admin, url }) => {
  const { from, to } = paging(url);
  return listAged(admin.from("support_tickets").select("id, user_id, category, item_url, item_option, quantity, order_ref, body, status, reply, answered_at, created_at, customer:profiles(nickname, language)", { count: "exact" })
    .in("status", listParam(url, "status", ["open"])).order("created_at", { ascending: true }).range(from, to), openAging("support"));
};
const reportsList: Handler = async ({ admin, url }) => {
  const { from, to } = paging(url);
  return listAged(admin.from("reports").select("id, reporter_id, target_type, target_id, target_user_id, reason, detail, snapshot, status, resolved_at, resolution_note, created_at", { count: "exact" })
    .in("status", listParam(url, "status", ["open"])).order("created_at", { ascending: true }).range(from, to), openAging("report"));
};
const USER_COLS = "id, nickname, country, region, language, trust_temp, is_admin, suspended, deleted_at, created_at";
const usersList: Handler = async ({ admin, url }) => {
  const { from, to } = paging(url);
  let q = admin.from("profiles").select(USER_COLS, { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  const s = str(url.searchParams.get("q"), 40).replace(/[%,()]/g, "");
  if (s) q = UUID_RE.test(s) ? q.eq("id", s) : q.ilike("nickname", `%${s}%`);
  return list(q);
};
const userDetail: Handler = async ({ admin }, [id]) => {
  const nf = uuidOr404(id); if (nf) return nf;
  const { data, error } = await admin.from("profiles").select(USER_COLS).eq("id", id).maybeSingle();
  if (error) return opsFail(502, `db: ${error.message}`);
  if (!data) return opsFail(404, "not found");
  const { data: u } = await admin.auth.admin.getUserById(id);
  return opsOk({ ...data, email: u.user?.email ?? null });
};
const activityList: Handler = async ({ admin, url }) => {
  const { limit } = paging(url);
  let q = admin.from("admin_actions").select("id, admin_id, action, target_type, target_id, detail, created_at, admin:profiles!admin_actions_admin_id_fkey(nickname)")
    .order("id", { ascending: false }).limit(limit);
  const before = Number(url.searchParams.get("before_id"));
  if (before > 0) q = q.lt("id", before);
  const act = str(url.searchParams.get("action"), 60);
  if (act) q = q.eq("action", act);
  return list(q);
};

/** 지금 적용 중인 환율(exchange_rates)과 마지막 자동 갱신 결과(cron_runs job=rates). 운영자 화면 전용 */
const rates: Handler = async ({ admin }) => {
  const [r, run] = await Promise.all([
    admin.from("exchange_rates").select("pair, rate, updated_at").in("pair", ["JPY_KRW", "KRW_JPY"]),
    admin.from("cron_runs").select("ok, detail, created_at").eq("job", "rates").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (r.error) return opsFail(502, `db: ${r.error.message}`);
  const by = new Map(((r.data ?? []) as { pair: string; rate: number; updated_at: string }[]).map((x) => [x.pair, x]));
  const pick = (k: string) => { const x = by.get(k); return x ? { rate: Number(x.rate), updated_at: x.updated_at } : null; };
  const lr = run.data as { ok: boolean; detail: Record<string, unknown> | null; created_at: string } | null;
  return opsOk({ JPY_KRW: pick("JPY_KRW"), KRW_JPY: pick("KRW_JPY"),
    last_run: lr ? { ok: lr.ok, at: lr.created_at, status: lr.detail?.status ?? null, source_date: lr.detail?.source_date ?? null,
      raw: lr.detail?.raw ?? null, jpy_krw: lr.detail?.jpy_krw ?? null, change: lr.detail?.change ?? null, error: lr.detail?.error ?? null } : null });
};

/** 판매자 원장 통화별 잔액(원장 합, DB seller_balances 와 같은 규칙). 1000행씩 끝까지 읽는다. 조회 실패는 null */
async function ledgerBalance(admin: SupabaseClient, user: string): Promise<Record<string, number> | null> {
  const out: Record<string, number> = { KRW: 0, JPY: 0 };
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("seller_ledger").select("currency, amount").eq("user_id", user).order("id").range(from, from + 999);
    if (error) return null;
    for (const r of (data ?? []) as { currency: string; amount: number }[]) out[r.currency] = (out[r.currency] ?? 0) + Number(r.amount);
    if (!data || data.length < 1000) return out;
  }
}

// ── 조작(모두 request_id + expected_status) ──
const txAdvance = (checkCenter: boolean): Handler => async (ctx, p) => {
  const id = checkCenter ? p[1] : p[0];
  const nf = uuidOr404(id); if (nf) return nf;
  const to = str(ctx.body.to, 40);
  if (!to) return bad("to required");
  if (checkCenter) {
    const c = centerOf(p[0]);
    const { data } = await ctx.admin.from("transactions").select("center").eq("id", id).maybeSingle();
    if (!c || !data || data.center !== c) return opsFail(404, "not found in this center");
  }
  return runOp(ctx, { action: "trades.advance", target: id, current: statusOf(ctx.admin, "transactions", id),
    run: async (sb) => rpcRes(await sb!.rpc("advance_transaction", { p_tx_id: id, p_to: to, p_tracking: str(ctx.body.tracking, 100) || null })) });
};

// ── T4 센터 검수(0054). :kind = tx(직거래)|proxy(대행 요청). 사진은 서명 업로드 URL 로 센터 브라우저가 버킷에 바로 올린다(브리지로 파일을 나르지 않는다) ──
const inspTarget = (p: string[]): { kind: InspectionKind; id: string } | null =>
  isInspectionKind(p[0]) && UUID_RE.test(p[1] ?? "") ? { kind: p[0], id: p[1] } : null;
const inspStatus = (admin: SupabaseClient, k: { kind: InspectionKind; id: string }) =>
  statusOf(admin, k.kind === "tx" ? "transactions" : "proxy_requests", k.id);
/** 기록 목록(최신 먼저) + 대상의 지금 상태. 사진 = 서명 URL(10분) */
const inspectionsGet: Handler = async ({ admin }, p) => {
  const k = inspTarget(p);
  if (!k) return opsFail(404, "not found");
  const st = await inspStatus(admin, k)();
  if (!st) return opsFail(404, "not found");
  const items = await loadInspections(admin, k.kind, k.id);
  return items ? opsOk({ status: st, items }) : opsFail(502, "db: inspections");
};
/** 사진 올릴 자리 count 개(서명 업로드 URL, 2시간). DB 를 바꾸지 않아 request_id 기록 없이 expected_status 만 맞춘다 */
const inspectionsUpload: Handler = async ({ admin, body }, p) => {
  const k = inspTarget(p);
  if (!k) return opsFail(404, "not found");
  const n = Number(body.count);
  if (!Number.isInteger(n) || n < 1 || n > INSPECTION_MAX_PHOTOS) return bad(`count must be 1~${INSPECTION_MAX_PHOTOS}`);
  const st = await inspStatus(admin, k)();
  if (!st) return opsFail(404, "not found");
  if (st !== body.expected_status) return opsFail(409, "status mismatch", { current_status: st, expected_status: body.expected_status });
  const uploads: { path: string; url: string }[] = [];
  for (let i = 0; i < n; i++) {
    const path = newPhotoPath(k.kind, k.id, i);
    const { data, error } = await admin.storage.from(INSPECTION_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return opsFail(502, `storage: ${error?.message ?? "no url"}`);
    uploads.push({ path, url: data.signedUrl });
  }
  return opsOk({ uploads, method: "PUT", content_type: "image/jpeg", max_bytes: 5_242_880, expires_in: 7200 });
};
/** 기록 남기기 → admin_record_inspection(운영자 세션). receive=true 면 입고 처리(거래 shipped_to_center·대행 purchasing)도 같은 트랜잭션 */
const inspectionsRecord: Handler = async (ctx, p) => {
  const k = inspTarget(p);
  if (!k) return opsFail(404, "not found");
  const result = str(ctx.body.result, 10);
  if (result !== "ok" && result !== "issue") return bad("result must be ok|issue");
  const note = str(ctx.body.note, 2000);
  if (result === "issue" && !note) return bad("note required for issue");
  const photos = Array.isArray(ctx.body.photos) ? ctx.body.photos.map(String) : [];
  if (photos.length > INSPECTION_MAX_PHOTOS || photos.some((x) => !photoPathOk(k.kind, k.id, x))) return bad("bad photos");
  return runOp(ctx, { action: "inspections.record", target: k.id, current: inspStatus(ctx.admin, k),
    run: async (sb) => rpcRes(await sb!.rpc("admin_record_inspection", {
      p_kind: k.kind, p_target: k.id, p_result: result, p_note: note, p_photos: photos, p_receive: ctx.body.receive === true })) });
};
const ROUTES: Route[] = [
  { method: "GET", path: "meta", need: null, h: meta },
  { method: "GET", path: "health", need: null, h: health },
  { method: "GET", path: "counts", need: "ops", h: counts },
  { method: "GET", path: "proxy", need: "ops", h: proxyList },
  { method: "GET", path: "proxy/:id", need: "ops", h: proxyDetail },
  { method: "GET", path: "rates", need: "ops", h: rates },
  { method: "POST", path: "proxy/:id/quote", need: "ops", h: async (ctx, [id]) => {
    const nf = uuidOr404(id); if (nf) return nf;
    const n = (k: string) => { const v = Number(ctx.body[k]); return Number.isInteger(v) && v >= 0 && v <= 100_000_000 ? v : null; };
    const [item, fee, ship] = [n("item_price"), n("fee"), n("shipping")];
    if (item === null || fee === null || ship === null) return bad("item_price, fee, shipping (0~100000000 integer) required");
    return runOp(ctx, { action: "proxy.quote", target: id, current: statusOf(ctx.admin, "proxy_requests", id),
      run: async (sb) => rpcRes(await sb!.rpc("admin_quote_proxy", { p_id: id, p_item_price: item, p_fee: fee, p_shipping: ship })) });
  } },
  { method: "POST", path: "proxy/:id/status", need: "ops", h: async (ctx, [id]) => {
    const nf = uuidOr404(id); if (nf) return nf;
    const to = str(ctx.body.to, 40);
    if (!to) return bad("to required");
    return runOp(ctx, { action: "proxy.status", target: id, current: statusOf(ctx.admin, "proxy_requests", id),
      run: async (sb) => rpcRes(await sb!.rpc("admin_set_order_status", { p_id: id, p_status: to, p_note: str(ctx.body.note, 500), p_tracking: str(ctx.body.tracking, 100) || null })) });
  } },
  { method: "POST", path: "proxy/:id/cancel", need: "money", h: async (ctx, [id]) => {
    const nf = uuidOr404(id); if (nf) return nf;
    return runOp(ctx, { action: "proxy.cancel", target: id, current: statusOf(ctx.admin, "proxy_requests", id),
      run: async (sb) => res(await adminCancel(sb!, { type: "proxy", id, reason: ctx.body.reason, refundAmount: ctx.body.refund_amount })) });
  } },
  { method: "GET", path: "trades", need: "ops", h: txList() },
  { method: "GET", path: "trades/:id", need: "ops", h: txDetail },
  { method: "POST", path: "trades/:id/advance", need: "ops", h: txAdvance(false) },
  { method: "POST", path: "trades/:id/cancel", need: "money", h: async (ctx, [id]) => {
    const nf = uuidOr404(id); if (nf) return nf;
    return runOp(ctx, { action: "trades.cancel", target: id, current: statusOf(ctx.admin, "transactions", id),
      run: async (sb) => res(await adminCancel(sb!, { type: "tx", id, reason: ctx.body.reason })) });
  } },
  { method: "POST", path: "trades/:id/complete", need: "money", h: async (ctx, [id]) => {
    const nf = uuidOr404(id); if (nf) return nf;
    return runOp(ctx, { action: "trades.complete", target: id, current: statusOf(ctx.admin, "transactions", id),
      run: async (sb) => res(await adminCancel(sb!, { type: "complete", id, reason: ctx.body.note })) });
  } },
  { method: "GET", path: "center/:center", need: "ops", h: txList({ status: ["shipped_to_center", "center_received"], center: true }) },
  { method: "POST", path: "center/:center/:id/advance", need: "ops", h: txAdvance(true) },
  { method: "GET", path: "disputes", need: "ops", h: txList({ status: ["disputed"] }) },
  { method: "POST", path: "disputes/:id/resolve", need: "money", h: async (ctx, [id]) => {
    const nf = uuidOr404(id); if (nf) return nf;
    return runOp(ctx, { action: "disputes.resolve", target: id, current: statusOf(ctx.admin, "transactions", id),
      run: async (sb) => res(await adminCancel(sb!, { type: "dispute", id, to: ctx.body.to, reason: ctx.body.note })) });
  } },
  { method: "GET", path: "refunds", need: "money", h: refundsList },
  { method: "POST", path: "refunds/:id/run", need: "money", h: async (ctx, [id]) => {
    const nf = uuidOr404(id); if (nf) return nf;
    return runOp(ctx, { action: "refunds.run", target: id, current: statusOf(ctx.admin, "refunds", id), session: false,
      run: async () => { const r = await runRefund(id); return { status: r.status === "done" ? 200 : 202, body: { id, ...r } }; } });
  } },
  { method: "GET", path: "payouts", need: "money", h: payoutsList },
  ...(["paid", "reject"] as const).map((act): Route => ({ method: "POST", path: `payouts/:id/${act}`, need: "money", h: async (ctx, [id]) => {
    const nf = uuidOr404(id); if (nf) return nf;
    return runOp(ctx, { action: `payouts.${act}`, target: id, current: statusOf(ctx.admin, "payouts", id),
      run: async (sb) => rpcRes(await sb!.rpc("admin_process_payout", { p_id: id, p_sent: act === "paid", p_note: str(ctx.body.note, 500) })) });
  } })),
  { method: "GET", path: "support", need: "ops", h: supportList },
  { method: "POST", path: "support/:id/reply", need: "ops", h: async (ctx, [id]) => {
    const nf = uuidOr404(id); if (nf) return nf;
    const reply = str(ctx.body.reply, 2000);
    if (!reply) return bad("reply required");
    return runOp(ctx, { action: "support.reply", target: id, current: statusOf(ctx.admin, "support_tickets", id),
      run: async (sb) => rpcRes(await sb!.from("support_tickets").update({ reply, status: "answered", answered_at: new Date().toISOString() }).eq("id", id).select("id, status").single()) });
  } },
  { method: "POST", path: "support/:id/close", need: "ops", h: async (ctx, [id]) => {
    const nf = uuidOr404(id); if (nf) return nf;
    return runOp(ctx, { action: "support.close", target: id, current: statusOf(ctx.admin, "support_tickets", id),
      run: async (sb) => rpcRes(await sb!.from("support_tickets").update({ status: "closed" }).eq("id", id).select("id, status").single()) });
  } },
  { method: "GET", path: "reports", need: "ops", h: reportsList },
  { method: "POST", path: "reports/:id/act", need: "ops", h: async (ctx, [id]) => {
    const nf = uuidOr404(id); if (nf) return nf;
    const st = str(ctx.body.status, 20);
    if (!["resolved", "dismissed", "open"].includes(st)) return bad("status must be resolved|dismissed|open");
    return runOp(ctx, { action: "reports.act", target: id, current: statusOf(ctx.admin, "reports", id),
      run: async (sb) => {
        const r = await sb!.rpc("admin_resolve_report", { p_id: id, p_status: st, p_note: str(ctx.body.note, 500) });
        if (r.error) return { status: 400, body: { error: r.error.message } };
        const rep = r.data as { target_type?: string; target_id?: string } | null;
        let hidden: boolean | null = null;
        if (ctx.body.hide_listing === true && rep?.target_type === "listing" && rep.target_id) {
          const h = await sb!.rpc("admin_set_listing_hidden", { p_id: rep.target_id, p_hidden: true });
          hidden = !h.error;
        }
        return { status: 200, body: { result: r.data, listing_hidden: hidden } };
      } });
  } },
  { method: "GET", path: "users", need: "ops", h: usersList },
  { method: "GET", path: "users/:id", need: "ops", h: userDetail },
  { method: "POST", path: "users/:id/suspend", need: "ops", h: async (ctx, [id]) => {
    const nf = uuidOr404(id); if (nf) return nf;
    if (typeof ctx.body.suspended !== "boolean") return bad("suspended (boolean) required");
    const suspended = ctx.body.suspended;
    const userState = async () => {
      const { data } = await ctx.admin.from("profiles").select("suspended").eq("id", id).maybeSingle();
      return data ? (data.suspended ? "suspended" : "active") : null;
    };
    return runOp(ctx, { action: "users.suspend", target: id, current: userState,
      run: async (sb) => {
        const { data: p } = await ctx.admin.from("profiles").select("is_admin").eq("id", id).maybeSingle();
        return rpcRes(await sb!.rpc("admin_set_user", { p_id: id, p_suspended: suspended, p_admin: !!p?.is_admin }));
      } });
  } },
  { method: "POST", path: "users/:id/delete", need: "money", h: async (ctx, [id]) => {
    const nf = uuidOr404(id); if (nf) return nf;
    const userState = async () => {
      const { data } = await ctx.admin.from("profiles").select("suspended, deleted_at").eq("id", id).maybeSingle();
      return data ? (data.deleted_at ? "deleted" : data.suspended ? "suspended" : "active") : null;
    };
    return runOp(ctx, { action: "users.delete", target: id, current: userState,
      run: async (sb, uid) => res(await adminDeleteUser(sb!, uid, id)) });
  } },
  // A3: 미지급 합계(admin_seller_liability, 운영자 세션), 판매자 원장 잔액·조정, 보류 상품 반송 확인·해제
  { method: "GET", path: "payouts/summary", need: "money", h: async ({ admin, actor }) => {
    const r = await withActorSession(admin, actor!.profile_id!, async (sb) => sb.rpc("admin_seller_liability"));
    return r.error ? opsFail(502, `db: ${r.error.message}`) : opsOk({ items: r.data ?? [] });
  } },
  { method: "GET", path: "users/:id/ledger", need: "money", h: async ({ admin }, [id]) => {
    const nf = uuidOr404(id); if (nf) return nf;
    const [bal, recent] = await Promise.all([ledgerBalance(admin, id),
      admin.from("seller_ledger").select("id, currency, amount, kind, memo, created_at").eq("user_id", id).order("id", { ascending: false }).limit(20)]);
    if (!bal || recent.error) return opsFail(502, `db: ${recent.error?.message ?? "ledger"}`);
    return opsOk({ balances: bal, recent: recent.data ?? [] });
  } },
  // expected_status = "<통화>:<지금 잔액>" — 화면에서 본 잔액이 그사이 바뀌었으면 409
  { method: "POST", path: "users/:id/ledger_adjust", need: "money", h: async (ctx, [id]) => {
    const nf = uuidOr404(id); if (nf) return nf;
    const cur = str(ctx.body.currency, 3);
    const amt = Number(ctx.body.amount);
    const memo = str(ctx.body.memo, 500);
    if (cur !== "KRW" && cur !== "JPY") return bad("currency must be KRW|JPY");
    if (!Number.isInteger(amt) || amt === 0 || Math.abs(amt) > 100_000_000) return bad("amount must be a non-zero integer");
    if (!memo) return bad("memo required");
    return runOp(ctx, { action: "ledger.adjust", target: id,
      current: async () => { const b = await ledgerBalance(ctx.admin, id); return b ? `${cur}:${b[cur] ?? 0}` : null; },
      run: async (sb) => rpcRes(await sb!.rpc("admin_adjust_seller_ledger", { p_user: id, p_currency: cur, p_amount: amt, p_memo: memo })) });
  } },
  { method: "POST", path: "listings/:id/release", need: "ops", h: async (ctx, [id]) => {
    const nf = uuidOr404(id); if (nf) return nf;
    const note = str(ctx.body.note, 300);
    if (!note) return bad("note required");
    return runOp(ctx, { action: "listings.release", target: id, current: statusOf(ctx.admin, "listings", id),
      run: async (sb) => rpcRes(await sb!.rpc("admin_release_listing_hold", { p_id: id, p_note: note })) });
  } },
  { method: "GET", path: "activity", need: "ops", h: activityList },
  // T4 센터 검수(0054). upload 를 :kind/:id 보다 먼저(길이가 달라 겹치지는 않는다)
  { method: "GET", path: "inspections/:kind/:id", need: "ops", h: inspectionsGet },
  { method: "POST", path: "inspections/:kind/:id/upload", need: "ops", h: inspectionsUpload },
  { method: "POST", path: "inspections/:kind/:id", need: "ops", h: inspectionsRecord },
  // U5 경매(0048)
  { method: "GET", path: "auctions", need: "ops", h: auctionsList },
  { method: "GET", path: "auctions/:id", need: "ops", h: auctionDetail },
  { method: "POST", path: "auctions/:id/close", need: "ops", h: auctionOp("close") },
  { method: "POST", path: "auctions/:id/void_bid", need: "ops", h: auctionOp("void_bid") },
  { method: "POST", path: "auctions/:id/clear_strike", need: "ops", h: auctionClearStrike },
  // M5 입찰 대행(0052). settings 를 :id 보다 먼저
  { method: "GET", path: "market-bids", need: "ops", h: mbList },
  { method: "GET", path: "market-bids/settings", need: "ops", h: mbSettingsGet },
  { method: "GET", path: "market-bids/worker-queue", need: "ops", h: mbWorkerQueue, sys: true },
  { method: "POST", path: "market-bids/worker-health", need: "ops", h: mbWorkerHealth, sys: true },
  { method: "POST", path: "market-bids/:id/armed", need: "ops", h: mbArmed, sys: true },
  { method: "POST", path: "market-bids/:id/worker-result", need: "ops", h: mbWorkerResult, sys: true },
  { method: "POST", path: "market-bids/settings", need: "money", h: mbSettingsPost },
  { method: "GET", path: "market-bids/:id", need: "ops", h: mbDetail },
  ...mbOpRoutes,
];

/** 경로 맞추기. ":x" 칸은 그 자리 값을 순서대로 넘긴다 */
export function matchOps(method: string, segs: string[]): { route: Route; params: string[] } | null {
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const parts = route.path.split("/");
    if (parts.length !== segs.length) continue;
    const params: string[] = [];
    if (parts.every((p, i) => (p.startsWith(":") ? (params.push(decodeURIComponent(segs[i])), true) : p === segs[i]))) return { route, params };
  }
  return null;
}
export const OPS_ROUTE_LIST = ROUTES.map((r) => `${r.method} /api/ops/${r.path} (${r.need ?? "sign"})`);
