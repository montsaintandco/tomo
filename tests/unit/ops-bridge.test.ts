import { describe, expect, it, vi } from "vitest";
import { executeOnce, flushOutbox, opsCanonicalPath, opsSign, opsVerify, safeEqual, type OpsStore, type OutboxRow, type SignInput, type StoredOp } from "../../lib/ops-bridge";

const SECRET = "s".repeat(64);
const NOW = 1_800_000_000;
const base: SignInput = { keyId: "k1", ts: String(NOW), method: "POST", path: "/api/ops/proxy/x/status?a=1", actorId: "a1", actorEmail: "ren@example.com", scope: "ops", body: '{"request_id":"r"}' };

function headers(p: SignInput, over: Record<string, string> = {}) {
  const h = new Map(Object.entries({
    "x-ops-version": "1", "x-ops-key-id": p.keyId, "x-ops-ts": p.ts, "x-ops-sig": opsSign(SECRET, p),
    "x-ops-actor-id": p.actorId, "x-ops-actor-email": p.actorEmail, "x-ops-scope": p.scope, ...over,
  }));
  return { get: (n: string) => h.get(n) ?? null };
}
const verify = (h: ReturnType<typeof headers>, p = base) => opsVerify(h, { method: p.method, path: p.path, body: p.body }, { secret: SECRET, keyId: "k1", nowS: NOW });

describe("ops 서명", () => {
  it("맞는 서명은 통과하고 운영자·scope 를 돌려준다", () => {
    const r = verify(headers(base));
    expect(r).toEqual({ ok: true, actor: { id: "a1", email: "ren@example.com" }, scope: "ops" });
  });
  it("본문·경로·운영자·scope 가 바뀌면 401", () => {
    for (const change of [{ body: '{"request_id":"x"}' }, { path: "/api/ops/proxy/y/status?a=1" }, { method: "GET" }]) {
      expect(verify(headers(base), { ...base, ...change })).toMatchObject({ ok: false, status: 401, error: "bad signature" });
    }
    for (const h of [{ "x-ops-actor-email": "x@example.com" }, { "x-ops-actor-id": "a2" }, { "x-ops-scope": "money" }] as Record<string, string>[])
      expect(verify(headers(base, h))).toMatchObject({ ok: false, status: 401, error: "bad signature" });
  });
  it("다른 비밀값으로 만든 서명은 401", () => {
    const r = verify(headers(base, { "x-ops-sig": opsSign("other".repeat(10), base) }));
    expect(r).toMatchObject({ ok: false, status: 401 });
  });
  it("5분 넘게 어긋난 시각은 401, 5분 안은 통과", () => {
    const old = { ...base, ts: String(NOW - 301) };
    expect(verify(headers(old), old)).toMatchObject({ ok: false, status: 401, error: "timestamp out of range" });
    const near = { ...base, ts: String(NOW - 299) };
    expect(verify(headers(near), near)).toMatchObject({ ok: true });
  });
  it("버전이 없거나 다르면 400(지원 버전 안내), 키 id 가 다르면 401", () => {
    expect(verify(headers(base, { "x-ops-version": "2" }))).toMatchObject({ ok: false, status: 400 });
    const other = { ...base, keyId: "k2" };
    expect(verify(headers(other), other)).toMatchObject({ ok: false, status: 401, error: "unknown key id" });
  });
  it("쿼리는 다시 직렬화한 형태로 서명한다(,→%2C 로 바뀌어도 같은 서명)", () => {
    expect(opsCanonicalPath("/api/ops/refunds?status=pending,failed&limit=1")).toBe("/api/ops/refunds?status=pending%2Cfailed&limit=1");
    expect(opsCanonicalPath("/api/ops/meta?")).toBe("/api/ops/meta");
    const a = { ...base, method: "GET", body: "", path: "/api/ops/refunds?status=pending,failed" };
    const h = headers(a);
    expect(verify(h, { ...a, path: "/api/ops/refunds?status=pending%2Cfailed" })).toMatchObject({ ok: true });
  });
  it("상수 시간 비교는 길이가 달라도 false", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "a")).toBe(false);
  });
});

