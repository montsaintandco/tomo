// 사람이 읽는 주문 번호(0042): 대행 주문 proxy_orders.code = T+6자리, C2C 거래 transactions.code = TX+6자리.
// 검색창 입력(「t12」「TX 000012」「#T000012」)을 정확한 번호로 바꾼다. 번호가 아니면 null.
export type OrderCode = { kind: "po" | "tx"; code: string };

export function parseOrderCode(input: string | null | undefined): OrderCode | null {
  const m = String(input ?? "").toUpperCase().replace(/[\s#-]/g, "").match(/^(TX|T)0*(\d{1,9})$/);
  if (!m || Number(m[2]) === 0) return null;
  const n = m[2].padStart(6, "0");
  return m[1] === "TX" ? { kind: "tx", code: `TX${n}` } : { kind: "po", code: `T${n}` };
}

/** 화면 표시 — 번호가 아직 없으면(마이그레이션 전) uuid 앞 8자리 */
export const orderLabel = (code: string | null | undefined, id: string) => code || id.slice(0, 8);
