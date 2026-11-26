// 어드민 목록 페이지 넘김·URL 필터 도우미(순수 함수). 필터·페이지·열린 상세는 전부 URL 에 남는다(새로고침·링크 공유에도 그대로).

export const PAGE_SIZE = 50;

/** ?page= (1부터) → Supabase range(from, to) */
export function pageOf(raw: string | undefined, size = PAGE_SIZE) {
  const n = Number(raw);
  const page = Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
  return { page, from: (page - 1) * size, to: page * size - 1, size };
}

/** 1 … 4 5 [6] 7 8 … 20 — 처음·끝·현재 ±2 */
export function pageItems(page: number, totalPages: number): (number | "gap")[] {
  const out: (number | "gap")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 2) out.push(i);
    else if (out[out.length - 1] !== "gap") out.push("gap");
  }
  return out;
}

export type Params = Record<string, string | undefined>;

/** 지금 URL 값(params)에 patch 를 덮어 주소를 만든다. 빈 값은 뺀다. 필터가 바뀌면 page 는 호출하는 쪽이 지운다 */
export function hrefWith(base: string, params: Params, patch: Params = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** PostgREST ilike 패턴 이스케이프 */
export const likeEscape = (s: string) => s.replace(/[%_\\]/g, (m) => `\\${m}`);
