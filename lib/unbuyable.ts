// 살 수 없는 출품 거르기 (에어쉽 src/lib/mercari-listing.ts 이식).
// 메루카리·야후 플리마에는 「상품처럼 보이지만 살 수 없는」 출품이 섞인다:
//   「○○様専用」「専用」 특정 구매자 지정 — 우리가 사면 판매자가 취소한다.
//   「オーダー」「リクエスト」 주문제작·문의 접수 페이지 — 실물이 없다.
//   「取り置き」 다른 사람 앞으로 잡아 둔 물건. 「300円企画」「抽選」 추첨용 억제 가격.
// 「iPhone15専用ケース」 같은 호환 표기 専用 은 정상이라 남긴다(様専用·専用ページ·맨 앞 専用 만 본다).
// 한국 마켓은 「○○님 전용」「예약중」이 같은 부류다.
const JA_RE =
  /様専用|さま専用|サマ専用|専用ページ|専用出品|^\s*専用(?:\s|$|[・、])|様[\s\S]{0,20}専用|^.{0,12}様\s|オーダー|受注生産|受注制作|リクエスト|取り置き|取置き|\d+円企画|抽選|ページ[へに](?:移行|移動|引っ越し)しました/;
const KO_RE = /님\s?전용|예약\s?중/;

/** 제목만 보고 살 수 없는 출품이면 사유(걸린 낱말), 아니면 undefined */
export function unbuyableReason(title: string | null | undefined): string | undefined {
  if (!title) return undefined;
  return (title.match(JA_RE) ?? title.match(KO_RE))?.[0].trim() || undefined;
}

// 상세 설명에서만 보이는 「주문 전용 페이지」 신호(목록 API 에는 설명이 없다). 일반 표현(オーダーメイド·専用ケース)은 뺀다
const ORDER_PAGE_DESC_RE =
  /オーダー(?:ページ|受付|受注|専用|フォーム|用ページ|品のみ)|受注生産|受注制作|受注受付|受注ページ|注文(?:受付|専用)ページ|専用ページ|こちら(?:は|の)[^。\n]{0,30}様(?:の)?専用|様専用(?:ページ|出品)/;

/** 상세용: 제목 또는 설명으로 판정 */
export function unbuyableDetail(title: string, description: string | null | undefined): string | undefined {
  return unbuyableReason(title) ?? (description?.match(ORDER_PAGE_DESC_RE)?.[0] || undefined);
}

/** 경매(입찰형)는 정액 구매대행이 안 된다 — 「구경만」 사유 값 */
export const UNBUYABLE_AUCTION = "auction";
