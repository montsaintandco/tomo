import type { SupabaseClient } from "@supabase/supabase-js";
import { adminCancel, adminDeleteUser, type ActionResult } from "@/lib/admin-actions";
import { runRefund, loadCancelPreviews } from "@/lib/refunds";
import { agingLevel, PROXY_STAGE, type AgingStage } from "@/lib/admin-aging";
import { SITE_URL } from "@/lib/site";
import { CENTER_COUNTRY, OPS_API_VERSION, OPS_CAPABILITIES, OPS_EVENT_TYPES, OPS_SITE, UUID_RE, type OpResult, type OpsScope } from "@/lib/ops-bridge";
import { listParam, opsFail, opsOk, paging, runOp, type OpsCtx } from "@/lib/ops-server";

// 운영 API v1 경로 표. 경로·요청·응답 형태는 docs/aaa/12 9장. 조작은 모두 기존 RPC·lib/admin-actions.ts 를 운영자 세션으로 부른다.

type Handler = (ctx: OpsCtx, p: string[]) => Promise<Response>;
type Route = { method: "GET" | "POST"; path: string; need: OpsScope | null; h: Handler };

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
const centerOf = (s: string) => ({ KR: "SEOUL", JP: "NARITA", SEOUL: "SEOUL", NARITA: "NARITA" } as Record<string, string>)[s.toUpperCase()] ?? null;

// ── 조회 ──
const meta: Handler = async () => opsOk({
  api_version: OPS_API_VERSION, site: { ...OPS_SITE, url: SITE_URL }, capabilities: OPS_CAPABILITIES, events: OPS_EVENT_TYPES,
  money_actions: ["proxy.cancel", "trades.cancel", "trades.complete", "disputes.resolve", "refunds.run", "payouts.paid", "payouts.reject", "users.delete"],
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
  const out = await Promise.all(specs.map(async (s) => {
    const r = await s.q;
    const base = { key: s.key, label: s.label, capability: s.capability, url: SITE_URL + s.url };
    if (r.error) return { ...base, count: null, overdue: null };
    const rows = (r.data ?? []) as Record<string, string>[];
    return { ...base, count: r.count ?? rows.length, overdue: rows.filter((x) => agingLevel(x[s.since], s.stage, now) === "late").length };
  }));
  return opsOk(out);
};

async function orderIdsByCode(admin: SupabaseClient, q: string): Promise<string[] | null> {
  if (!q) return null;
  if (UUID_RE.test(q)) return [q];
  const { data } = await admin.from("proxy_orders").select("id").eq("code", q.toUpperCase());
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
  return opsOk({ items: (r.data ?? []).map((x) => country(x as { center: string | null })), total: r.count });
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
  const code = str(url.searchParams.get("q"), 60);
  if (code) q = UUID_RE.test(code) ? q.eq("id", code) : q.eq("code", code.toUpperCase());
  const r = await q;
  if (r.error) return opsFail(502, `db: ${r.error.message}`);
  return opsOk({ items: (r.data ?? []).map((x) => country(x as { center: string | null })), total: r.count });
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
  return list(admin.from("support_tickets").select("id, user_id, category, item_url, item_option, quantity, order_ref, body, status, reply, answered_at, created_at, customer:profiles(nickname, language)", { count: "exact" })
    .in("status", listParam(url, "status", ["open"])).order("created_at", { ascending: true }).range(from, to));
};
const reportsList: Handler = async ({ admin, url }) => {
  const { from, to } = paging(url);
  return list(admin.from("reports").select("id, reporter_id, target_type, target_id, target_user_id, reason, detail, snapshot, status, resolved_at, resolution_note, created_at", { count: "exact" })
    .in("status", listParam(url, "status", ["open"])).order("created_at", { ascending: true }).range(from, to));
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

const ROUTES: Route[] = [
  { method: "GET", path: "meta", need: null, h: meta },
  { method: "GET", path: "health", need: null, h: health },
  { method: "GET", path: "counts", need: "ops", h: counts },
  { method: "GET", path: "proxy", need: "ops", h: proxyList },
  { method: "GET", path: "proxy/:id", need: "ops", h: proxyDetail },
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
  { method: "GET", path: "activity", need: "ops", h: activityList },
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
