# 01 tomo 현황 진단 (2026-11-26, fast 조사 72WW2qnEPpUbhii4, 기준 tomo@8ba9fd3)

조사 에이전트가 읽기 전용이라 메인이 요약을 옮겼다. 근거 파일:줄은 원 보고 기준.

## 가장 큰 격차 TOP 15
1. JSON-LD 저장형 XSS (app/listings/[id]/page.tsx:141) — 2026-11-26 1478408 로 수정됨.
2. 결제 실검증: Stripe 테스트 모드 E2E는 11/26 통과(HANDOFF). 실결제 1회는 아직 없음.
3. DB 일시정지·백업·알림 절차 없음(10/27 실제 정지).
4. 신고·차단 기능 없음(상품·사용자·채팅). 분쟁은 거래 단위뿐.
5. 외부상품 캐시 오염: api/proxy allowClientSnapshot:true → 로그인 사용자가 lib/market/item.ts:59 로 제목·가격·이미지 임의 입력 행 생성, app/global/page.tsx:64-68 피드 노출.
6. CI 게이트 없음: server-image.yml build→push 만. lint·tsc·vitest 없음. 테스트 17파일 전부 라이브 Supabase 필요, 컴포넌트·E2E 없음.
7. 관측성 0: Sentry 없음, 서버 오류는 console.error 뿐.
8. 전 페이지 동적: lib/locale.ts:7-9 headers()/cookies() → 루트 레이아웃부터 동적. 레이아웃에서 getUser + RPC 3개(unread·notif·cart) 매 요청. proxy.ts 도 getUser.
9. 이미지 최적화 0: next/image 0건, <img> 24곳, images 설정 없음.
10. CSP Report-Only + script-src 'unsafe-inline'.
11. 어드민: 주문 상태 변경 불가(admin/orders 목록만), 상품 가격·제목 수정 불가, 정책·FAQ·가이드 하드코딩, 목록 limit 고정(페이지네이션 없음).
12. i18n 누수: API 에러 한국어 하드코딩(api/cart:29, api/order:18, api/proxy:32).
13. SEO: 상품 상세 hreflang 없음, lib/site.ts 기본값 옛 도메인, sitemap lastModified=now, BreadcrumbList·WebSite 없음.
14. 레이트리밋 메모리 카운터, /api/support-ai 총량 상한 없음.
15. 반쯤 만든 기능: 야후옥션 「준비 중」, 중고나라 스토어 목록, 당근·중고나라 필터 후처리, 메루카리 1페이지 36건, 국제배송비 0원 TODO(api/checkout:29), 단건/장바구니 결제 경로 이중, 푸시 실구독 미검증.

## 기타
- page.tsx 56개(고객 36, 어드민 20), API 20개. 깨진 내부 링크 없음.
- loading.tsx 없는 공개 페이지: about·help·guide·notice·categories·terms·privacy·refund·login·onboarding. error.tsx 루트 1개, global-error lang="ko" 고정. 피드 60/40개 캡, 페이지네이션 없음.
- 디자인 토큰: tomo-blue·tomo-pink 같은 값, tomo-coral 이 실제 파랑(85곳), 11px 하한 위반 3곳, raw hex 30곳, 카와이 시절 이름(TomoSymbol 40곳·HeartGauge 7곳).
- 문서 드리프트: PRODUCT.md·HANDOFF 시작 프롬프트가 Vercel 기준, vitest 개수 오래됨.