function memStore(): OpsStore & { rows: Map<string, StoredOp> } {
  const rows = new Map<string, StoredOp>();
  return {
    rows,
    async claim(id, action, target) {
      const p = rows.get(id);
      if (p) return p;
      rows.set(id, { actor_id: "actor", action, target, status: "running", http_status: null, response: null });
      return null;
    },
    async finish(id, http_status, response) { rows.set(id, { ...rows.get(id)!, status: "done", http_status, response }); },
  };
}

describe("ops 멱등", () => {
  const op = (run: () => Promise<{ status: number; body: Record<string, unknown> }>, cur = "paid") =>
    ({ requestId: "r1", actorId: "actor", action: "proxy.status", target: "t1", expected: "paid", current: async () => cur, run });

  it("같은 request_id 는 한 번만 실행하고 두 번째는 저장된 결과", async () => {
    const s = memStore();
    const run = vi.fn(async () => ({ status: 200, body: { result: "ok" } }));
    const a = await executeOnce(s, op(run));
    const b = await executeOnce(s, op(run));
    expect(run).toHaveBeenCalledTimes(1);
    expect(a).toMatchObject({ status: 200, replayed: false });
    expect(b).toMatchObject({ status: 200, body: { result: "ok" }, replayed: true });
  });
  it("현재 상태가 기대와 다르면 409, 실행하지 않는다", async () => {
    const s = memStore();
    const run = vi.fn(async () => ({ status: 200, body: {} }));
    const r = await executeOnce(s, op(run, "purchasing"));
    expect(run).not.toHaveBeenCalled();
    expect(r).toMatchObject({ status: 409, body: { current_status: "purchasing", expected_status: "paid" } });
  });
  it("같은 id 를 다른 동작·다른 운영자에 쓰면 409", async () => {
    const s = memStore();
    await executeOnce(s, op(async () => ({ status: 200, body: {} })));
    expect(await executeOnce(s, { ...op(async () => ({ status: 200, body: {} })), action: "proxy.cancel" })).toMatchObject({ status: 409 });
    expect(await executeOnce(s, { ...op(async () => ({ status: 200, body: {} })), actorId: "other" })).toMatchObject({ status: 409 });
  });
  it("실행 중인 id 는 409 in_progress", async () => {
    const s = memStore();
    s.rows.set("r1", { actor_id: "actor", action: "proxy.status", target: "t1", status: "running", http_status: null, response: null });
    expect(await executeOnce(s, op(async () => ({ status: 200, body: {} })))).toMatchObject({ status: 409, body: { error: "in_progress" } });
  });
  it("실행이 예외로 끝나면 500 「결과 확인 못 함」을 저장하고 다시 실행하지 않는다", async () => {
    const s = memStore();
    const run = vi.fn(async () => { throw new Error("network"); });
    expect(await executeOnce(s, op(run))).toMatchObject({ status: 500 });
    expect(await executeOnce(s, op(run))).toMatchObject({ status: 500, replayed: true });
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("ops outbox 보내기", () => {
  const row: OutboxRow = { id: 7, event_id: "e7", type: "order.paid", code: "T000001", amount: 1000, currency: "KRW", path: "/admin/orders?open=o", target_type: "proxy_order", target_id: "o", occurred_at: "2026-11-27T00:00:00Z" };
  it("실패(5xx·네트워크)는 실패로, 2xx 는 성공으로 기록하고 공통 칸을 보낸다", async () => {
    const marks: [number, boolean, string | null][] = [];
    const sent: unknown[] = [];
    let n = 0;
    const send = async (b: unknown) => { sent.push(b); n++; if (n === 1) return new Response(null, { status: 500 }); if (n === 2) throw new Error("timeout"); return new Response(null, { status: 200 }); };
    const r = await flushOutbox({ claim: async () => [row, { ...row, id: 8 }, { ...row, id: 9 }], mark: async (id, ok, e) => { marks.push([id, ok, e]); }, send: send as never, siteUrl: "https://t.example" });
    expect(r).toEqual({ sent: 1, failed: 2 });
    expect(marks).toEqual([[7, false, "HTTP 500"], [8, false, "timeout"], [9, true, null]]);
    expect(sent[0]).toMatchObject({ api_version: 1, event_id: "e7", site_key: "tomo", type: "order.paid", code: "T000001", amount: 1000, currency: "KRW", url: "https://t.example/admin/orders?open=o", occurred_at: row.occurred_at });
  });
});
