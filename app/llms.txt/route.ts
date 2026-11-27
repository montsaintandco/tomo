import { SITE_URL } from "@/lib/site";
import { company } from "@/lib/company";
import { CUSTOMS_FREE_LIMIT, CUSTOMS_RATE_ABOVE, CUSTOMS_RATE_BELOW, PROXY_SHIPPING_ESTIMATE_JPY, PROXY_SHIPPING_ESTIMATE_KRW } from "@/lib/fees";
import { t } from "@/lib/i18n";
import { directFeeText } from "@/lib/seo";
import { auctionEnabled } from "@/lib/auction";

// 자체 상품 경매 요약(기능이 켜졌을 때만). 규칙 정본: docs/aaa/14 A절, 화면 문구: lib/help-faq
const AUCTION_SECTION = `## Auctions (경매 / オークション)
- 판매자는 상품을 「바로 판매」 또는 「경매」(1·3·5·7일)로 올린다. 경매는 택배 거래만, 가격 제안 없음.
- 입찰: 상한가 입찰 한 가지. 상한까지 필요한 만큼만 자동으로 올라가고 상한가는 비공개. 같은 금액이면 먼저 넣은 사람이 1등. 입찰은 취소할 수 없고, 입찰 단계에서는 돈이 나가지 않는다.
- 마감 5분 안에 현재가가 오르면 마감이 5분 늦어난다.
- 낙찰 뒤 48시간 안에 결제(낙찰가 + 국제 거래면 국제 배송비). 미결제면 낙찰 취소·경고 1회, 90일 안 2회면 30일 입찰 제한, 3회면 입찰 정지.
- 수수료는 일반 판매와 같다(판매자 낙찰가의 10%). 결제 뒤 배송·정산은 일반 에스크로 거래와 같다.
- Seller-listed auctions: proxy (max) bidding only, 5-minute extension when the price rises in the last 5 minutes, payment within 48 hours after winning, unpaid wins get a strike (2 in 90 days = 30-day bid ban, 3 = bidding suspended), shipping only, bids cannot be cancelled, same 10% seller fee.
- 自社出品オークション: 上限額入札のみ、終了5分前以内の価格上昇で5分延長、落札後48時間以内に支払い、未払いは警告(90日以内2回で30日入札制限、3回で停止)、配送取引のみ、入札取消不可、手数料は通常と同じ。
- 해외 마켓(메루카리·야후옥션) 경매 상품은 구매대행하지 않는다(구경만).

`;

// llms.txt — AI 검색 엔진용 서비스 요약. 사실만, 화면(/guide·/help·/about)과 같은 수치·문장. 숫자는 lib/fees 상수, 사업자 정보는 env가 있을 때만
export const revalidate = 86400;

const pct = (r: number) => `${Math.round(r * 100)}%`;

export function GET() {
  const op = company.name
    ? `- 운영사 / 運営会社: ${company.name}${company.bizNo ? ` (사업자등록번호 ${company.bizNo})` : ""}${company.address ? `, ${company.address}` : ""}${company.email ? `, ${company.email}` : ""}\n- ${company.name}는 구매대행 서비스 에어쉽(AirShip, https://airship.click)도 운영한다.`
    : "";
  const body = `# TOMO (토모 / トモ)

> 한국과 일본을 잇는 중고거래 플랫폼. 한국 사용자는 메루카리·Yahoo!フリマ 상품을, 일본 사용자는 당근마켓·중고나라 상품을 구매대행으로 받고, 양국 사용자끼리 에스크로로 직거래한다.
> Korea–Japan cross-border secondhand marketplace: proxy purchasing from Mercari / Yahoo! Flea (for Korean buyers) and Daangn / Joongna (for Japanese buyers), plus escrow-protected direct trades between users.

## Service
- 운영 주소 / Site: ${SITE_URL}
${op}
- 결제 / Payment: Stripe. 구매대행은 주문 시 1회 결제, 직거래는 에스크로 결제.
- 언어 / Languages: 한국어(기본), 日本語(${SITE_URL}/?lang=ja)

## What TOMO does
- 구매대행: 상품 링크를 붙여넣거나 검색 → 주문 시 1회 결제(상품가 + 국제배송비 + 통관·관세) → TOMO가 현지 구매 → 서울/나리타 센터 검수 → 국제배송 → 국내 택배. 결제 후 약 10~18일.
- 일본에서 당근·중고나라 상품 사기: 거주 국가를 일본(JP)으로 두고 검색하거나 상품 주소를 붙여넣는다 → 엔화로 1회 결제 → 서울 센터 검수 → 일본으로 배송.
- 직거래: 양국 사용자가 올린 상품을 에스크로로 결제하고, 국제 거래는 센터 검수를 거쳐 배송. 여행 중 현지에서 직접 받는 "여행 직거래"도 가능.
- 채팅 자동번역: 한국어·일본어 대화가 서로의 언어로 전달된다.

## Fees
- 구매대행: 별도 대행 수수료 항목 없음. 결제 항목은 상품 가격, 국제 배송비, 통관·관세 세 가지.
- 현지 유통비: ${t("ko", "seo.fee.localShip")}
- 국제 배송비: 주문당 1회, 무게·부피로 미리 예측(소형 기준 약 ${PROXY_SHIPPING_ESTIMATE_KRW.toLocaleString()}원 / ${PROXY_SHIPPING_ESTIMATE_JPY.toLocaleString()}엔).
- 통관·관세: 면세 한도(KRW ${CUSTOMS_FREE_LIMIT.KRW.toLocaleString()} / JPY ${CUSTOMS_FREE_LIMIT.JPY.toLocaleString()}) 이하면 상품가의 ${pct(CUSTOMS_RATE_BELOW)}, 초과 시 세금 + ${pct(CUSTOMS_RATE_ABOVE)}. 받을 때 추가 청구 없음.
- 직거래: ${directFeeText("ko")}
- 直接取引 (日本語): ${directFeeText("ja")}
- 환율은 결제 시점 기준.

${auctionEnabled() ? AUCTION_SECTION : ""}## Shipping
- 결제 후 약 10~18일: 판매자 발송 4~7일, 센터 검수 1~2일, 국제배송·통관 4~7일.
- 검수 센터: 서울(한국 상품), 나리타(일본 상품).

## Trust
- 에스크로: 구매자가 받고 확인하기 전까지 대금 보관. 판매처 취소 시 전액 환불.
- 센터 검수: 서울·나리타 센터에서 파손·오배송·수량을 확인한 뒤 국제배송.

## Pages
- ${SITE_URL}/ — 홈 (양국 인기 상품)
- ${SITE_URL}/guide — 구매대행 안내 (비용·총액 예시·절차·FAQ)
- ${SITE_URL}/global — 해외 마켓 통합 검색
- ${SITE_URL}/categories — 카테고리
- ${SITE_URL}/about — 서비스·운영사 소개
- ${SITE_URL}/help — 고객센터 FAQ
- ${SITE_URL}/travel — 여행 직거래
- ${SITE_URL}/refund — 취소·환불 정책
- ${SITE_URL}/terms — 이용약관
- ${SITE_URL}/privacy — 개인정보처리방침
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
