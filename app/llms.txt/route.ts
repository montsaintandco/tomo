import { SITE_URL } from "@/lib/site";
import { company } from "@/lib/company";
import { CUSTOMS_FREE_LIMIT } from "@/lib/fees";

// llms.txt — AI 검색 엔진용 서비스 요약. 사실만, 정책 문서와 같은 수치. 사업자 정보는 env가 있을 때만
export const revalidate = 86400;

export function GET() {
  const biz = company.name ? `\n## Operator\n- ${company.name}${company.bizNo ? ` (사업자등록번호 ${company.bizNo})` : ""}${company.address ? `, ${company.address}` : ""}${company.email ? `, ${company.email}` : ""}` : "";
  const body = `# TOMO (토모 / とも)

> 한국과 일본을 잇는 중고거래 플랫폼. 한국 사용자는 메루카리·Yahoo!フリマ 상품을, 일본 사용자는 당근마켓·중고나라 상품을 구매대행으로 받고, 양국 사용자끼리 에스크로로 직거래한다.
> Korea–Japan cross-border secondhand marketplace: proxy purchasing from Mercari / Yahoo! Flea (for Korean buyers) and Daangn / Joongna (for Japanese buyers), plus escrow-protected direct trades between users.

## What TOMO does
- 구매대행: 상품 링크를 붙여넣거나 검색 → 주문 시 1회 결제(상품가 + 국제배송비 + 통관·관세) → TOMO가 현지 구매 → 서울/나리타 센터 검수 → 국제배송 → 국내 택배. 결제 후 약 10~18일.
- 직거래: 양국 사용자가 올린 상품을 에스크로로 결제하고, 국제 거래는 센터 검수를 거쳐 배송. 여행 중 현지에서 직접 받는 "여행 직거래"도 가능.
- 채팅 자동번역: 한국어·일본어 대화가 서로의 언어로 전달된다.

## Fees (as of 2026-09)
- 별도 대행 수수료 항목 없음. 결제 항목은 상품 가격, 국제 배송비, 통관·관세 세 가지.
- 통관·관세: 면세 한도(KRW ${CUSTOMS_FREE_LIMIT.KRW.toLocaleString()} / JPY ${CUSTOMS_FREE_LIMIT.JPY.toLocaleString()}) 이하면 상품가의 10%, 초과 시 세금 + 5%. 받을 때 추가 청구 없음.
- 환율은 결제 시점 기준.

## Trust
- 에스크로: 구매자가 받고 확인하기 전까지 대금 보관. 판매처 취소 시 전액 환불.
- 센터 검수: 서울·나리타 센터에서 파손·오배송·수량을 확인한 뒤 국제배송.
${biz}

## Pages
- ${SITE_URL}/ — 홈 (양국 인기 상품)
- ${SITE_URL}/guide — 구매대행 안내 (수수료·절차·FAQ)
- ${SITE_URL}/global — 해외 마켓 통합 검색
- ${SITE_URL}/about — 서비스 소개
- ${SITE_URL}/help — 고객센터 FAQ
- ${SITE_URL}/refund — 취소·환불 정책
- ${SITE_URL}/terms — 이용약관
- ${SITE_URL}/privacy — 개인정보처리방침
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
