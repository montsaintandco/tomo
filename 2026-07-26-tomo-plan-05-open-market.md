# TOMO Plan 05 — 오픈 마켓 전환 (공개 브라우징 + 구매대행 + 3루트) Implementation Plan

> **For agentic workers:** superpowers:subagent-driven-development 또는 executing-plans로 태스크 단위 실행. 체크박스로 추적.

**Goal:** TOMO를 "로그인해야 보이는 앱"에서 "누구나 둘러보는 오픈 마켓"으로 전환한다. 상대국 중고마켓(메루카리·야후플리마켓, 이후 당근·중고나라) 상품을 파싱해 피드에 노출하고, 구매 루트를 3종으로 확장한다: ① 상대국 마켓 구매대행 ② 자체 등록 판매(기존 에스크로) ③ 여행 직거래. UI/UX는 메루카리·당근마켓 참조(taste-skill로 AI 티 제거). 참고 구현: `C:\dev\tokyobuy\tokyobuy` (메루카리 DPoP 클라이언트, 야후 파서, 대행요청 플로우, 어드민 패턴).

**구매 루트 3종 (제품 정의):**
1. **구매대행** — 외부 마켓 상품 → "대행 신청" → 어드민 견적(대행수수료+국제배송비) → 고객 승인 → 결제 → 센터 경유 배송. tokyobuy `convert_proxy_to_order` 패턴 참조
2. **직접 판매** — 유저가 TOMO에 직접 등록·판매 (Plan 02~04 완성분 그대로)
3. **여행 직거래** — 상대국 여행 시 직거래. listings `trade_method=direct` + 크로스보더 노출 + "여행 직거래 가능" 배지·필터. 만남 조율은 기존 채팅

## Global Constraints

- 파싱 소스 현실: 메루카리(비공식 DPoP API)·야후플리마켓은 tokyobuy 검증 코드 이식으로 실작동. 당근마켓·중고나라는 공개 API 없음+봇차단 → 동일 스키마의 소스로 등록만 하고 "연동 준비 중"(어드민 수동 등록/CSV로 대체). 비공식 API 리스크는 코드 주석+HANDOFF에 명시
- 외부 상품은 우리 DB에 스냅샷 캐시(`external_items`), 조회 시 재파싱 없음. 상세 진입 시에만 온디맨드 리프레시(가격·품절 확인)
- 공개 페이지: `/`, `/listings/*`, `/global/*`(외부상품), `/search`, `/profile/[id]`. 보호: `/sell`, `/chat*`, `/transactions*`, `/admin*`, `/onboarding`, 대행 신청
- 게스트 뷰어: 프로필 없이도 피드·상세 렌더 (기본 KR/ko/KRW, 언어 토글은 이후). 로그인 필요 액션은 `/login?next=` 리다이렉트
- 기존 보안 원칙 유지: API 자체인증, 상태전이 SECURITY DEFINER, RLS
- UI 개편은 taste-skill(redesign-skill) 적용. 브랜드 토큰(토모 블루/핑크/코랄/아이보리) 유지하되 메루카리(그리드·정보밀도·CTA)·당근(피드 온도·지역감) 문법 차용
- 저장소 = 마운트 tomo 폴더, 빌드는 /tmp/build/tomo, 커밋은 마운트에서

---

### Task 1: 공개 브라우징 (로그인 장벽 제거)

**Files:** `middleware.ts`, `lib/listings.ts`(게스트 뷰어), `app/page.tsx`, `app/listings/[id]/page.tsx`, `app/profile/[id]/page.tsx`, `components/BottomNav.tsx`, `components/ChatButton.tsx`·`CheckoutButton.tsx`(게스트→로그인 유도)

- [ ] 미들웨어: 공개 경로 통과(`/`, `/listings`, `/global`, `/search`, `/profile`), 보호 경로만 `/login?next=` 리다이렉트. 로그인 상태+프로필 없음 → onboarding 유지
- [ ] `getViewerOrGuest()`: viewer 없으면 `{ id:null, country:"KR", language:"ko", currency:"KRW", rate, isAdmin:false, guest:true }`
- [ ] 홈·상세·프로필 게스트 렌더. "내 동네" 탭은 게스트에게 로그인 유도 카드
- [ ] 게스트가 채팅/결제/판매 클릭 → `/login?next=현재경로`. 로그인 페이지 `next` 지원
- [ ] 빌드 + 게스트/로그인 두 상태 검증 + 커밋

### Task 2: 외부 마켓 스키마 + 메루카리·야후 파서 이식

**Files:** `supabase/migrations/0011_external_items.sql`, `lib/market/mercari.ts`, `lib/market/yahoo.ts`, `lib/market/types.ts`, `app/api/global/search/route.ts`

