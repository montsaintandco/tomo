# 02 에어쉽 참고 (2026-11-26, fast 조사 yWOtfhKcsaI8fxB2, 기준 airship-mint-delivery@ddff4ea)

가치 상·난이도 하~중 상위 15 (경로는 airship 저장소 기준)
| # | 항목 | 에어쉽 경로 | tomo | 가치 | 난이도 |
|---|---|---|---|---|---|
| 1 | 살 수 없는 출품 필터(専用·オーダー·取り置き·抽選) | src/lib/mercari-listing.ts | lib/market/mercari.ts 에 없음 | 상 | 하 |
| 2 | 검색 0건 재시도(표현 넓히기) | src/lib/search-widen.ts | 없음 | 상 | 하 |
| 3 | 검색 0건 AI 구제 | src/lib/search-rescue.ts | 없음 | 상 | 중 |
| 4 | 상품 주의 체크(구매자 지정·항공 제한) | src/lib/item-insight.ts, components/market/ItemInsight.tsx | 없음 | 상 | 하 |
| 5 | 한→일 고유명사 사전 | src/lib/ko-ja-terms.ts | 없음 | 상 | 하 |
| 6 | AI 예산·캐시 가드 | src/lib/ai/budget.server.ts, cache.server.ts | 없음 | 상 | 중 |
| 7 | 어드민 UI 키트(URL 필터·DataTable·DetailSheet·SavedViews·KpiBand) | src/components/admin/ui/* | components/admin/ui.tsx 단일 | 상 | 중 |
| 8 | 어드민 「내 차례」 큐 + 지연 기준 | components/admin/home/MyTurnQueue.tsx, lib/admin-aging.ts | 없음 | 상 | 중 |
| 9 | 인기 검색어 = 검색 로그 집계·정제 | lib/search-log.server.ts, popular-clean.ts, migrations/20260919160000_search_logs.sql | 없음 | 상 | 중 |
| 10 | 최근 본 상품·최근 검색 | src/lib/recent.ts | 없음 | 상 | 하 |
| 11 | 판매자 취소 이력 경고 | src/lib/seller-cancels.ts | 없음 | 상 | 하 |
| 12 | 명품·고가 위험 신호 | src/lib/ai/luxury-risk.ts | 없음 | 상 | 중 |
| 13 | 키워드 매물 알림 | src/lib/kw-alert.ts, kw-judge.server.ts | 없음 | 상 | 중 |
| 14 | 품절·종료 상품 구제(비슷한 상품+알림) | components/market/EndedRescue.tsx | 비활성 버튼만 | 상 | 중 |
| 15 | 주문 고유번호 code6 | AGENTS.md | 확인 필요 | 상 | 하 |

제외: 3PL·창고·바우처·카드 충전·추천인·멤버십·관세율표·중국·셀러 도구·야후 자동입찰·알림톡.
tomo 에는 크론 기반이 없다(브리핑·지연 알림류는 크론부터).