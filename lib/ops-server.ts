import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { OPS_API_VERSION, UUID_RE, executeOnce, opsVerify, type OpResult, type OpsScope, type OpsStore } from "@/lib/ops-bridge";

// 운영 브리지 서버 쪽 — 서명 확인 → 연결된 운영자 확인 → (조작이면) 멱등 기록 + 운영자 사용자 세션으로 기존 RPC 실행.
// 운영자 이름으로 실행(설계 1안): 서비스 키로 그 운영자의 로그인 링크 토큰을 만들고(generateLink, 메일 안 보냄) 바로 세션으로 바꿔
// 사용자 권한으로 RPC 를 부른다. 끝나면 세션을 닫는다. RPC·is_admin_user()·활동 기록은 tomo 어드민에서 누른 것과 같다.

export type OpsActor = { id: string; profile_id: string | null; center_actor_id: string | null; center_actor_email: string; is_owner: boolean; is_system: boolean };
export type OpsCtx = { admin: SupabaseClient; actor: OpsActor | null; scope: OpsScope | null; body: Record<string, unknown>; url: URL };

export function opsJson(status: number, payload: Record<string, unknown>): Response {
  return Response.json({ api_version: OPS_API_VERSION, ...payload }, { status, headers: { "cache-control": "no-store" } });
}
export const opsOk = (data: unknown, request_id: string | null = null) => opsJson(200, { ok: true, data, request_id });
export const opsFail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  opsJson(status, { ok: false, error, request_id: null, ...extra });

/**
 * 시스템 주체(ops_actors.is_system, 0055 — 에어쉽 입찰 워커 다리 작업): 사람이 아니라 운영자 세션이 없다. 워커 경로(sys)만, scope ops 만.
 * money·사람 경로는 403. 사람 운영자는 워커 경로를 못 부른다(기록 주체가 섞이지 않게)
 */
export function opsActorGate(actor: Pick<OpsActor, "is_system">, scope: OpsScope, sysRoute: boolean): string | null {
  if (actor.is_system) {
    if (scope === "money") return "system actor: money not allowed";
    if (!sysRoute) return "system actor: route not allowed";
    return null;
  }
  return sysRoute ? "system route only" : null;
}

/** need: null = 서명만(meta·health), "ops" = 연결된 운영자, "money" = 연결된 소유자 + 요청 scope money. sysRoute = 워커 경로(시스템 주체 전용) */
export async function opsAuth(req: Request, need: OpsScope | null, sysRoute = false): Promise<{ ctx: OpsCtx } | { res: Response }> {
  const secret = process.env.OPS_BRIDGE_SECRET;
  if (!secret) return { res: opsFail(503, "ops bridge disabled") };
  const body = await req.text();
  const url = new URL(req.url);
  const v = opsVerify(req.headers, { method: req.method, path: url.pathname + url.search, body },
    { secret, keyId: process.env.OPS_BRIDGE_KEY_ID || "k1", nowS: Math.floor(Date.now() / 1000) });
  if (!v.ok) return { res: opsFail(v.status, v.error) };

  let json: Record<string, unknown> = {};
  if (body) {
    try { json = JSON.parse(body); } catch { return { res: opsFail(400, "invalid json") }; }
    if (!json || typeof json !== "object" || Array.isArray(json)) return { res: opsFail(400, "invalid json") };
  }
  const admin = createAdminSupabase();
  if (!need) return { ctx: { admin, actor: null, scope: v.scope, body: json, url } };

  if (!v.actor?.email) return { res: opsFail(403, "actor required") };
  if (!v.scope) return { res: opsFail(403, "scope required (ops|money)") };
  if (need === "money" && v.scope !== "money") return { res: opsFail(403, "money scope required") };
  const actor = await findActor(admin, v.actor.id, v.actor.email);
  if (!actor) return { res: opsFail(403, "actor not linked") };
  const gate = opsActorGate(actor, v.scope, sysRoute);
  if (gate) return { res: opsFail(403, gate) };
  if (actor.is_system) return { ctx: { admin, actor, scope: v.scope, body: json, url } };
  if (v.scope === "money" && !actor.is_owner) return { res: opsFail(403, "money scope is owner only") };
  const { data: p } = await admin.from("profiles").select("is_admin, suspended, deleted_at").eq("id", actor.profile_id).maybeSingle();
  if (!p?.is_admin || p.suspended || p.deleted_at) return { res: opsFail(403, "linked operator is not an active admin") };
  return { ctx: { admin, actor, scope: v.scope, body: json, url } };
}

const ACTOR_COLS = "id, profile_id, center_actor_id, center_actor_email, is_owner, is_system";

