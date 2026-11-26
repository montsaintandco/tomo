# 05 업데이트 로드맵 (2026-11-26, deep 설계, 기준 tomo@1478408)

설계만 담는다. 코드는 고치지 않았다. 출처 표기는 `01#5`(01 문서 TOP 5번), `02#1`(에어쉽 표 1번), `03#9`(키라팝 표 9번), `04T3`(UX TOP 3번), `04홈`(04 화면별 표)처럼 쓴다.

## 0. 결론

- 트랙 12개다. 준비 커밋 P(메인) → 1차 웨이브 6개(T0~T5, 병렬) → 2차 웨이브 6개(T6~T11, 병렬) 순서로 간다.
- 추천 순서의 기준은 운영 사고·돈 누락·고객 혼란이 적은 쪽이다. 작업량은 근거로 쓰지 않았다.
- 돈과 안전은 DB에서 막는다(RLS·RPC). 화면 필터만으로 막는 안은 고르지 않았다.
- master 푸시가 1분 안에 운영에 나간다. 그래서 병합은 한 번에 트랙 하나만 하고, 병합마다 스모크를 돌린다.

## 1. 조사 문서에서 바로잡은 사실 (설계 전제)

| 조사 문서 서술 | 실제(코드 확인) | 설계 반영 |
|---|---|---|
| 01#3 「DB 일시정지」 | 2026-11-23부터 켜져 있다. 0025~0031 적용됨 | DB 기능을 전제로 설계한다. 정지 감지는 T0 스모크가 맡는다 |
| 01#6 「테스트 17파일 전부 라이브 DB 필요」 | 18파일 중 8개만 DB를 쓴다(cart-rls·chat·curation-rls·escrow·listings-api·notifications·profile-country·rls). 나머지 10개는 DB가 필요 없다 | T0가 10개를 CI 게이트로 쓴다 |
| 04T1 「JP 화면 가격이 원화」 | 비로그인 일본어 화면은 엔화다(`lib/listings.ts getViewerOrGuest`). 검수 브라우저가 한국 거주 계정으로 로그인돼 있었다. 로그인 사용자는 통화가 거주국을 따른다 | 통화 규칙은 유지한다(결제 통화와 같아야 혼란이 없다). 고칠 것은 「번역 제목이 화면 언어와 안 맞는 것」이다(T2) |
| 04T2 「모바일 하단 탭바 없음」 | `components/BottomNav.tsx`가 있다. 설치된 앱(standalone)에서만 보인다 | T5가 브라우저 모바일에도 켠다 |
| 01#14 「레이트리밋 메모리 카운터」 | 서버가 컨테이너 1개라 카운터는 지금 정확하다. 재시작하면 초기화된다 | 저장소형 한도는 안 만든다. AI 상담 하루 총량만 DB 로그로 막는다(T3) |
| 01#15 「국제배송비 0원 TODO」 | `app/api/checkout/route.ts`가 클라이언트가 보낸 `intlShippingFee`를 그대로 쓴다. 구매자가 배송비를 정할 수 있다 | T4가 서버 계산으로 바꾼다. 금액 정책은 Ren 결정(9절) |
| (신규) 장바구니 주문 가격 | DB의 신선도 기준이 24시간이다(0018·0020 `create_proxy_order`). 하루 전 가격으로 자동 결제될 수 있다 | T4가 결제 직전 재파싱 + DB 기준 단축(0035) |

## 2. 공통 규칙 (모든 트랙)

