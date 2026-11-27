import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// 운영 브리지 v1 — 서명·멱등 규칙(순수 함수). DB·네트워크는 lib/ops-server.ts. 설계 docs/aaa/12 3.2·3.3·8.3, 구현 표는 같은 문서 9장.

export const OPS_API_VERSION = 1;
export const OPS_SITE = { key: "tomo", name: "TOMO", currency: "KRW" } as const;
export const OPS_CAPABILITIES = ["proxy", "c2c", "center", "disputes", "refunds", "payouts", "support", "reports", "users", "activity", "auction"] as const;
export const OPS_EVENT_TYPES = ["order.paid", "order.cancel_requested", "dispute.opened", "ticket.opened",
  "refund.pending", "payout.requested", "report.opened", "errors.spike", "cron.failed",
  "auction.ended", "auction.unpaid", "auction.cancelled", "auction.flagged"] as const;   // auction.* = 0048
export const CENTER_COUNTRY: Record<string, "KR" | "JP"> = { SEOUL: "KR", NARITA: "JP" };
export const MAX_SKEW_S = 300;

export type OpsScope = "ops" | "money";
export type OpsActorHeader = { id: string; email: string };

export type SignInput = {
  keyId: string; ts: string; method: string; path: string;   // path = 경로 + 쿼리(보낸 그대로)
  actorId: string; actorEmail: string; scope: string; body: string;
};

/** 경로 정규화 — 쿼리는 URLSearchParams 로 다시 직렬화한다(프록시·Next 가 `,` 같은 글자를 %2C 로 바꿔도 같은 값이 되게) */
export function opsCanonicalPath(path: string): string {
  const i = path.indexOf("?");
  if (i < 0) return path;
  const q = new URLSearchParams(path.slice(i + 1)).toString();
  return q ? `${path.slice(0, i)}?${q}` : path.slice(0, i);
}

/** 서명할 문자열. 본문은 SHA-256 hex 로 넣는다(빈 본문도 빈 문자열의 해시) */
export function opsCanonical(p: SignInput): string {
  const bodyHash = createHash("sha256").update(p.body, "utf8").digest("hex");
  return ["v1", p.keyId, p.ts, p.method.toUpperCase(), opsCanonicalPath(p.path), p.actorId, p.actorEmail.toLowerCase(), p.scope, bodyHash].join("\n");
}

export function opsSign(secret: string, p: SignInput): string {
  return createHmac("sha256", secret).update(opsCanonical(p), "utf8").digest("hex");
}

/** 상수 시간 비교 — 길이가 달라도 같은 시간(해시를 한 번 더 씌워 길이를 맞춘다) */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

type H = { get(name: string): string | null };
export type VerifyResult =
  | { ok: true; actor: OpsActorHeader | null; scope: OpsScope | null }
  | { ok: false; status: 400 | 401; error: string };

/** 헤더 검사: 버전 → 키 id → 시각(±5분) → 서명. 실패 이유는 401 한 가지 문구로 뭉뚱그리지 않되 비밀값 정보는 내지 않는다 */
export function opsVerify(h: H, req: { method: string; path: string; body: string }, cfg: { secret: string; keyId: string; nowS: number }): VerifyResult {
  const v = h.get("x-ops-version");
  if (v !== String(OPS_API_VERSION)) return { ok: false, status: 400, error: `unsupported x-ops-version (supported: ${OPS_API_VERSION})` };
  const keyId = h.get("x-ops-key-id") ?? "";
  const ts = h.get("x-ops-ts") ?? "";
  const sig = (h.get("x-ops-sig") ?? "").toLowerCase();
  if (!keyId || !ts || !sig) return { ok: false, status: 401, error: "missing signature headers" };
  if (!safeEqual(keyId, cfg.keyId)) return { ok: false, status: 401, error: "unknown key id" };
  const t = Number(ts);
  if (!/^\d{9,11}$/.test(ts) || Math.abs(cfg.nowS - t) > MAX_SKEW_S) return { ok: false, status: 401, error: "timestamp out of range" };
  const actorId = h.get("x-ops-actor-id") ?? "";
  const actorEmail = (h.get("x-ops-actor-email") ?? "").trim().toLowerCase();
  const scopeRaw = h.get("x-ops-scope") ?? "";
  const expect = opsSign(cfg.secret, { keyId, ts, method: req.method, path: req.path, actorId, actorEmail, scope: scopeRaw, body: req.body });
  if (!safeEqual(sig, expect)) return { ok: false, status: 401, error: "bad signature" };
  const scope = scopeRaw === "ops" || scopeRaw === "money" ? scopeRaw : null;
  const actor = actorId || actorEmail ? { id: actorId, email: actorEmail } : null;
  return { ok: true, actor, scope };
}

