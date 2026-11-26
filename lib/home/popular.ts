// 인기 검색어 집계·정제 — 순수 함수(에어쉽 src/lib/popular-clean.ts 를 ko·ja 로 넓혀 이식).
// 검색 로그(search_logs, 0036)에는 사용자가 친 글자가 그대로 쌓인다. 공개 화면에 내보내기 전에 여기서 거른다.

const URL_RE = /^https?:\/\/|\/|www\.|\.(com|net|jp|kr|co)\b/i;
/** 메루카리 m12345678901 · 야후옥션 b1244959185 · 숫자만 */
const ID_RE = /^[a-z]?\d{6,}$/i;
/** 이메일·전화·긴 숫자열(주문번호·계좌·통관부호 P+12자리) */
const PII_RE = /@|\d[\d\s-]{6,}\d|^p\d{12}$/i;
// ponytail: 짧은 금지어 부분일치. 오탐·누락이 보이면 목록만 손본다.
const BAD_RE = /시발|씨발|씨바|ㅅㅂ|병신|ㅂㅅ|좆|존나|새끼|개새|지랄|섹스|야동|포르노|자살|마약|대마|성인|19금|死ね|殺|エロ|アダルト|セックス|風俗|麻薬|大麻|自殺|fuck|shit|porn|sex|nigg|xxx/i;
const SCRIPT: Record<"ko" | "ja", RegExp> = { ko: /[가-힣]/, ja: /[ぁ-んァ-ヶ一-龠]/ };

/** 집계 최소 건수 — 한두 사람이 친 말은 올리지 않는다 */
export const POPULAR_MIN_COUNT = 3;

/**
 * 로그 행을 검색어별로 세어 많이 찾은 순으로 돌려준다. 같은 정규화 검색어는 가장 최근 원문을 보인다(행은 최신순으로 받는다).
 * 0건 검색은 세지 않는다(살 수 없는 말이 인기로 오르는 것을 막는다).
 */
export function countQueries(logs: readonly { q: string; q_norm: string; hits: number }[], min = POPULAR_MIN_COUNT): string[] {
  const m = new Map<string, { q: string; n: number }>();
  for (const r of logs) {
    if (!(r.hits > 0)) continue;
    const e = m.get(r.q_norm);
    if (e) e.n++;
    else m.set(r.q_norm, { q: r.q, n: 1 });
  }
  return [...m.values()].filter((e) => e.n >= min).sort((a, b) => b.n - a.n).map((e) => e.q);
}

/**
 * 순서(많이 찾은 순)를 유지하며 거른다. 화면 언어의 글자가 든 검색어만, 같은 첫 단어는 2개까지.
 */
export function cleanPopular(queries: readonly string[], lang: "ko" | "ja", limit = 8): string[] {
  const perHead = new Map<string, number>();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of queries) {
    const q = String(raw ?? "").trim().replace(/\s+/g, " ");
    if (q.length < 2 || q.length > 16) continue;
    if (URL_RE.test(q) || ID_RE.test(q) || PII_RE.test(q) || BAD_RE.test(q.normalize("NFKC"))) continue;
    if (!SCRIPT[lang].test(q)) continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    const head = key.split(" ")[0];
    const n = perHead.get(head) ?? 0;
    if (n >= 2) continue;
    seen.add(key);
    perHead.set(head, n + 1);
    out.push(q);
    if (out.length >= limit) break;
  }
  return out;
}

/** 관리자 큐레이션을 먼저, 그 뒤에 로그 집계를 붙인다(대소문자·공백 무시 중복 제거) */
export function mergeKeywords(curated: readonly string[], popular: readonly string[], limit = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of [...curated, ...popular]) {
    const key = k.trim().replace(/\s+/g, " ").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(k.trim());
    if (out.length >= limit) break;
  }
  return out;
}
