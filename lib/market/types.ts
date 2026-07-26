// 외부 마켓 공통 타입 — 소스별 파서가 이 형태로 정규화해 반환
export type MarketSource = "mercari" | "yahoo_auction" | "daangn" | "joongna";

export type MarketItem = {
  source: MarketSource;
  sourceId: string;
  url: string;          // 원 사이트 상품 URL
  title: string;        // 원문 제목 (일본 소스는 ja)
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
};

export const SOURCE_LABEL: Record<MarketSource, string> = {
  mercari: "메루카리",
  yahoo_auction: "야후옥션·플리마",
  daangn: "당근마켓",
  joongna: "중고나라",
};

// 실파싱 가능 소스 (한국 소스는 공개 API 없음 — 어드민 수동 등록으로 커버, 연동 준비 중)
export const LIVE_SOURCES: MarketSource[] = ["mercari", "yahoo_auction"];
