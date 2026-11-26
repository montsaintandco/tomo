// 최근 검색어 — 브라우저 localStorage 에만 산다(서버·DB 없음). 에어쉽 src/lib/recent.ts 축약 이식.
// 사생활 보호 모드·저장소 차단에서도 화면이 죽지 않게 읽기/쓰기를 try/catch 로 감싼다.
export const RECENT_SEARCHES_KEY = "tomo-recent-searches";
const MAX = 10;

export function getRecentSearches(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim() !== "").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list)); } catch { /* 편의 기능 — 실패해도 그대로 */ }
}

/** 맨 앞에 넣고 같은 말(대소문자 무시)은 지운다 */
export function addRecentSearch(q: string): string[] {
  const v = q.trim().slice(0, 80);
  if (!v) return getRecentSearches();
  const list = [v, ...getRecentSearches().filter((s) => s.toLowerCase() !== v.toLowerCase())].slice(0, MAX);
  write(list);
  return list;
}

export function removeRecentSearch(q: string): string[] {
  const list = getRecentSearches().filter((s) => s.toLowerCase() !== q.trim().toLowerCase());
  write(list);
  return list;
}

export function clearRecentSearches(): void {
  write([]);
}
