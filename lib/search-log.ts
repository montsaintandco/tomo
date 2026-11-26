// 검색 로그 — 인기 검색어 집계용(public.search_logs, 0036). 서버 전용. 에어쉽 search-log.server.ts 축약 이식.
// 사용자 식별 값(user id·IP·세션)은 남기지 않는다. 검색어·정규화 검색어·화면 언어·소스·건수만.
// 부가 기능이라 표가 없거나 DB 가 죽어도 검색을 막지 않는다: 절대 reject 하지 않고 400ms 에서 끊는다.
import { createAdminSupabase } from "./supabase/admin";

/** 집계용 정규화: 앞뒤 공백 제거·공백 하나로·소문자 */
export function normalizeQuery(q: string): string {
  return q.trim().replace(/\s+/g, " ").toLowerCase();
}

/** 로그에 남길 만한 검색어인가 — 빈 말·링크·너무 긴 말·숫자만은 뺀다 */
export function isLoggableQuery(q: string): boolean {
  const s = q.trim();
  return s.length >= 1 && s.length <= 80 && !/https?:\/\/|\.\w{2,}\//i.test(s) && !/^\d+$/.test(s);
}

export function logSearch(q: string, lang: "ko" | "ja", source: string, hits: number): Promise<void> {
  if (!isLoggableQuery(q)) return Promise.resolve();
  const insert = (async () => {
    await createAdminSupabase().from("search_logs").insert({
      q: q.trim().replace(/\s+/g, " "), q_norm: normalizeQuery(q), lang, source, hits: Math.max(0, Math.floor(hits)),
    });
  })().catch(() => { /* 통계는 best-effort */ });
  return Promise.race([insert, new Promise<void>((r) => setTimeout(r, 400))]);
}