// ── 멱등 실행 ──
export type StoredOp = { actor_id?: string; action: string; target: string; status: "running" | "done"; http_status: number | null; response: unknown };
export type OpsStore = {
  /** request_id 로 행을 처음 만들면 null, 이미 있으면 그 행 */
  claim(requestId: string, action: string, target: string): Promise<StoredOp | null>;
  finish(requestId: string, httpStatus: number, response: unknown): Promise<void>;
};
export type OpResult = { status: number; body: Record<string, unknown> };

/**
 * 같은 request_id 는 한 번만 실행한다.
 * 1) 처음이면 기록 → 현재 상태가 expected 와 다르면 409(실행 안 함) → 실행 → 결과 저장.
 * 2) 이미 있으면: 동작·대상이 다르면 409(재사용), 실행 중이면 409(in_progress), 끝났으면 저장된 결과 그대로(replayed).
 * 실행이 예외로 끝나면 결과를 모른다 → 500 「결과 확인 못 함」을 저장한다(같은 id 로 다시 실행하지 않는다).
 */
export async function executeOnce(store: OpsStore, op: {
  requestId: string; actorId?: string; action: string; target: string; expected: string;
  current: () => Promise<string | null>; run: () => Promise<OpResult>;
}): Promise<OpResult & { replayed: boolean }> {
  const prev = await store.claim(op.requestId, op.action, op.target);
  if (prev) {
    if (prev.action !== op.action || prev.target !== op.target || (op.actorId && prev.actor_id && prev.actor_id !== op.actorId))
      return { status: 409, body: { error: "request_id already used for another action" }, replayed: true };
    if (prev.status === "running") return { status: 409, body: { error: "in_progress" }, replayed: true };
    return { status: prev.http_status ?? 500, body: (prev.response ?? {}) as Record<string, unknown>, replayed: true };
  }
  let res: OpResult;
  try {
    const cur = await op.current();
    if (cur == null) res = { status: 404, body: { error: "not found" } };
    else if (cur !== op.expected) res = { status: 409, body: { error: "status mismatch", current_status: cur, expected_status: op.expected } };
    else res = await op.run();
  } catch (e) {
    res = { status: 500, body: { error: `result unknown: ${e instanceof Error ? e.message : "error"}` } };
  }
  await store.finish(op.requestId, res.status, res.body);
  return { ...res, replayed: false };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── 이벤트 본문(8.3 공통 칸) ──
export type OutboxRow = {
  id: number; event_id: string; type: string; code: string | null; amount: number | null; currency: string | null;
  path: string | null; target_type: string | null; target_id: string | null; occurred_at: string;
};
export function eventBody(r: OutboxRow, siteUrl: string) {
  return {
    api_version: OPS_API_VERSION, event_id: r.event_id, site_key: OPS_SITE.key, type: r.type,
    code: r.code, amount: r.amount, currency: r.currency, url: r.path ? siteUrl + r.path : null,
    occurred_at: r.occurred_at, target: r.target_type ? { type: r.target_type, id: r.target_id } : null,
  };
}

/** outbox 보내기 한 바퀴. 2xx 만 성공, 나머지·네트워크 오류는 실패로 기록(재전송 간격은 DB ops_outbox_mark) */
export async function flushOutbox(deps: {
  claim: () => Promise<OutboxRow[]>; mark: (id: number, ok: boolean, error: string | null) => Promise<void>;
  send: (body: ReturnType<typeof eventBody>) => Promise<Response>; siteUrl: string;
}): Promise<{ sent: number; failed: number }> {
  const rows = await deps.claim();
  let sent = 0; let failed = 0;
  for (const r of rows) {
    let ok = false; let err: string | null = null;
    try {
      const res = await deps.send(eventBody(r, deps.siteUrl));
      ok = res.ok;
      if (!ok) err = `HTTP ${res.status}`;
    } catch (e) { err = e instanceof Error ? e.message : "send failed"; }
    await deps.mark(r.id, ok, err);
    if (ok) sent++; else failed++;
  }
  return { sent, failed };
}