/** 센터 id 로 먼저 찾고, 없으면 이메일로 찾는다. 이메일로 찾은 행에 센터 id 가 비어 있으면 이번 id 로 채운다(이후로는 id 가 맞아야 한다) */
async function findActor(admin: SupabaseClient, centerId: string, email: string): Promise<OpsActor | null> {
  if (centerId) {
    const { data } = await admin.from("ops_actors").select(ACTOR_COLS).eq("active", true).eq("center_actor_id", centerId).maybeSingle();
    if (data) return data as OpsActor;
  }
  const { data } = await admin.from("ops_actors").select(ACTOR_COLS).eq("active", true).eq("center_actor_email", email).maybeSingle();
  const a = data as OpsActor | null;
  if (!a) return null;
  if (a.center_actor_id) return a.center_actor_id === centerId ? a : null;
  if (centerId) {
    await admin.from("ops_actors").update({ center_actor_id: centerId }).eq("id", a.id).is("center_actor_id", null);
    a.center_actor_id = centerId;
  }
  return a;
}

/** 연결된 운영자 사용자 세션으로 fn 을 실행하고 세션을 닫는다 */
export async function withActorSession<T>(admin: SupabaseClient, profileId: string, fn: (sb: SupabaseClient, uid: string) => Promise<T>): Promise<T> {
  const { data: u, error: ue } = await admin.auth.admin.getUserById(profileId);
  if (ue || !u.user?.email) throw new Error("operator login account not found");
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  if (link.error) throw new Error(`operator session: ${link.error.message}`);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const v = await createClient(url, anon, opts).auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
  const s = v.data.session;
  if (v.error || !s || s.user.id !== profileId) throw new Error(`operator session: ${v.error?.message ?? "no session"}`);
  const sb = createClient(url, anon, { ...opts, global: { headers: { Authorization: `Bearer ${s.access_token}` } } });
  try {
    return await fn(sb, profileId);
  } finally {
    await admin.auth.admin.signOut(s.access_token, "local").catch(() => {});
  }
}

function store(admin: SupabaseClient, actorId: string): OpsStore {
  return {
    async claim(requestId, action, target) {
      const { error } = await admin.from("ops_requests").insert({ request_id: requestId, actor_id: actorId, action, target });
      if (!error) return null;
      if (error.code !== "23505") throw new Error(`ops_requests: ${error.message}`);
      const { data } = await admin.from("ops_requests").select("actor_id, action, target, status, http_status, response").eq("request_id", requestId).single();
      return data;
    },
    async finish(requestId, httpStatus, response) {
      await admin.from("ops_requests").update({ status: "done", http_status: httpStatus, response, finished_at: new Date().toISOString() }).eq("request_id", requestId);
    },
  };
}

/** 조작 한 건. 본문 request_id(uuid)·expected_status 필수. session=false 면 운영자 세션 없이 run(서버 권한 동작, 예: 환불 실행) */
export async function runOp(ctx: OpsCtx, op: {
  action: string; target: string; current: () => Promise<string | null>;
  run: (sb: SupabaseClient | null, uid: string) => Promise<OpResult>; session?: boolean;
}): Promise<Response> {
  const requestId = String(ctx.body.request_id ?? "");
  const expected = typeof ctx.body.expected_status === "string" ? ctx.body.expected_status : "";
  if (!UUID_RE.test(requestId)) return opsFail(400, "request_id (uuid) required");
  if (!expected) return opsFail(400, "expected_status required", { request_id: requestId });
  const actor = ctx.actor!;
  let r;
  try {
    r = await executeOnce(store(ctx.admin, actor.id), {
      requestId, actorId: actor.id, action: op.action, target: op.target, expected, current: op.current,
      run: () => op.session === false ? op.run(null, actor.profile_id ?? "")
        : actor.profile_id ? withActorSession(ctx.admin, actor.profile_id, op.run) : Promise.reject(new Error("operator session required")),
    });
  } catch (e) {
    return opsFail(500, e instanceof Error ? e.message : "ops store error", { request_id: requestId });
  }
  const ok = r.status < 400;
  const { error, ...rest } = r.body as { error?: string };
  return opsJson(r.status, ok
    ? { ok: true, data: r.body, request_id: requestId, replayed: r.replayed }
    : { ok: false, error: error ?? "failed", ...rest, request_id: requestId, replayed: r.replayed });
}

/** 목록 쪽수: limit 1~200(기본 50), offset ≥ 0 */
export function paging(url: URL): { from: number; to: number; limit: number } {
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const from = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  return { from, to: from + limit - 1, limit };
}
export const listParam = (url: URL, name: string, dflt: string[] = []): string[] => {
  const v = url.searchParams.get(name);
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : dflt;
};
