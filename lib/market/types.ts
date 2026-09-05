// 외부 마켓 공통 타입 — 소스별 파서가 이 형태로 정규화해 반환
export type MarketSource = "mercari" | "yahoo_auction" | "daangn" | "joongna";

// 공통 검색 필터 (메루카리 필터 참조) — 가격은 소스 통화. 소스가 지원하면 서버에서, 아니면 결과를 받은 뒤 거른다
export type SearchFilters = {
  min?: number; max?: number;
  sort?: "rec" | "new" | "price_asc" | "price_desc";
  cond?: "new" | "used";
  sold?: boolean; // true = 판매완료 포함
};

export type MarketItem = {
  source: MarketSource;
  sourceId: string;
  url: string;          // 원 사이트 상품 URL
  title: string;        // 원문 제목 (일본 소스는 ja)
  titleTranslated?: string; // 뷰어 언어 번역 제목 (홈 인기 섹션에서 채움, 실패 시 없음)
  price: number;        // 원 통화 정수. 즉시구매가 있으면 그 값, 없으면 경매 현재가
  currency: "KRW" | "JPY";
  thumb: string;
  soldOut: boolean;
  // 경매 물건은 즉시 확정가가 아니므로 UI에서 구분 표시 (구매대행 견적 기준이 달라짐)
  auction?: boolean;    // true = 입찰 진행형 (price는 현재가, 낙찰가 미확정)
};

export type MarketItemDetail = MarketItem & {
  description: string;
  images: string[];
  sellerName: string;
  condition: string;    // 상품 상태 표기 (소스 원문)
  extra: Record<string, string>; // 배송부담·지역 등 소스별 부가정보 (표시용)
  // 원본 페이지가 주는 맥락 — 있으면 상세에 그대로 보여준다 (당근·중고나라·메루카리 공통 형태)
  region?: string;      // 거래 동네
  category?: string;    // 원본 카테고리 경로
  postedAt?: string;    // ISO 게시(끌올) 시각
  sellerTemp?: number;  // 매너온도 등 판매자 신뢰 지표 (소스 단위 그대로)
  counts?: { views?: number; favorites?: number; chats?: number; bids?: number };
  tradeTags?: string[]; // 직거래·택배·새상품·안전결제 같은 원본 라벨
  sellerRating?: string; // 원본 마켓의 판매자 평가 요약 ("좋아요 115 · 100%", "★4.8" 등)
  sellerUrl?: string;    // 원본 마켓 판매자 페이지 (다른 상품 더 보기 링크)
  sellerItems?: MarketItem[]; // 판매자의 다른 판매중 상품 (최대 8)
};

export const SOURCE_LABEL: Record<MarketSource, string> = {
  mercari: "메루카리",
  yahoo_auction: "야후옥션·플리마",
  daangn: "당근마켓",
  joongna: "중고나라",
};

// 실파싱 가능 소스. 일본은 API/마크업, 한국은 JSON-LD(당근)·카드 마크업(중고나라)
export const LIVE_SOURCES: MarketSource[] = ["mercari", "yahoo_auction", "daangn", "joongna"];

// 소스별 취급 통화 — 검색어 번역 방향과 대행 견적 통화를 정한다
export const SOURCE_CURRENCY: Record<MarketSource, "KRW" | "JPY"> = {
  mercari: "JPY", yahoo_auction: "JPY", daangn: "KRW", joongna: "KRW",
};
