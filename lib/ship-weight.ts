// 0057 판매 폼 「포장 후 무게」(kg) 검사. null = 안 넣음(국내·만남 거래), undefined = 잘못된 값(400).
// 한국 상품 국제 택배의 필수 여부와 표 최대 무게는 DB 가 판정한다(listing_require_weight·intl_ship_fee_krw).
export function parseShipWeight(v: unknown): number | null | undefined {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return undefined;
  return Math.round(n * 100) / 100;
}