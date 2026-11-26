// 최근 본 상품 — 브라우저 localStorage 에만 산다(서버·DB 없음). lib/recent.ts(최근 검색)와 같은 방식.
// 기록은 상세 화면이 components/home/TrackView 로 한다. 사생활 보호 모드·저장소 차단에서도 화면이 죽지 않게 try/catch.
export const RECENT_VIEWED_KEY = "tomo-recent-viewed";
const MAX = 12;

export type RecentItem = { href: string; title: string; thumb: string; price: number; currency: "KRW" | "JPY" };

const isItem = (v: unknown): v is RecentItem => {
  const o = v as RecentItem;
  return !!o && typeof o.href === "string" && /^\/(?!\/)/.test(o.href) && typeof o.title === "string"
    && typeof o.thumb === "string" && typeof o.price === "number" && (o.currency === "KRW" || o.currency === "JPY");
};

export function getRecentViewed(): RecentItem[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_VIEWED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter(isItem).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** 맨 앞에 넣고 같은 주소는 지운다 */
export function addRecentViewed(item: RecentItem): RecentItem[] {
  if (!isItem(item)) return getRecentViewed();
  const list = [{ ...item, title: item.title.slice(0, 120) }, ...getRecentViewed().filter((r) => r.href !== item.href)].slice(0, MAX);
  try { localStorage.setItem(RECENT_VIEWED_KEY, JSON.stringify(list)); } catch { /* 편의 기능 — 실패해도 그대로 */ }
  return list;
}

export function clearRecentViewed(): void {
  try { localStorage.removeItem(RECENT_VIEWED_KEY); } catch { /* 무시 */ }
}
