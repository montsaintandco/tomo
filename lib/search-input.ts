// 검색창 입력 해석 (키라팝 lib/search-input.ts 축약 이식).
//   앱 「공유하기」 문구 안의 상품 링크("상품명 ¥1,000 https://jp.mercari.com/item/m123 #メルカリ") → 그 상품 상세
//   https:// 없이 붙여 넣은 링크(jp.mercari.com/item/m…) → 그 상품 상세
//   메루카리 상품 ID(m + 11~12자리) → 메루카리 상세
//   그 밖 → 검색어
import { parseMarketUrl } from "./market/url";
import type { MarketSource } from "./market/types";

const URL_RE = /https?:\/\/[^\s<>"'「」『』【】]+/i;
const BARE_URL_RE = /(?:^|\s)((?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\/[^\s<>"'「」『』【】]*)/i;
const TRAILING_PUNCT_RE = /[)\]}>.,!?。、」』】]+$/;
const MERCARI_ID_RE = /^m\d{11,12}$/i;

/** 입력 안의 첫 링크(https:// 가 없으면 붙여서). 없으면 null */
export function extractUrl(input: string): string | null {
  const bare = input.match(BARE_URL_RE)?.[1];
  const m = input.match(URL_RE)?.[0] ?? (bare ? `https://${bare}` : null);
  return m ? m.replace(TRAILING_PUNCT_RE, "") : null;
}

/** 상품으로 바로 갈 입력이면 소스·ID, 아니면 null(검색어) */
export function resolveSearchInput(raw: string): { source: MarketSource; id: string } | null {
  const v = raw.trim();
  if (MERCARI_ID_RE.test(v)) return { source: "mercari", id: v.toLowerCase() };
  const url = extractUrl(v);
  return url ? parseMarketUrl(url) : null;
}