| 규칙 | 내용 |
|---|---|
| 작업 위치 | 트랙마다 git worktree를 따로 쓴다. 기준은 P 커밋 뒤 master다 |
| 파일 소유 | 웨이브 안에서 배타다. 표에 없는 기존 파일은 고치지 않는다. 2차는 1차 병합이 끝난 뒤 시작하므로 소유가 넘어갈 수 있다 |
| 새 의존성 | 금지다. `package.json`은 T0(1차)·T11(2차)만 고친다 |
| DB | 트랙 에이전트는 SQL 파일만 쓴다. 적용은 메인만 한다(`begin … rollback` 시험 → 적용). 추가만 한다(drop·rename 금지). 파일 끝에 되돌리기 SQL을 주석으로 둔다 |
| 새 표를 읽는 코드 | `lib/safe.ts`의 `rows`·`tableMissing`으로 표가 없어도 화면이 살아야 한다 |
| 병합 순서 | 마이그레이션 적용 → 코드 병합(squash 1커밋) → 스모크 → 다음 트랙 |
| 되돌리기 | `git revert <병합 커밋>` 후 푸시한다. 1~3분 안에 이전 화면으로 돌아간다. DB는 추가만 했으므로 그대로 둔다 |
| 검증 명령 | `node node_modules/typescript/bin/tsc --noEmit` · `node node_modules/eslint/bin/eslint.js .` · `node node_modules/vitest/vitest.mjs run -c vitest.unit.config.ts` · `node node_modules/next/dist/bin/next build` (이 PC는 npx가 안 된다) |
| 화면 확인 | 390px·1440px, ko·ja, 비로그인·로그인 각각 본다. 캡처는 뷰마다 한 번만 찍는다 |
| 문구 | 사용자에게 보이는 글은 ko·ja 둘 다 넣는다. API 오류도 `apiError()`로 언어를 맞춘다(01#12) |
| 커밋 금지 파일 | `AGENTS.md`(next dev가 자동 생성, 지금 수정 상태), `.env.local` |

### 2.1 공용 파일 충돌 지점과 나누는 방법

| 파일 | 방법 | 소유 |
|---|---|---|
| `lib/i18n.ts` | P가 빈 조각 10개를 만들고 `D`에 펼친다(`my.ts`는 이미 있어 그대로 쓴다). 트랙은 자기 조각 `lib/i18n-port/<트랙>.ts`만 고친다 | P만. 이후 전 트랙 금지 |
| `tailwind.config.ts`, `app/globals.css` | T1만 고친다. 새 이름 `accent`를 추가하고 옛 이름(`tomo-coral` 등)은 그대로 둔다. 다른 트랙은 있는 클래스만 쓴다 | 1차 T1, 2차 금지 |
| `app/layout.tsx`, `components/SiteHeader.tsx`, `BottomNav.tsx`, `SiteFooter.tsx`, `SupportLauncher.tsx`, `proxy.ts`, `next.config.mjs`, `lib/locale.ts`, `lib/listings.ts` | 「셸」로 묶어 T5 하나가 가진다 | 1차 T5, 2차 금지 |
| `components/ListingCard.tsx`, `ExternalItemCard.tsx`, `ListingRow.tsx`, `Skeletons.tsx` | T1만 고친다. 카드에 새로 보일 값은 P가 타입에 선택 필드로 미리 넣는다(2.2). 다른 트랙은 값만 채운다 | 1차 T1, 2차 금지 |
| `lib/market/**` | T2가 가진다. 예외는 `lib/market/item.ts`(T3) | 1차 T2·T3, 2차 T7은 읽기만 |
| `components/admin/AdminNav.tsx`, `app/admin/page.tsx`, `components/admin/ui.tsx` | 1차는 T0만 고친다(오류·신고 링크를 둘 다 넣는다). 2차는 T8 | 1차 T0, 2차 T8 |
| `package.json`, `.github/**`, `vitest*.config.ts`, `eslint.config.mjs` | 1차 T0, 2차 T11 | — |
| `HANDOFF.md`, `docs/aaa/index.md`, `PRODUCT.md`, `DESIGN.md` | 메인만 고친다(웨이브 끝에 한 번) | 메인 |
| `tests/*.test.ts`(기존) | 자기 영역 파일만 고친다. 새 순수 테스트는 `tests/unit/<트랙>-*.test.ts`, 새 DB 테스트는 `tests/<이름>.db.test.ts` | 각 트랙 |

### 2.2 준비 커밋 P (메인이 직접, 트랙 시작 전, 파일 약 15개)

| 항목 | 내용 |
|---|---|
| i18n 조각 | `lib/i18n-port/{obs,price,search,trust,pay,shell,home,detail,admin,seo}.ts`를 빈 객체로 만들고 `lib/i18n.ts`에 import·펼침을 넣는다. 기존 `my.ts`는 덮어쓰지 않는다 |
| 카드 계약 | `ExternalCardItem`에 선택 필드 `shippingIncluded?`·`likes?`·`condition?`·`rank?`·`isNew?`를 넣는다. `lib/market/types.ts`의 목록·상세 타입에 `shippingIncluded?`·`likes?`·`condition?`·`sellerRating?`·`sellerSales?`·`shipFrom?`·`unbuyable?`를 넣는다 |
| 오류 도우미 | `lib/api-error.ts`의 `apiError(lang, key, status)`를 만든다. 키는 각 트랙 조각에 넣는다 |
| 검증 | tsc·eslint·기존 순수 테스트·`next build`가 통과한다. 화면 변화는 없다 |
| 2차 준비 | 2차 시작 전에 같은 방식으로 `lib/seo.ts`에 `langAlternates(path)`를 넣는다(T7·T9·T10이 쓴다) |

## 3. 트랙 한눈에

| 트랙 | 이름 | 한 줄 목표 | 웨이브 | DB |
|---|---|---|---|---|
| P | 준비 커밋 | 조각·계약 타입을 먼저 깔아 충돌을 없앤다 | 0 | 없음 |
| T0 | 개발 환경·관측 | 게이트를 통과한 코드만 배포하고, 오류와 배포 실패를 바로 안다 | 1 (먼저 또는 병렬) | 0032 |
| T1 | 가격 표기·카드·토큰 | 모든 카드와 가격 줄이 한 규칙으로 보인다 | 1 | 없음 |
| T2 | 검색 품질 | 살 수 있는 상품만, 건수·정렬·필터와 함께, 화면 언어에 맞는 제목으로 보인다 | 1 | 0036 |
| T3 | 신뢰·안전 | 신고·차단이 되고, 고객이 넣은 상품 정보가 공개 화면에 못 나온다 | 1 | 0033, 0034 |
| T4 | 결제 직전 재확인·주문 금액 | 옛 가격·품절 상품·고객이 정한 배송비로 결제되지 않는다 | 1 | 0035 |
| T5 | 앱 셸·모바일 내비·속도 | 모바일 하단 탭이 생기고, 첫 응답이 DB 왕복을 기다리지 않는다 | 1 | 없음 |
| T6 | 홈·카테고리 | 첫 화면에 상품이 보이고, 빈 국내 탭이 비어 보이지 않는다 | 2 | 없음 |
| T7 | 상품 상세 | 예상 총액·판매자·주의 사항이 첫 화면에 보인다 | 2 | 없음 |
| T8 | 어드민 운영 | 주문 상태 변경·상품 수정·「내 차례」 목록·페이지 넘김이 된다 | 2 | 0037 |
| T9 | SEO·고객센터·정적 화면 | 색인 신호가 정확하고, FAQ를 목록으로 찾는다 | 2 | 없음 |
| T10 | 판매·마이·로그인 | 등록 폼·마이페이지·로그인 화면을 모바일·일본어 기준으로 마감한다 | 2 | 없음 |
| T11 | DB 테스트 격리 | DB 테스트가 운영 DB가 아닌 CI 안 DB에서 돈다 | 2 | 없음(기존 재생만) |

예비 번호: 0038, 0039.

## 4. 1차 웨이브 (P 뒤, 서로 독립)

### T0 개발 환경·관측

| 항목 | 내용 |
|---|---|
| 목표 | tsc·lint·순수 테스트가 실패하면 이미지가 올라가지 않는다. 서버·브라우저 오류와 배포 후 장애가 텔레그램과 어드민에 남는다 |
| 포함 | 01#6 CI 게이트 · 01#7 오류 수집 · 01#10 CSP 위반 기록(강제는 안 함) · 03#11 SystemHealth · 03#15 알림 채널 no-op 폴백+텔레그램 · 01 「global-error lang 고정」 · 01#3 정지 감지(스모크) |
| 설계 | ① `server-image.yml`에 `gate` 작업(tsc → eslint → `vitest -c vitest.unit.config.ts`)을 넣고 `build`가 `needs: gate`를 갖는다. ② `vitest.unit.config.ts`는 DB 파일 8개와 `**/*.db.test.ts`를 뺀다. ③ `instrumentation.ts`의 `onRequestError` → `lib/observe.ts report()` → `error_events` 적재 + 텔레그램(env 없으면 조용히 건너뜀, 같은 오류 10분에 1번). ④ 브라우저 오류는 `app/error.tsx`·`global-error.tsx` → `/api/client-error`. ⑤ `scripts/smoke.mjs`가 배포 3분 뒤 운영 주소의 `/`·`/global?q=ポケモン`·`/help`·`/robots.txt`·DB를 읽는 `/api/health`를 확인하고 실패하면 텔레그램으로 알린다(하루 1번 예약 실행도 넣는다) |
| 소유 | `.github/workflows/server-image.yml`, `.github/workflows/smoke.yml`(신규), `package.json`, `vitest.config.ts`, `vitest.unit.config.ts`(신규), `eslint.config.mjs`, `instrumentation.ts`(신규), `lib/observe.ts`(신규), `lib/notify-ops.ts`(신규), `app/error.tsx`, `app/global-error.tsx`, `app/api/client-error/route.ts`(신규), `app/api/csp-report/route.ts`, `app/api/health/route.ts`(신규), `app/admin/errors/page.tsx`(신규), `components/admin/SystemHealth.tsx`(신규), `components/admin/AdminNav.tsx`, `app/admin/page.tsx`, `scripts/smoke.mjs`(신규), `lib/i18n-port/obs.ts`, `tests/unit/obs-*.test.ts`, `supabase/migrations/0032_error_events.sql` |
| DB | 0032 `error_events`(id, source `server`/`client`/`csp`, message, stack, path, digest, user_id, count, first_at, last_at). 쓰기는 service_role만, 읽기는 `is_admin_user()`. 30일 지난 행은 적재 때 지운다 |
| 완료 기준 | 일부러 타입 오류를 넣은 브랜치에서 이미지가 안 올라간다. 시험 경로에서 던진 오류가 `/admin/errors`와 텔레그램에 1건 뜬다. 스모크가 초록이다. `AdminNav`에 「오류」·「신고」 링크가 있다 |
| 위험 | 게이트가 기존 lint 경고로 막힐 수 있다 → 오류만 실패로 본다. 오류 폭주로 표가 불어난다 → digest로 합쳐 count만 올린다. 오류 적재가 실패하면 원래 요청에 영향이 없어야 한다(try/catch, await 안 함) |
| 되돌리기 | 병합 커밋을 revert한다. 게이트만 문제면 `needs: gate` 한 줄을 뺀다 |

### T1 가격 표기·카드·토큰

| 항목 | 내용 |
|---|---|
| 목표 | 큰 줄은 보는 사람 통화, 작은 줄은 원래 통화, 반올림 규칙 하나로 통일한다. 카드는 제목 한 줄 묶음 + 찜 + 상태 표식을 갖는다 |
| 포함 | 03#1 가격 표기 통일 · 03#6 카드 통합·44px 찜 · 04T4 카드(번역 제목만, ¥ 원가 병기, 배송비 포함, 찜) · 04T11 색·대비 · 04 공통 터치 크기(카드 안) · 01 디자인 토큰(11px 위반 3곳, raw hex 중 카드·가격 영역) · 03 배지 규칙(배지 1개) |
| 설계 | `lib/price-display.ts`가 유일한 표기 계산처다. `components/ui/Price.tsx`가 그 결과를 그린다. 카드는 번역 제목이 있으면 그것만 보이고 원문은 `title` 속성에 둔다. 로그인 사용자의 화면 언어와 통화가 다르면 가격 옆에 통화 표시를 작게 붙인다(통화 규칙은 안 바꾼다). `tailwind.config.ts`에 `accent`·`accent-ink` 이름을 추가한다(옛 이름 유지) |
| 소유 | `lib/currency.ts`, `lib/price-display.ts`(신규), `lib/item-badge.ts`(신규), `components/ui/Price.tsx`(신규), `components/ListingCard.tsx`, `ExternalItemCard.tsx`, `ListingRow.tsx`, `Skeletons.tsx`, `WishButton.tsx`, `UnwishButton.tsx`, `SourceLogo.tsx`, `PriceHint.tsx`, `tailwind.config.ts`, `app/globals.css`, `lib/i18n-port/price.ts`, `tests/currency.test.ts`, `tests/unit/price-*.test.ts` |
| DB | 없음 |
| 완료 기준 | 순수 테스트가 KRW↔JPY 반올림·병기 줄을 고정한다. 홈·검색·찜 목록 카드에서 제목이 한 묶음이고 원가가 작게 병기된다. 카드 안 터치 영역이 44px 이상이다. 비로그인 ja 화면에 「원」이 없다 |
| 위험 | 카드 높이가 바뀌어 홈 가로 줄이 흔들린다 → 카드 높이를 고정값으로 둔다. 가격 줄을 잘못 바꾸면 결제 금액과 달라 보인다 → 표시는 `lib/fees.ts` 결과를 그대로 받고 다시 계산하지 않는다 |
| 되돌리기 | 병합 커밋 revert. 다른 트랙은 `Price`를 2차에서만 쓰므로 1차 revert는 독립이다 |

### T2 검색 품질

| 항목 | 내용 |
|---|---|
| 목표 | 살 수 없는 출품이 빠진다. 0건이면 표현을 넓혀 다시 찾는다. 결과 위에 건수·정렬·필터 칩이 있다. 제목은 화면 언어에 맞는다 |
| 포함 | 02#1 살 수 없는 출품 필터 · 02#2·03#4 0건 재검색 · 02#5 한→일 고유명사 사전 · 03#12 검색 입력 해석 · 02#10 최근 검색 · 02#9 검색 로그(적재만) · 04T3 건수·정렬·칩 · 04 검색(번역 안내 칩, 스켈레톤) · 01#15 중 메루카리 1페이지 36건·당근·중고나라 필터 후처리·야후옥션 「준비 중」 표식 · 04T1 중 「번역 제목이 화면 언어와 다름」 · 03 스크레이퍼 캐시 |
| 설계 | 제목 규칙: 번역 제목은 `title_translated_lang`이 화면 언어와 같을 때만 넘긴다. 다르면 원문만 넘긴다. 경매 상품은 「구경만」 표식(`unbuyable`)을 달고 기본 정렬에서 뒤로 보낸다. 검색 로그는 검색어·건수·언어만 적는다(사용자 식별 값 없음) |
| 소유 | `lib/market/**`(단 `item.ts` 제외), `lib/translate.ts`, `lib/search-widen.ts`·`lib/ko-ja-terms.ts`·`lib/search-input.ts`·`lib/unbuyable.ts`·`lib/scrape-cache.ts`·`lib/search-log.ts`·`lib/recent.ts`(전부 신규), `app/global/page.tsx`, `app/global/loading.tsx`, `app/api/global/**`, `app/api/market/**`, `components/search/**`(신규: 건수·정렬 줄, 필터 칩, 최근 검색, 번역 칩), `lib/i18n-port/search.ts`, `tests/market.test.ts`, `tests/trending.test.ts`, `tests/unit/search-*.test.ts`, `supabase/migrations/0036_search_logs.sql` |
| DB | 0036 `search_logs`(q, q_norm, lang, source, hits, created_at; 쓰기 service_role, 읽기 관리자) + `external_items.title_translated_lang text` |
| 완료 기준 | 순수 테스트: 専用·取り置き 제목이 걸러진다, 0건 입력이 넓힌 검색어로 바뀐다, 사전이 고유명사를 바꾼다. 화면: `/global?q=포켓몬`에 건수·정렬·칩이 보인다. ja 화면 캐시 목록에 한국어 제목이 없다. 메루카리 2페이지째가 이어 붙는다 |
| 위험 | 필터가 살 수 있는 상품까지 지운다 → 지운 건수를 화면 아래에 「제외 N건 보기」로 되살릴 수 있게 한다. 페이지를 더 부르면 마켓이 막을 수 있다 → 요청 간격과 캐시(짧은 시간)를 둔다. 파서 변경은 `tests/market.test.ts` 고정 응답으로 먼저 잡는다 |
| 되돌리기 | 병합 커밋 revert. 0036은 추가 열·표라 남겨도 된다 |

### T3 신뢰·안전

| 항목 | 내용 |
|---|---|
| 목표 | 상품·사용자·채팅을 신고하고 사용자를 차단할 수 있다. 고객이 직접 넣은 외부 상품 정보는 본인과 관리자만 본다. AI 상담에 하루 상한이 있다 |
| 포함 | 01#4 신고·차단 · 01#5 외부상품 캐시 오염 · 01#14 AI 상담 총량 상한 · 02#6 AI 예산 가드(상한만) · 03 SSRF 가드(이미지 호스트 허용 목록) |
| 설계 | 캐시 오염은 DB에서 막는다. `external_items.origin`(`live`/`admin`/`client`)을 넣고, 공개 select 정책을 「`origin <> 'client'` 또는 그 상품으로 대행 요청을 낸 본인 또는 관리자」로 바꾼다. 이렇게 하면 홈·검색·사이트맵 코드를 안 고쳐도 전부 막힌다. 고객 스냅샷 이미지는 그 마켓의 이미지 호스트만 받는다. 차단은 양방향이다(대화 시작·메시지·가격제안을 RPC·정책에서 막는다). 신고는 같은 대상에 1인 1건이다. AI 상한은 `support_ai_log`(0030) 오늘 건수로 본다 |
| 소유 | `lib/market/item.ts`, `app/api/proxy/route.ts`, `lib/url-guard.ts`(신규), `lib/ratelimit.ts`, `lib/ai-budget.ts`(신규), `app/api/support-ai/route.ts`, `app/api/report/route.ts`·`app/api/block/route.ts`(신규), `components/safety/**`(신규: ReportButton·ReportSheet·BlockButton), `components/ChatRoom.tsx`, `ChatButton.tsx`, `OfferButton.tsx`, `app/chat/**`, `app/api/conversations/**`, `app/api/messages/**`, `app/profile/[id]/page.tsx`, `app/listings/[id]/page.tsx`(신고 버튼 삽입만), `app/admin/reports/page.tsx`(신규), `components/admin/ReportActions.tsx`(신규), `app/mypage/settings/page.tsx`(차단 목록), `lib/i18n-port/trust.ts`, `tests/unit/trust-*.test.ts`, `tests/trust.db.test.ts`, `supabase/migrations/0033_reports_blocks.sql`, `0034_external_origin.sql` |
| DB | 0033 `reports`(대상 종류·id, 사유, 상태, 처리자) · `blocks`(blocker, blocked) · RPC `report_target`·`block_user`·`unblock_user`·`admin_resolve_report`(처리 시 `log_admin_action`) · 대화·메시지·제안 삽입 정책에 차단 검사. 0034 `external_items.origin` + 공개 select 정책 교체 + 기존 행 백필(`fetched_at = epoch` 인 행은 `client`) |
| 완료 기준 | DB 테스트: 차단당한 사용자가 메시지·제안을 못 넣는다. `client` 행이 anon·다른 사용자에게 안 보이고 요청자에게는 보인다. 화면: 상품·프로필·채팅에서 신고가 접수되고 `/admin/reports`에 뜬다. 다른 마켓 호스트 이미지를 넣은 요청이 400이다 |
| 위험 | 정책 교체가 정상 상품까지 가린다 → 0034 시험 실행에서 anon으로 `active` 행 수가 교체 전후 같은지(client 행 제외) 확인한다. 차단 검사가 채팅 삽입을 느리게 한다 → `blocks`에 (blocker, blocked) 유일 색인. 허위 신고 폭주 → 1인 1건 + 분당 한도 |
| 되돌리기 | 코드는 revert. 정책은 0034 끝의 주석 SQL(옛 정책 복원)로 되돌린다 |

### T4 결제 직전 재확인·주문 금액

| 항목 | 내용 |
|---|---|
| 목표 | 결제창을 열기 직전에 서버가 가격·품절을 다시 본다. 바뀌었으면 결제를 멈추고 차이를 보여 준다. 배송비는 서버만 정한다 |
| 포함 | 03#9 결제 직전 가격 재확인 · 01#15 국제배송비(클라이언트 값 제거)·단건/장바구니 결제 경로 정리 · 01#12 API 오류 문구(cart·order·checkout) · 02#15 주문 고유번호 표시 확인 · 01#2 실결제 점검표(문서) |
| 설계 | `/api/order`(새 주문)가 `create_proxy_order` 전에 항목마다 `loadItem`으로 다시 파싱해 `external_items`를 갱신한다. 가격이 오르거나 품절이면 409와 차이 목록을 준다. 화면은 「가격이 바뀌었어요」 확인 창을 띄우고 동의 뒤 다시 보낸다. 내린 가격은 그대로 진행한다. 파싱이 안 되면 자동 결제를 막고 견적 요청(대행 신청)으로 안내한다. DB 신선도 기준을 24시간 → 15분으로 줄여 재확인을 건너뛴 요청도 막는다. 직거래 `/api/checkout`은 클라이언트 `intlShippingFee`를 무시하고 서버 값만 쓴다(값은 9절 결정 전까지 0원 고정) |
| 소유 | `lib/price-check.ts`(신규), `lib/fees.ts`, `app/api/order/**`, `app/api/checkout/route.ts`, `app/api/cart/route.ts`, `components/CheckoutButton.tsx`, `OrderForm.tsx`, `OrderSummary.tsx`, `OrderActions.tsx`, `CartList.tsx`, `CartButtons.tsx`, `PayTxButton.tsx`, `PayNotice.tsx`, `CostInfo.tsx`, `components/pay/PriceChangedDialog.tsx`(신규), `app/cart/**`, `app/order/**`, `lib/i18n-port/pay.ts`, `tests/fees.test.ts`, `tests/unit/pay-*.test.ts`, `tests/price-check.db.test.ts`, `docs/aaa/pay-checklist.md`(신규), `supabase/migrations/0035_order_freshness.sql` |
| 건드리지 않는 것 | `lib/stripe.ts`, `lib/stripe-settle.ts`, `lib/refunds.ts`, `app/api/stripe/**`. 11/26에 시험을 통과한 확정·환불 경로다 |
| DB | 0035 `create_proxy_order` 재정의(시그니처 유지, 신선도 15분, 오류 코드 `stale item` 유지) |
| 완료 기준 | 순수 테스트: 오름·내림·품절·파싱 실패 4경우의 판정. DB 테스트: 16분 지난 항목으로 주문이 거부된다. 화면(Stripe 테스트 모드): 가격을 DB에서 낮춰 둔 항목으로 주문하면 확인 창이 뜨고, 동의 뒤 결제창 금액이 새 가격이다. 변조한 `intlShippingFee`가 금액에 반영되지 않는다. 점검표대로 테스트 모드 결제→환불 1회 통과 |
| 위험 | 마켓이 서버 IP를 막으면 모든 장바구니 주문이 견적 경로로 간다 → 고객 혼란은 있으나 돈 사고는 없다. 안내 문구로 이유를 말하고 T0 알림이 파싱 실패율을 알린다. 15분이 너무 짧아 주문서 작성 중 만료 → 주문 버튼을 누를 때 재파싱하므로 만료되지 않는다 |
| 되돌리기 | 코드 revert + 0035 끝의 주석 SQL(24시간 복원). 순서는 SQL 먼저다 |
| 병합 | 1차의 마지막에 병합한다. 병합 전 메인이 DB 테스트 전체를 돌린다 |

### T5 앱 셸·모바일 내비·속도

| 항목 | 내용 |
|---|---|
| 목표 | 브라우저 모바일에 하단 탭(홈·검색·판매·채팅·마이)이 있다. 레이아웃이 DB 응답을 기다리지 않는다. 「문의」 버튼이 내용을 가리지 않는다 |
| 포함 | 04T2 하단 탭·문의 버튼 · 01#8 레이아웃 getUser+RPC 3개·proxy.ts getUser · 04T9 중 첫 화면 이미지 수·지연 로딩(셸 범위) · 03#3 인앱 브라우저 안내 · 01 「loading.tsx 없는 공개 페이지 10곳」 · 04 공통 터치 크기(헤더 아이콘) · 04고객센터 「문의 입구 두 곳」 |
| 설계 | 레이아웃은 언어만 읽는다. 안읽음·알림·장바구니 수는 `/api/me/summary`를 화면이 뜬 뒤 한 번 부른다(비로그인은 안 부른다). `proxy.ts`는 보호 경로에서만 `getUser`를 부른다. 하단 탭은 브라우저 모바일에도 보이고, 상단 가로 메뉴는 모바일에서 접는다. 문의 버튼은 하단 탭·고정 구매 바 위로 올리고 `/help`·`/chat`·결제 화면에서는 숨긴다. `next.config.mjs`는 이번에 `images` 설정을 넣지 않는다(8절) |
| 소유 | `app/layout.tsx`, `app/loading.tsx`, `lib/locale.ts`, `lib/listings.ts`, `proxy.ts`, `next.config.mjs`, `components/SiteHeader.tsx`, `BottomNav.tsx`, `SiteFooter.tsx`, `SupportLauncher.tsx`, `LangToggle.tsx`, `NotificationBell.tsx`, `components/shell/**`(신규: HeaderCounts·InAppNotice), `lib/inapp-browser.ts`(신규), `app/api/me/summary/route.ts`(신규), `app/{about,help,guide,notice,categories,terms,privacy,refund,onboarding}/loading.tsx`·`app/(auth)/login/loading.tsx`(신규), `lib/i18n-port/shell.ts`, `tests/unit/shell-*.test.ts` |
| DB | 없음 |
| 완료 기준 | 비로그인 홈 응답에서 Supabase 호출이 0회다(서버 로그로 확인). 로그인 홈 첫 응답 시간이 병합 전보다 준다(같은 PC에서 5회 중앙값을 전후로 적는다). 390px 브라우저에서 하단 탭 5개가 보이고 문의 버튼이 탭·구매 바와 겹치지 않는다. 보호 경로(`/mypage`·`/sell`·`/admin`)는 비로그인에서 로그인으로 간다 |
| 위험 | `proxy.ts` 범위를 줄이다 보호 경로를 빠뜨린다 → 보호 경로 목록을 순수 테스트로 고정한다. 세션 쿠키 갱신이 `proxy.ts`에 있으면 범위를 줄일 때 로그인이 풀린다 → 갱신은 전 경로에 남기고 `getUser` 검증만 줄인다. 배지 숫자가 늦게 뜬다 → 자리 크기를 미리 잡는다 |
| 되돌리기 | 병합 커밋 revert |

### 1차 병합 순서

| 순서 | 트랙 | 이유 |
|---|---|---|
| 1 | P | 계약·조각 |
| 2 | T0 | 이후 병합이 게이트와 스모크를 탄다 |
| 3 | T1 | 화면 표기만 바뀐다 |
| 4 | T5 | 셸. 병합 뒤 로그인·보호 경로를 손으로 확인한다 |
| 5 | T2 | 0036 적용 뒤 |
| 6 | T3 | 0033·0034 적용 뒤. anon 행 수 전후 확인 |
| 7 | T4 | 0035 적용 뒤. DB 테스트 전체 + 테스트 모드 결제 1회 |

## 5. 2차 웨이브 (1차 전부 병합 뒤)

### T6 홈·카테고리

| 항목 | 내용 |
|---|---|
| 목표 | 첫 화면에 상품 줄이 걸친다. 검색창은 하나다. 국내 상품이 0개여도 빈 화면이 아니다 |
| 포함 | 04T7 히어로 높이·중복 검색창 · 04T8 국내 탭 대체 콘텐츠 · 04T10 카테고리(대표 사진·이중 버튼 정리) · 04홈(타일·칩 역할 정리, 가로 줄 16px 어긋남, 순위·신규 배지) · 03#7 홈 줄 조립·중복 제거 · 03#14 원형 카테고리 · 02#9 인기 검색어(T2 로그 집계·정제) · 02#10 최근 본 상품 줄 · 01 「피드 60/40개 캡」 |
| 소유 | `app/page.tsx`, `app/travel/**`, `app/categories/**`, `components/HomeHub.tsx`, `MarketCarousel.tsx`, `CategoryChips.tsx`, `TrendingThemeCard.tsx`, `SectionHeader.tsx`, `TrustStrip.tsx`, `BannerStrip.tsx`, `components/home/**`(신규), `lib/home/**`(신규: assemble·quality·popular), `lib/hero-image.ts`, `lib/i18n-port/home.ts`, `tests/unit/home-*.test.ts` |
| DB | 없음 |
| 완료 기준 | 1440×900 첫 화면에 상품 카드 한 줄이 온전히 보인다. 390px 첫 화면에 카드가 2장 이상 보인다. 같은 상품이 두 줄에 안 나온다(순수 테스트). 국내 0개일 때 「내 동네」에 해외 인기 줄과 등록 유도가 보이고 가짜 매물은 없다. ja 비로그인 홈이 엔화·일본어 제목이다 |
| 위험 | 인기 검색어에 부적절한 말이 올라온다 → 정제 목록 + 최소 건수 + 관리자 큐레이션(`/admin/trending`)을 먼저 쓴다 |
| 되돌리기 | 병합 커밋 revert |

### T7 상품 상세

| 항목 | 내용 |
|---|---|
| 목표 | 상세 첫 화면에 예상 총액(국제배송비 범위 포함)·판매자·상태·주의 사항이 있다. 품절 상품에서 다음 행동이 있다 |
| 포함 | 04T5 예상 총액·쉬운 용어 · 04T6 판매자·상태·발송지 · 04상세(제목 전체, 3가지 확인 펼침, 갤러리 확대) · 02#4 상품 주의 체크 · 02#11 판매자 취소 이력 경고 · 02#14 품절 구제(비슷한 상품만, 알림 제외) · 03#8 번역 용어집 · 01#13 상세 hreflang·BreadcrumbList |
| 소유 | `app/global/[source]/**`, `app/listings/[id]/page.tsx`, `app/listings/[id]/loading.tsx`, `components/Gallery.tsx`, `SellerPanel.tsx`, `SellerStats.tsx`, `PreorderCheck.tsx`, `ProxyRequestButton.tsx`, `OriginalToggle.tsx`, `ShareButton.tsx`, `PolicyNote.tsx`, `components/detail/**`(신규: TotalBox·ItemInsight·EndedRescue·ProductTitle), `lib/item-insight.ts`·`lib/goods-glossary.ts`·`lib/product-title.ts`(신규), `lib/i18n-port/detail.ts`, `tests/unit/detail-*.test.ts` |
| 읽기만 | `lib/market/**`(T2가 채운 상세 필드를 쓴다. 필드가 모자라면 메인에 알린다), `lib/fees.ts`(금액은 다시 계산하지 않는다), T3의 `components/safety/**`, T1의 `Price` |
| DB | 없음 |
| 완료 기준 | 총액 박스의 숫자가 주문서 합계와 같은 함수에서 나온다(순수 테스트로 같은 입력·같은 값 확인). 「현지 유통비」가 쉬운 말로 바뀌었다(ko·ja). 구매자 지정·항공 제한 제목에 주의 줄이 뜬다. 품절 상세에 비슷한 상품이 뜬다. 신고 버튼이 그대로 있다 |
| 위험 | 상세의 예상 총액과 주문서 금액이 다르면 고객 혼란이 가장 크다 → 범위 표기(「약」 아님, 최소~최대)와 같은 계산 함수만 쓴다. 용어집이 제목을 망친다 → 보호→번역→복원 순서를 테스트로 고정한다 |
| 되돌리기 | 병합 커밋 revert |

### T8 어드민 운영

| 항목 | 내용 |
|---|---|
| 목표 | 관리자가 주문 상태를 바꾸고 상품 제목·가격을 고친다. 오래 묵은 건이 「내 차례」에 먼저 뜬다. 목록이 페이지로 넘어간다 |
| 포함 | 01#11 주문 상태 변경·상품 수정·페이지 넘김 · 02#7 어드민 UI 키트(URL 필터·표·상세 시트) · 02#8 「내 차례」+지연 기준 · 03#5 선택 규칙 훅 · 03#13 자동 갱신·이탈 경고 · T0·T3 화면(오류·신고)의 내비·대시보드 정리 |
| 소유 | `app/admin/**`(전부), `app/api/admin/**`(단 `cancel`·`refunds`는 읽기만), `components/admin/**`, `components/Admin*.tsx`, `QuoteForm.tsx`, `RateForm.tsx`, `ExternalItemForm.tsx`, `TrendingThemeForm.tsx`, `NewThemeButton.tsx`, `lib/admin-aging.ts`(신규), `lib/i18n-port/admin.ts`, `tests/unit/admin-*.test.ts`, `tests/admin-ops.db.test.ts`, `supabase/migrations/0037_admin_ops.sql` |
| DB | 0037 RPC `admin_set_order_status(p_id, p_status, p_note)`(허용 전이 표를 DB에 두고 그 밖은 거부, `log_admin_action`) · `admin_update_listing(p_id, p_title, p_price, p_note)`(진행 중 거래가 있으면 가격 변경 거부) |
| 완료 기준 | DB 테스트: 허용 안 된 전이·거래 중 가격 변경이 거부되고 활동 기록이 남는다. 화면: 주문 상태 변경 → 새로고침 → 고객 주문 화면에 반영(저장→다시 읽기→다음 단계까지 확인). 목록 필터가 URL에 남는다. 환불·취소 화면이 병합 전과 같게 동작한다 |
| 위험 | 상태를 손으로 바꾸면 환불·정산 트리거와 어긋난다 → 돈이 걸린 전이(취소·환불·완료)는 이 RPC에서 막고 기존 버튼(0025 RPC)으로만 한다 |
| 되돌리기 | 코드 revert. 0037은 새 함수만이라 남겨도 된다 |

### T9 SEO·고객센터·정적 화면

| 항목 | 내용 |
|---|---|
| 목표 | 사이트맵·robots·기본 도메인이 정확하다. 고객센터에서 FAQ를 목록으로 찾는다 |
| 포함 | 01#13 SEO(옛 도메인 기본값, lastModified, WebSite) · 03#2 사이트맵 lastmod 고정 · 03 robots 검색결과 차단 · 04T12 중 FAQ 목록 · 04고객센터(안내 대비, 전송 버튼, 이모지) · 01 문서 드리프트는 메인이 맡는다 |
| 소유 | `app/sitemap.ts`, `app/robots.ts`, `app/manifest.ts`, `app/opengraph-image.tsx`, `app/llms.txt/**`, `lib/site.ts`, `lib/seo.ts`, `lib/indexnow.ts`, `app/help/**`, `app/guide/**`, `app/notice/**`, `app/about/**`, `app/terms/**`, `app/privacy/**`, `app/refund/**`, `app/not-found.tsx`, `components/SupportBot.tsx`, `LegalDoc.tsx`, `lib/help-faq.ts`, `lib/guide-content.ts`, `lib/support-tree.ts`, `lib/i18n-port/seo.ts`, `tests/unit/seo-*.test.ts` |
| DB | 없음 |
| 완료 기준 | `/sitemap.xml`의 lastmod가 요청마다 바뀌지 않는다. 옛 Vercel 주소가 코드 기본값에 없다. `/robots.txt`가 `/global?q=`를 막는다. `/help`에 FAQ 접이식 목록이 ko·ja로 보인다. 약관·환불 본문은 한 글자도 바뀌지 않았다(diff로 확인) |
| 위험 | robots 규칙을 넓게 쓰면 상품 상세까지 막는다 → 규칙을 순수 테스트로 고정한다(상세 허용·검색결과 차단) |
| 되돌리기 | 병합 커밋 revert |

### T10 판매·마이·로그인

| 항목 | 내용 |
|---|---|
| 목표 | 등록 폼이 사진 끌어놓기·가격 단위를 갖는다. 마이페이지 항목에 아이콘·미확인 표시가 있다. 로그아웃 상태의 로그인·가입 화면을 검수하고 고친다 |
| 포함 | 04T12 중 판매 폼 · 04마이(신뢰온도 막대, 아이콘·배지) · 04 한계 「로그인 화면 못 봄」 재검수 · 03 마이페이지 진행 보드 · 01 카와이 시절 이름(이 트랙 파일 안만) |
| 소유 | `app/sell/**`, `app/listings/[id]/edit/**`, `app/(auth)/**`, `app/auth/**`, `app/onboarding/page.tsx`, `app/mypage/**`(단 1차에 T3가 넣은 차단 목록은 유지), `components/SellForm.tsx`, `TripForm.tsx`, `ListingOwnerActions.tsx`, `LoginForm.tsx`, `OnboardingForm.tsx`, `ProfileForm.tsx`, `LogoutButton.tsx`, `PushToggle.tsx`, `HeartGauge.tsx`, `components/mypage/**`, `components/AddressBook.tsx`, `lib/image-resize.ts`, `lib/i18n-port/my.ts`(기존 파일에 추가), `tests/unit/my-*.test.ts` |
| DB | 없음 |
| 완료 기준 | 로그아웃 상태에서 `/login`·`/sell`(로그인 요구)·가입 화면을 390·1440, ko·ja로 캡처하고 문제를 고쳤다. 사진을 끌어놓아 올릴 수 있고 기본 「파일 선택」 버튼이 안 보인다. 가격 칸에 단위가 있다. 등록→상세→수정이 실제로 저장된다(시험 계정, 끝나면 상품 삭제) |
| 위험 | 사진 올리기 변경이 고아 이미지를 만든다 → 실패 시 즉시 정리하는 기존 경로(0013)를 그대로 쓴다 |
| 되돌리기 | 병합 커밋 revert |

### T11 DB 테스트 격리

| 항목 | 내용 |
|---|---|
| 목표 | DB 테스트(기존 8파일 + 1차·2차가 추가한 `*.db.test.ts`)가 CI 안의 임시 Supabase에서 돈다. 운영 DB에 쓰지 않는다 |
| 포함 | 01#6 나머지(DB 테스트 게이트) · 운영 DB에 시험 계정이 쓰는 문제 |
| 설계 | GitHub Actions에서 `supabase start`로 로컬 스택을 띄우고 `supabase/migrations` 0001~을 처음부터 재생한다. 시험 계정(alice·bob·관리자)은 `supabase/seed.sql`로 만든다. 테스트는 env로 주소·키를 받는다. 이 작업은 `gate`와 별도 작업 `db-tests`로 두고, 2주 동안 「실패해도 배포는 진행」으로 돌린 뒤 필수로 올린다 |
| 소유 | `.github/workflows/**`, `package.json`, `vitest.config.ts`, `vitest.unit.config.ts`, `supabase/config.toml`(신규), `supabase/seed.sql`(신규), `tests/setup/**`(신규), `tests/*.test.ts` 중 DB 8파일의 접속부만 |
| DB | 운영 DB는 건드리지 않는다. 적용된 마이그레이션 파일도 고치지 않는다 |
| 완료 기준 | Actions의 `db-tests`가 초록이다. 운영 DB의 `profiles` 행 수가 실행 전후 같다 |
| 멈춤 조건 | 마이그레이션이 처음부터 재생되지 않으면 고치지 않는다. 막힌 파일·줄·오류를 `docs/aaa/06-db-replay.md`에 적고 끝낸다(적용된 파일을 고치면 운영과 어긋난다) |
| 되돌리기 | `db-tests` 작업을 지운다. 배포 게이트에는 영향이 없다 |

### 2차 병합 순서

T9 → T6 → T7 → T10 → T8(0037 적용 뒤) → T11. T8은 저장→다시 읽기→다음 단계 확인을 거친 뒤 병합한다.

## 6. 격차 항목이 어디로 갔는지 (빠짐 확인)

| 출처 | 가는 곳 |
|---|---|
| 01#1 | 완료(1478408) |
| 01#2 | T4 점검표. 운영 실결제 1회는 Ren 결정(9절) |
| 01#3 | T0 스모크·알림. 백업은 8절 |
| 01#4·#5 | T3 |
| 01#6·#7 | T0, T11 |
| 01#8·#9 | T5(레이아웃·proxy), T1(카드 이미지 속성). next/image는 8절 |
| 01#10 | T0(위반 기록). 강제는 8절 |
| 01#11 | T8. 정책·FAQ DB화는 8절 |
| 01#12 | P 도우미 + 각 트랙이 자기 API |
| 01#13 | T9, T7(상세) |
| 01#14 | T3(AI 상한) |
| 01#15 | T2(파서), T4(배송비·결제 경로). 푸시 실구독은 8절 |
| 02#1·#2·#5·#9·#10 | T2(#9 집계 표시·#10 최근 본 줄은 T6) |
| 02#4·#11·#14 | T7 |
| 02#6 | T3(상한만) |
| 02#7·#8 | T8 |
| 02#15 | T4 |
| 02#3·#12·#13 | 8절 |
| 03#1·#6 | T1 |
| 03#2 | T9 |
| 03#3 | T5 |
| 03#4·#12 | T2 |
| 03#5·#13 | T8 |
| 03#7·#14 | T6 |
| 03#8 | T7 |
| 03#9 | T4 |
| 03#11·#15 | T0 |
| 03#10 | 8절 |
| 04T1 | T2(제목 언어), T1(통화 표시). 통화 규칙은 9절 |
| 04T2·T9 | T5(T9의 스켈레톤은 T2·T1) |
| 04T3 | T2 |
| 04T4·T11 | T1 |
| 04T5·T6 | T7 |
| 04T7·T8·T10 | T6 |
| 04T12 | T10(판매 폼), T9(FAQ) |

## 7. 웨이브가 끝날 때 메인이 하는 일

| 시점 | 일 |
|---|---|
| 1차 끝 | DB 테스트 전체 실행. 테스트 모드 결제→환불 1회. 390·1440 ko·ja 캡처를 `docs/aaa/shots/after-w1-*`로 남긴다. `HANDOFF.md`·`index.md` 갱신 |
| 2차 시작 전 | 2차 준비 커밋(`langAlternates`). 1차에서 미룬 계약 필드 보충 |
| 2차 끝 | visual 판정(04의 TOP 12를 전후 캡처로 비교). 토큰 옛 이름 일괄 치환(`tomo-coral`→`accent` 85곳, `TomoSymbol`·`HeartGauge` 이름)을 단독 커밋으로 한다. `PRODUCT.md`·`DESIGN.md`·`HANDOFF.md` 시작 프롬프트의 Vercel 서술을 고친다 |

## 8. 이번에 일부러 안 하는 것

| 항목 | 이유 |
|---|---|
| 언어별 주소(`/ko`·`/ja`)로 바꿔 전 페이지 정적화 | 주소가 바뀌면 색인·공유 링크·결제 복귀 주소·OAuth 콜백이 한꺼번에 흔들린다. 11/26에 복귀 주소 사고(0.0.0.0)를 막 고쳤다. T5의 「레이아웃에서 DB 호출 제거」로 체감 속도를 먼저 얻는다 |
| next/image 최적화 서버 | 이미지 변환이 에어쉽과 같이 쓰는 서버의 CPU·메모리를 쓴다. 원본이 외부 마켓 CDN이라 허용 호스트 관리도 사고 지점이다. 지연 로딩·크기 속성·첫 화면 장수 제한으로 간다 |
| CSP 강제 전환 | 결제창·카드사 인증 도메인이 넓다. 잘못 막으면 결제가 멈춘다. T0가 위반을 2주 모은 뒤 따로 판단한다 |
| 크론이 필요한 기능(키워드 매물 알림 02#13, 품절 재입고 알림, 자동 구매확정, 시세 통계 적재·시세 SEO 페이지 03#10, 브리핑) | tomo에 예약 실행 기반이 없다. 실패를 알 수단(T0)이 먼저다. 조용히 멈춘 예약 작업은 돈·알림 누락으로 이어진다 |
| AI 검색 구제(02#3)·명품 위험 AI(02#12)·사진 검색 | 호출 비용 상한과 캐시가 먼저다. 이번에는 상한(T3)만 만든다. 위험 판정이 틀리면 고객에게 잘못된 안심을 준다 |
| 야후옥션 입찰 대행 | 낙찰·송금이 얽힌 돈 경로다. 「구경만」 표식으로 살 수 없음을 분명히 하는 데서 멈춘다(T2) |
| 국내 상품 시드(가짜·대리 매물) 등록 | 살 수 없는 매물은 고객 혼란이다. 빈 상태를 해외 인기 줄과 등록 유도로 채운다(T6) |
| 키라 포일·에어쉽 디자인 전면 이식, 브랜드 재설계 | tomo는 v3 「정제된 마켓」 방향이 정해져 있다. 원칙(그림자 절제·배지 1개·대비)만 가져온다 |
| 정책·FAQ·가이드 DB화(01#11 일부), 블로그 CMS | 약관·환불 문구는 결제 화면·AI 상담 지식과 한 벌이다. 코드에 두면 배포 이력으로 추적된다 |
| 웹푸시 실구독 검증·디스패처(01#15 일부) | 기기 실측이 필요하다. 알림함(0027)이 이미 대신한다 |
| 저장소형 레이트리밋(Upstash 등) | 서버가 1대라 메모리 카운터가 정확하다. 서버를 늘릴 때 한다 |
| DB 백업 자동화 | 무료 요금제에는 자동 백업 기능이 없다. 요금제·보관 위치가 정해져야 한다. T0 스모크가 정지는 알린다 |
| 운영 실결제 시험 | 돈이 움직인다. Ren 승인 뒤에만 한다(9절) |

## 9. Ren이 정할 것 (기본값이 있어 작업은 멈추지 않는다)

| # | 정할 것 | 추천(기본값) | 정하지 않으면 |
|---|---|---|---|
| 1 | 국경 간 직거래의 국제배송비를 받을지, 얼마로 받을지 | 대행과 같은 표(`lib/fees.ts`)로 서버가 계산해 받는다. 지금은 구매자 화면이 보낸 값(기본 0원)을 그대로 쓴다 | T4는 서버 고정 0원으로 두고 화면 값만 무시한다(지금과 금액은 같고 변조만 막힌다) |
| 2 | 로그인 사용자의 표시 통화 | 거주국 기준을 유지한다(결제 통화와 같다). 화면 언어와 다르면 통화 표시를 붙인다 | 추천대로 간다 |
| 3 | 운영 실결제 1회 시험(소액 결제 뒤 환불) | T4 병합 직후에 한다 | 테스트 모드 확인까지만 하고 운영 결제는 미검증으로 적는다 |

준비물(결정 아님): 텔레그램 운영 알림용 env 2개(`OPS_TELEGRAM_BOT_TOKEN`·`OPS_TELEGRAM_CHAT_ID`)를 Coolify `tomo-image`와 Actions 비밀값에 넣는다. 없으면 T0 알림은 조용히 건너뛰고 어드민 화면에만 남는다.