- [ ] `external_items` 테이블: source(`mercari|yahoo_flea|daangn|joongna`), source_id, url, title, title_translated, price, currency, images, seller_name, status(`active|sold|stale`), raw jsonb, fetched_at. UNIQUE(source, source_id). 공개 SELECT RLS
- [ ] tokyobuy `lib/mercari-server.ts`(DPoP)·`yahoo-server.ts` 이식 (검색+상세). `lib/http.ts` fetchWithRetry 포함
- [ ] `/api/global/search?q=&source=` — 서버 파싱→`external_items` upsert→반환 (검색어 ko→ja 번역은 기존 translate 활용)
- [ ] 당근·중고나라: source enum에 예약 + 어드민 수동 등록 폼(Task 6)으로 커버. 파서 스텁에 사유 주석
- [ ] 파서 단위 테스트(모킹) + 빌드 + 커밋

### Task 3: 해외직구 피드 `/global` + 외부 상품 상세

**Files:** `app/global/page.tsx`, `app/global/[source]/[id]/page.tsx`, `components/ExternalItemCard.tsx`

- [ ] `/global`: 소스 탭(전체·메루카리·야후플리·당근 준비중·중고나라 준비중) + 검색(자동 번역) + 무한스크롤 아님(페이지네이션). 캐시된 external_items + 실시간 검색 혼합
- [ ] 외부 상세: 이미지·번역 제목/설명·원가+환산가+**예상 대행 총액**(상품가+대행수수료+국제배송 예상) 표기, "대행 신청" CTA(게스트→로그인). 온디맨드 리프레시로 품절 반영
- [ ] 홈 "해외직구" 탭을 `/global`로 연결(자체 크로스보더 상품과 외부 상품 통합 노출)
- [ ] 빌드 + 커밋

### Task 4: 구매대행 신청 플로우 (proxy_requests)

**Files:** `supabase/migrations/0012_proxy_requests.sql`, `app/api/proxy/route.ts`, `app/proxy/[id]/page.tsx`, 마이페이지 연동

- [ ] `proxy_requests`: user_id, external_item_id, status(`requested|quoted|approved|paid|purchasing|center_received|shipped_international|delivered|completed|cancelled`), quote 필드(대행수수료·국제배송비·합계), 운송장. 상태전이 SECURITY DEFINER 함수(주체 검증: 고객은 approve/cancel/수령확인, admin은 견적·진행). tokyobuy 플로우 참조
- [ ] 신청 API(로그인 필수) + 내 대행 목록·상세(타임라인 — EscrowTimeline 패턴 재사용)
- [ ] 결제는 기존 Stripe 체크아웃 재사용(키 대기 시 503) — 대행 견적 승인 후 결제 항목 생성
- [ ] RLS·전이 테스트 + 빌드 + 커밋

### Task 5: UI/UX 개편 (메루카리·당근 문법, taste-skill)

**Files:** 전 페이지 점진 + `app/layout.tsx`, `globals.css`, 컴포넌트

- [ ] taste-skill:redesign-skill 적용해 개편: 홈=당근식 세로 피드+온도·지역, 글로벌=메루카리식 3열 밀집 그리드+가격 오버레이, 상세=메루카리식 정보 블록+고정 CTA 바, 폰트 복원(Cafe24 써라운드/M PLUS Rounded — Vercel 빌드는 fetch 정상)
- [ ] 홈 상단: 검색 + 카테고리 칩 + "구매 루트 3종" 안내 배너(대행/직구/여행직거래)
- [ ] AI 티 제거 체크: 균일 라운드·보라 그라데이션·lorem 금지, 실데이터 밀도
- [ ] 빌드 + 스크린샷 검증 + 커밋

### Task 6: 마이페이지 + 어드민 확장

**Files:** `app/mypage/page.tsx`(또는 /profile/me 개편), `app/admin/page.tsx`, `app/admin/proxy/page.tsx`, `app/admin/external/page.tsx`

- [ ] 마이페이지: 프로필 카드(하트게이지) + 구매(에스크로 거래) + 판매 + **대행 신청 내역** + 후기 탭. tokyobuy mypage 패턴
- [ ] 어드민 홈: 대시보드(신규 대행 신청·입고 대기·미결 견적 카운트) + 기존 `/admin/center` 링크
- [ ] `/admin/proxy`: 대행 신청 큐 — 견적 입력→발송, 상태 진행. `/admin/external`: 외부 상품 수동 등록(당근·중고나라 커버)
- [ ] admin RLS 확장(proxy_requests admin SELECT/전이) + 테스트 + 커밋

### Task 7: 통합 검증 + 문서

- [ ] 전체 vitest + 빌드, 게스트/유저/어드민 3역할 수동 E2E(브라우저), HANDOFF·progress 갱신, Vercel 자동배포 확인

## Self-Review

- 유저 요구 커버: 첫화면 공개(T1), 4개 마켓 파싱(T2 — 일본 2종 실작동, 한국 2종 구조+수동), 루트 3종(T3·T4·기존), 메루카리/당근 UI(T5), 마이·어드민(T6)
- 리스크: 메루카리 비공식 API 차단 가능(재시도+온디맨드 캐시로 완화, 차단 시 피드는 캐시로 유지), Vercel 서버리스에서 DPoP OK(WebCrypto), 당근/중고나라는 정식 연동 전까지 수동
- 기존 자산 재사용: 에스크로 상태머신·채팅·번역·환율·타임라인 컴포넌트 전부 그대로
