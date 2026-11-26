import { describe, it, expect, afterEach, vi } from "vitest";
import { errorKey, cleanPath, makeThrottle, cspReports } from "../../lib/observe";
import { notifyOps, opsAlertConfigured } from "../../lib/notify-ops";

describe("errorKey", () => {
  it("Next digest가 있으면 그대로 쓴다", () => {
    expect(errorKey({ message: "x", digest: "12345" })).toBe("12345");
  });
  it("같은 메시지·같은 첫 스택 줄은 같은 열쇠, 다르면 다른 열쇠", () => {
    const a = errorKey({ message: "boom", stack: "Error: boom\n    at f (a.js:1:1)\n    at g (b.js:2:2)" });
    const b = errorKey({ message: "boom", stack: "Error: boom\n    at f (a.js:1:1)\n    at h (c.js:3:3)" });
    const c = errorKey({ message: "boom", stack: "Error: boom\n    at z (z.js:9:9)" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^h[0-9a-z]+$/);
  });
});

describe("cleanPath", () => {
  it("쿼리·해시를 버리고 경로만 남긴다", () => {
    expect(cleanPath("/auth/callback?code=secret#x")).toBe("/auth/callback");
    expect(cleanPath("https://tomo.example/global?q=ポケモン")).toBe("/global");
    expect(cleanPath(null)).toBeNull();
  });
});

describe("makeThrottle", () => {
  it("같은 열쇠는 10분에 1번", () => {
    const ok = makeThrottle(600_000, 20);
    expect(ok("a", 0)).toBe(true);
    expect(ok("a", 599_999)).toBe(false);
    expect(ok("b", 1000)).toBe(true);
    expect(ok("a", 600_000)).toBe(true);
  });
  it("전체 상한을 넘으면 새 열쇠도 막는다", () => {
    const ok = makeThrottle(600_000, 2);
    expect(ok("a", 0)).toBe(true);
    expect(ok("b", 1)).toBe(true);
    expect(ok("c", 2)).toBe(false);
    expect(ok("c", 600_002)).toBe(true);
  });
});

describe("cspReports", () => {
  it("report-uri 형식 — 막힌 주소는 출처만", () => {
    const r = cspReports({ "csp-report": { "document-uri": "https://t.example/order?id=1", "effective-directive": "script-src-elem", "blocked-uri": "https://js.stripe.com/v3/x.js?y=1" } });
    expect(r).toEqual([{ message: "script-src-elem ← https://js.stripe.com", path: "/order" }]);
  });
  it("Reporting API 배열 형식·inline", () => {
    const r = cspReports([{ type: "csp-violation", body: { documentURL: "https://t.example/", effectiveDirective: "style-src", blockedURL: "inline" } }]);
    expect(r).toEqual([{ message: "style-src ← inline", path: "/" }]);
  });
  it("모르는 모양은 빈 배열", () => {
    expect(cspReports({ foo: 1 })).toEqual([]);
    expect(cspReports(null)).toEqual([]);
  });
});

describe("notifyOps", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("env가 없으면 보내지 않고 false (fetch 호출 없음)", async () => {
    vi.stubEnv("OPS_TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("OPS_TELEGRAM_CHAT_ID", "");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(opsAlertConfigured()).toBe(false);
    expect(await notifyOps("x")).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it("env가 있으면 텔레그램 sendMessage로 보낸다, 네트워크 실패는 false", async () => {
    vi.stubEnv("OPS_TELEGRAM_BOT_TOKEN", "T");
    vi.stubEnv("OPS_TELEGRAM_CHAT_ID", "C");
    const f = vi.fn().mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new Error("net"));
    vi.stubGlobal("fetch", f);
    expect(await notifyOps("hello")).toBe(true);
    expect(f.mock.calls[0][0]).toBe("https://api.telegram.org/botT/sendMessage");
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ chat_id: "C", text: "hello" });
    expect(await notifyOps("again")).toBe(false);
  });
});
