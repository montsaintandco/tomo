import type { MarketSource } from "./types";

// SAZO식 URL 붙여넣기: 검색창에 상품 URL을 넣으면 소스·ID로 풀어 외부상품 상세로 보낸다
const PATTERNS: [MarketSource, RegExp][] = [
  ["mercari", /(?:jp\.)?mercari\.com\/(?:jp\/)?items?\/(m\d+)/i],
  ["yahoo_auction", /auctions\.yahoo\.co\.jp\/jp\/auction\/([a-z]\d+)/i],
  // 당근 ID는 숫자(구형 articles/123)일 수도, 영숫자 슬러그(…-wd1p22fbdiyc/)일 수도 있다 — 마지막 '-' 뒤 토큰
  ["daangn", /daangn\.com\/(?:kr\/buy-sell\/[^/?#]*-([a-z0-9]+)|articles\/(\d+))\/?(?:[?#]|$)/i],
  ["joongna", /joongna\.com\/product\/(\d+)/i],
];

export function parseMarketUrl(input: string): { source: MarketSource; id: string } | null {
  const s = input.trim();
  if (!/^https?:\/\//i.test(s) && !/\.(com|co\.jp)\//i.test(s)) return null;
  for (const [source, re] of PATTERNS) {
    const m = s.match(re);
    if (m) return { source, id: m[1] ?? m[2] };
  }
  return null;
}
