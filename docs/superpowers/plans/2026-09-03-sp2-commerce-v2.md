# SP2 커머스 v2 Implementation Plan

**Goal:** 상품 상세·/global·외부상품 상세를 DESIGN.md v2 토큰과 `lib/i18n.ts` 사전으로 재디자인한다 (스펙: `docs/superpowers/specs/2026-09-03-sp2-commerce-v2-design.md`).

**Constraints:** 흰 페이지·아이보리 틴트 3곳만·블루/핑크는 나라·브리지는 여행 뱃지·써라운드는 워드마크·Pretendard 11–17·가격 800 구매자 통화·`formatWithConversion` 계약 불변·vitest 전부 통과.

### Task 1: i18n 키 추가 — `lib/i18n.ts` (`detail.*`, `global.*`, `source.*`, `ext.*`). `npm test` i18n 통과.
### Task 2: 공유 버튼 `lang` 프롭 — `ChatButton`, `CheckoutButton`, `ProxyRequestButton`, `OriginalToggle`, `HeartGauge`(써라운드 제거·i18n).
### Task 3: 상품 상세 `app/listings/[id]/page.tsx` — 판매자 카드·제목·가격·안내 웰·상태·CTA i18n.
### Task 4: `/global` — 흰 헤더·17px 타이틀·아이보리 검색 16px·44px 탭·i18n.
### Task 5: 외부상품 상세 — 이미지 골격·뱃지·가격·예상표 navy/5·카드·CTA i18n.
### Task 6: 검증 — `tsc`, `npm test`, impeccable 디텍터, 브라우저(모바일 375/데스크톱 1440, ko/ja 토글) 실측. 커밋.
