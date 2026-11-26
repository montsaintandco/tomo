import { createAdminSupabase } from "./supabase/admin";
import { notifyOps } from "./notify-ops";
import { SITE_URL } from "./site";

// 오류 관측 — error_events(0032) 적재 + 텔레그램 알림. 서버에서만 import.
// report() 는 await 하지 않고 던지지도 않는다: 적재·알림이 실패해도 원래 요청에 영향이 없어야 한다.
export type ErrorSource = "server" | "client" | "csp";
export type ErrorReport = { source: ErrorSource; message: string; stack?: string | null; path?: string | null; digest?: string | null; userId?: string | null };

// FNV-1a 32bit — 같은 오류를 한 행으로 합치는 열쇠
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/** 합치기 열쇠: Next digest가 있으면 그대로, 없으면 메시지+첫 스택 줄 해시. */
export function errorKey(e: Pick<ErrorReport, "message" | "stack" | "digest">): string {
  if (e.digest) return e.digest.slice(0, 128);
  const frame = (e.stack ?? "").split("\n").slice(1).find((l) => l.trim())?.trim() ?? "";
  return `h${hash(`${e.message}|${frame}`)}`;
}

/** 경로만 남긴다(쿼리에 OAuth code·검색어가 실릴 수 있다). */
export function cleanPath(p?: string | null): string | null {
  if (!p) return null;
  try { return new URL(p, "http://x").pathname.slice(0, 300); } catch { return null; }
}

/** 같은 열쇠는 gap 안에 1번, 전체는 gap 안에 cap 번까지. */
export function makeThrottle(gap = 10 * 60_000, cap = 20) {
  const last = new Map<string, number>();
  let start = 0, n = 0;
  return (key: string, now = Date.now()): boolean => {
    if (now - start >= gap) { start = now; n = 0; for (const [k, t] of last) if (now - t >= gap) last.delete(k); }
    const prev = last.get(key);
    if ((prev !== undefined && now - prev < gap) || n >= cap) return false;
    last.set(key, now); n++;
    return true;
  };
}
const shouldNotify = makeThrottle();

/** CSP 위반 보고서(report-uri 형식·Reporting API 배열) → 적재할 메시지들. 막힌 주소는 출처(origin)만 남겨 합친다. */
export function cspReports(body: unknown): { message: string; path: string | null }[] {
  const list = Array.isArray(body) ? body.map((r) => r?.body) : [(body as Record<string, unknown>)?.["csp-report"]];
  return list.filter((r): r is Record<string, unknown> => !!r && typeof r === "object").map((r) => {
    const dir = String(r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"] ?? "?");
    const raw = String(r["blocked-uri"] ?? r.blockedURL ?? "?");
    let blocked = raw;
    try { blocked = new URL(raw).origin; } catch { /* inline·eval 등 */ }
    return { message: `${dir} ← ${blocked}`.slice(0, 300), path: cleanPath(String(r["document-uri"] ?? r.documentURL ?? "")) };
  });
}

export function report(e: ErrorReport): void {
  const digest = errorKey(e);
  const path = cleanPath(e.path);
  const message = (e.message || "(no message)").slice(0, 1000);
  void (async () => {
    try {
      await createAdminSupabase().rpc("record_error_event", {
        p_source: e.source, p_digest: digest, p_message: message, p_stack: e.stack?.slice(0, 4000) ?? null, p_path: path, p_user: e.userId ?? null,
      });
    } catch { /* 키 없음·표 없음·DB 정지 — 알림은 계속 */ }
    if (e.source !== "csp" && shouldNotify(`${e.source}:${digest}`)) {
      await notifyOps(`[TOMO ${e.source === "server" ? "서버" : "브라우저"} 오류] ${path ?? ""}\n${message.slice(0, 500)}\nref ${digest}\n${SITE_URL}/admin/errors`);
    }
  })().catch(() => {});
}
