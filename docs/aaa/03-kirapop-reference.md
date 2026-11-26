# 03 키라팝 참고 (2026-11-26, fast 조사 Gte8cZhS3wLKLp32, 기준 kirapop bkaion25/main@46f8057c)

가치 상·난이도 하~중 상위 15 (경로는 kirapop 저장소 기준, 같은 Next.js 라 이식 쉬움)
| # | 항목 | 키라팝 파일 | tomo 대응 | 난이도 | 가치 |
|---|---|---|---|---|---|
| 1 | 가격 표기 통일(큰 줄 뷰어 통화, 작은 줄 원가, 반올림) | components/ui/Price.tsx, lib/price-display.ts | ListingCard, ExternalItemCard | 하 | 상 |
| 2 | 사이트맵 lastmod 고정 + 게이트 | app/sitemap.ts | app/sitemap.ts(now) | 하 | 상 |
| 3 | 인앱 브라우저 안내 | components/InAppNotice.tsx, lib/inapp-browser.ts | 없음 | 하 | 상 |
| 4 | 검색 0건 재검색 | lib/search-widen.ts | lib/market/search.ts | 하 | 상 |
| 5 | 관리자 선택 규칙 훅 | components/admin/use-grid-selection.ts | 일괄 작업 | 하 | 상 |
| 6 | 카드 통합(variant) + 44px 찜 | components/HomeItemCard.tsx | ListingCard+ExternalItemCard | 중 | 상 |
| 7 | 홈 줄 조립·중복 제거 | lib/home/assemble.ts, quality.ts | HomeHub, MarketCarousel | 중 | 상 |
| 8 | 번역 용어집(보호→번역→복원) | lib/goods-glossary.ts, lib/product-title.ts, components/ProductTitle.tsx | lib/translate.ts | 중 | 상 |
| 9 | 결제 직전 가격 재확인 | lib/price-check.ts, app/api/orders/price-check | CheckoutButton | 중 | 상 |
| 10 | 시세 SEO 페이지 | lib/price-pages.ts, lib/price-stats.ts, app/(store)/price/[slug] | api/market/price 만 | 중 | 상 |
| 11 | 운영 SystemHealth 배너 | components/admin/SystemHealth.tsx | 없음 | 중 | 상 |
| 12 | 검색 입력 해석(공유문구·ID) | lib/search-input.ts | lib/market/url.ts | 하 | 중 |
| 13 | 관리자 훅(자동갱신·이탈 경고) | components/admin/use-auto-refresh.ts, use-unsaved-guard.ts | 관리자 | 하 | 중 |
| 14 | 원형 카테고리 메뉴 | components/home/CharacterEntry.tsx, lib/home/curation.ts | CategoryChips | 중 | 중 |
| 15 | 알림 채널 no-op 폴백 + 텔레그램 운영 알림 | lib/notify-channels.ts, lib/telegram-order-alert.ts | lib/notifications.ts | 하~중 | 중 |

그 밖(중): 최근 검색·최근 본 상품(SearchPanel, RecentRow, lib/recent.ts), 통합 검색 필터(lib/unified-search.ts, SearchFilterPanel, 모바일 시트), 어드민 커맨드 팔레트·데이터 그리드·필터 툴바·저장 뷰, SSRF 가드(lib/url-guard.ts), 스크레이퍼 캐시(lib/scrape-cache.ts), robots 검색결과 차단, 배지 규칙(lib/item-badge.ts), 사진 검색, 정적 페이지 DB+폴백(lib/site-pages.ts), 마이페이지 진행 보드.
디자인: 키라 포일 전면 이식 X, 원칙만(그림자 금지·hover 2px·배지 1개).
제외: 경매·창고·바우처·등급·멀티테넌트·앱.