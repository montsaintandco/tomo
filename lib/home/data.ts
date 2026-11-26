// 홈 서버 데이터 — 인기 검색어(검색 로그 집계)와 원형 카테고리 사진 후보. 서버 전용.
// 둘 다 부가 기능이라 표가 없거나(0036 미적용)·키가 없거나·마켓이 느려도 홈을 막지 않는다: 실패는 빈 값.
import { unstable_cache } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { tableMissing } from "@/lib/safe";
import { mercariSearch } from "@/lib/market/mercari";
import { joongnaSearch } from "@/lib/market/joongna";
import type { MarketItem } from "@/lib/market/types";
import { FEATURED, findMajor, krTerm, type MajorCategory } from "@/lib/categories";
import { cleanPopular, countQueries } from "./popular";

const DAY = 86_400_000;

async function loadPopular(lang: "ko" | "ja"): Promise<string[]> {
  const res = await createAdminSupabase().from("search_logs").select("q, q_norm, hits")
    .eq("lang", lang).gte("created_at", new Date(Date.now() - 7 * DAY).toISOString())
    .order("created_at", { ascending: false }).limit(3000);
  if (res.error) {
    if (tableMissing(res.error)) return [];
    throw new Error(`popular:${res.error.message}`); // 일시 오류는 캐시하지 않는다
  }
  return cleanPopular(countQueries(res.data ?? []), lang);
}

/** 최근 7일 화면 언어별 인기 검색어(정제·최소 건수 적용). 10분 캐시 */
export const getPopularTerms = (lang: "ko" | "ja") =>
  unstable_cache(() => loadPopular(lang), ["home-popular", "v1", lang], { revalidate: 600 })().catch(() => [] as string[]);

/** 홈 원형 카테고리 — lib/categories.ts FEATURED 6칸. 누르면 /categories/<slug> */
export const HOME_CATEGORIES: readonly MajorCategory[] = FEATURED.map((s) => findMajor(s)!);

const PHOTO_TIMEOUT_MS = 3500;

// 사진 후보 — KR 보는 사람은 메루카리 그 카테고리(번호), JP 보는 사람은 중고나라 한국어 키워드(번호 없음, lib/categories.ts)
// 마켓에 동시에 나가는 사진 검색을 3개로 제한한다(카테고리 21칸을 한 번에 부르면 메루카리가 짧은 간격 요청을 403 으로 막는다 — 에어쉽 11/22 실측).
// 늦은 칸은 화면에서 먼저 첨 글자로 나오고, 검색이 끝나면 6시간 캐시에 남아 다음 요청부터 사진이 나온다.
let active = 0; const waiters: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 3) await new Promise<void>((r) => waiters.push(r));
  active++;
  try { return await fn(); } finally { active--; waiters.shift()?.(); }
}

async function searchFor(country: "KR" | "JP", c: MajorCategory): Promise<MarketItem[]> {
  const items = await limited(() => (country === "KR" ? mercariSearch("", { catIds: c.mercari }) : joongnaSearch(krTerm(c))));
  if (items.length === 0) throw new Error(`home-cat:${c.slug}: empty`); // 빈 결과는 캐시하지 않는다
  return items.slice(0, 12);
}

/** 카테고리마다 사진 후보(상대국 마켓 앞쪽 12개). 6시간 캐시, 하나가 느리면 그 칸만 빈 후보 */
export function getCategoryCandidates(country: "KR" | "JP", cats: readonly MajorCategory[] = HOME_CATEGORIES): Promise<MarketItem[][]> {
  return Promise.all(cats.map((c) => {
    const cached = unstable_cache(() => searchFor(country, c), ["home-cat", "v2", country, c.slug], { revalidate: 21_600 })()
      .catch(() => [] as MarketItem[]);
    return Promise.race([cached, new Promise<MarketItem[]>((r) => setTimeout(() => r([]), PHOTO_TIMEOUT_MS))]);
  }));
}
