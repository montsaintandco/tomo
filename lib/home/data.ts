// 홈 서버 데이터 — 인기 검색어(검색 로그 집계)와 원형 카테고리 사진 후보. 서버 전용.
// 둘 다 부가 기능이라 표가 없거나(0036 미적용)·키가 없거나·마켓이 느려도 홈을 막지 않는다: 실패는 빈 값.
import { unstable_cache } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { tableMissing } from "@/lib/safe";
import { mercariSearch } from "@/lib/market/mercari";
import { joongnaSearch } from "@/lib/market/joongna";
import type { MarketItem } from "@/lib/market/types";
import type { CategoryKey } from "@/components/CategoryChips";
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

/**
 * 홈 원형 카테고리 — 「기타」는 해외 검색어로 뜻이 없어(한국어 「기타」= 악기) 뺀다.
 * term: 원형 사진을 고를 상대국 마켓 검색어. KR 보는 사람 → 일본 마켓(ja), JP 보는 사람 → 한국 마켓(ko)
 */
export const HOME_CATEGORIES: readonly { key: CategoryKey; term: { KR: string; JP: string } }[] = [
  { key: "figure", term: { KR: "フィギュア", JP: "피규어" } },
  { key: "camera", term: { KR: "カメラ", JP: "카메라" } },
  { key: "fashion", term: { KR: "古着", JP: "의류" } },
  { key: "kpop", term: { KR: "K-POP グッズ", JP: "앨범" } },
  { key: "game", term: { KR: "ゲームソフト", JP: "게임" } },
  { key: "vintage", term: { KR: "ヴィンテージ", JP: "빈티지" } },
];

const PHOTO_TIMEOUT_MS = 3500;

async function searchFor(country: "KR" | "JP", term: string): Promise<MarketItem[]> {
  const items = await (country === "KR" ? mercariSearch(term) : joongnaSearch(term));
  if (items.length === 0) throw new Error(`home-cat:${term}: empty`); // 빈 결과는 캐시하지 않는다
  return items.slice(0, 12);
}

/** 카테고리마다 사진 후보(상대국 마켓 검색 앞쪽 12개). 6시간 캐시, 하나가 느리면 그 칸만 빈 후보 */
export function getCategoryCandidates(country: "KR" | "JP"): Promise<MarketItem[][]> {
  return Promise.all(HOME_CATEGORIES.map((c) => {
    const term = c.term[country];
    const cached = unstable_cache(() => searchFor(country, term), ["home-cat", "v1", country, term], { revalidate: 21_600 })()
      .catch(() => [] as MarketItem[]);
    return Promise.race([cached, new Promise<MarketItem[]>((r) => setTimeout(() => r([]), PHOTO_TIMEOUT_MS))]);
  }));
}
