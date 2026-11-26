// 외부 마켓 검색 결과 인메모리 캐시 (키라팝 lib/scrape-cache.ts 이식). 서버 컨테이너 1개 기준.
// 같은 검색을 짧게 되풀이할 때 마켓을 다시 부르지 않고, 마켓이 막히거나 오류면 조금 지난 결과로 버틴다.
const store = new Map<string, { value: unknown; at: number }>();
const MAX_ENTRIES = 500;

/** maxAgeMs 이내 항목만. 없거나 만료면 null */
export function cacheGet<T>(key: string, maxAgeMs: number): T | null {
  const e = store.get(key);
  return e && Date.now() - e.at <= maxAgeMs ? (e.value as T) : null;
}

export function cacheSet(key: string, value: unknown): void {
  store.delete(key); // 다시 넣어 삽입순(=오래된 순) 갱신
  if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
  store.set(key, { value, at: Date.now() });
}

/** fresh 안이면 캐시, 아니면 live 호출. live 가 실패하면 stale 안의 옛 결과, 그것도 없으면 throw */
export async function cached<T>(key: string, live: () => Promise<T>, freshMs = 120_000, staleMs = 1_800_000): Promise<T> {
  const hit = cacheGet<T>(key, freshMs);
  if (hit !== null) return hit;
  try {
    const v = await live();
    cacheSet(key, v);
    return v;
  } catch (e) {
    const old = cacheGet<T>(key, staleMs);
    if (old !== null) return old;
    throw e;
  }
}
