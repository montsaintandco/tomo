// 상대국 마켓에서 "많이 찾는" 테마 큐레이션 — 트렌드 API가 없어 코드로 관리한다.
// ponytail: 키워드가 자주 바뀌면 Supabase 테이블 + /admin 편집 UI로 승격
import type { MarketItem, MarketSource } from "./types";

export type TrendingTheme = {
  key: string;        // 유일, URL-safe
  label: string;      // 한국어 라벨
  labelJa: string;    // 일본어 라벨
  term: string;       // 마켓 언어 검색어 (JP 마켓=일본어, KR 마켓=한국어)
  sources: MarketSource[];
};

const JP: MarketSource[] = ["mercari", "yahoo_auction"];
const KR: MarketSource[] = ["daangn", "joongna"];

export const TRENDING: Record<"KR" | "JP", TrendingTheme[]> = {
  // 한국 구매자가 일본 마켓에서 많이 찾는 것
  KR: [
    { key: "pokemon-card", label: "포켓몬카드", labelJa: "ポケモンカード", term: "ポケモンカード", sources: JP },
    { key: "film-camera", label: "필름카메라", labelJa: "フィルムカメラ", term: "フィルムカメラ", sources: JP },
    { key: "ghibli", label: "지브리 굿즈", labelJa: "ジブリ グッズ", term: "ジブリ グッズ", sources: JP },
    { key: "sanrio", label: "산리오", labelJa: "サンリオ", term: "サンリオ", sources: JP },
    { key: "seiko-vintage", label: "세이코 빈티지 시계", labelJa: "セイコー ヴィンテージ", term: "セイコー 腕時計 ヴィンテージ", sources: JP },
    { key: "anime-figure", label: "애니 피규어", labelJa: "アニメ フィギュア", term: "アニメ フィギュア", sources: JP },
  ],
  // 일본 구매자가 한국 마켓에서 많이 찾는 것
  JP: [
    { key: "kpop-photocard", label: "K-pop 포토카드", labelJa: "K-POP トレカ", term: "포토카드", sources: KR },
    { key: "k-beauty", label: "한국 화장품", labelJa: "韓国コスメ", term: "화장품", sources: KR },
    { key: "camping", label: "캠핑용품", labelJa: "キャンプ用品", term: "캠핑용품", sources: KR },
    { key: "galaxy", label: "갤럭시", labelJa: "Galaxy", term: "갤럭시", sources: KR },
    { key: "hanbok", label: "한복·전통 소품", labelJa: "韓服・伝統小物", term: "한복", sources: KR },
  ],
};

/** 소스별 결과를 인터리브해 한 마켓이 도배하지 않게 하고, 썸네일 없는/품절 상품은 뺀 뒤 cap까지 자른다 */
export function pickTrendingItems(resultsBySource: MarketItem[][], cap = 10): MarketItem[] {
  const lists = resultsBySource.map((r) => r.filter((i) => i.thumb && !i.soldOut));
  const out: MarketItem[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max && out.length < cap; i++) {
    for (const l of lists) if (l[i] && out.length < cap) out.push(l[i]);
  }
  return out;
}
