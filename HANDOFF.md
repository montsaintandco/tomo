# TOMO 프로젝트 핸드오프 (2026-09-04, 하이브리드 PWA + 거래·탐색·대행·관리 팩 반영)

한일 크로스보더 중고거래 플랫폼. Plan 01(기반)·02(상품)·03(채팅)·04(에스크로, Stripe 키 대기)·05(오픈마켓: 외부마켓 검색·대행구매) 완료 상태.

## 재개 방법 (다른 컴퓨터에서)

```bash
git clone https://github.com/montsaintandco/tomo.git   # 이미 있으면: git pull
cd tomo
npm install
npm run dev   # http://localhost:3000
npm test      # vitest 70개 통과해야 정상 (라이브 Supabase라 첫 실행 JWT 시계 오차로 1~2개 튀면 재실행)
```

`.env.local`은 gitignore라 직접 생성 (둘 다 공개값 — anon key는 RLS로 보호됨):

```
NEXT_PUBLIC_SUPABASE_URL=https://zftztnkczlblnkgaijzc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase 대시보드 → Project Settings → API>
```

- Node 20+ 필요 (Next 16). `.env.local` 없으면 `next build`가 /onboarding 프리렌더에서 실패한다.
- 푸시 권한: 레포 소유자는 `montsaintandco`. `gh auth status`로 활성 계정 확인, 아니면 `gh auth switch --user montsaintandco`. master 푸시 = Vercel 자동 배포(https://tomo-montsaintandcos-projects.vercel.app).
- 여러 세션을 병행하면 시작 전 반드시 `git pull` — 2026-09-03에 두 세션이 갈라져 10개 파일 충돌을 수동 병합했다.
- 스킬(Emil Kowalski `emilkowalski/skills` 12종: animate·review-animations·improve-animations·apple-design 등)은 `.agents/skills/`에 커밋돼 있고 `skills-lock.json`이 버전을 고정. 새 머신에서 `npx skills@latest add emilkowalski/skills`로 `.claude/skills` 심링크를 다시 만든다(gitignore). 모션 감사 결과와 적용 상태는 `plans/001-motion-audit.md`.
- Claude Code 플러그인(impeccable·superpowers·ponytail·claude-seo)은 머신별 설치라 새 컴퓨터엔 없을 수 있음. 없어도 코드 작업엔 지장 없고, 디자인 라운드를 돌릴 때만 impeccable을 다시 설치하면 된다. `.impeccable/`(config·크리틱 스냅샷·라이브 설정)은 레포에 포함돼 있다.

**새 세션 시작 프롬프트 (그대로 붙여넣기)**

> TOMO 프로젝트 이어서. HANDOFF.md 읽고 진행. 최근 상태(2026-09-04): Next 16, v2 재디자인 완료, 하이브리드 PWA(브라우저=상단 GNB 웹사이트, 홈화면 설치=탭바 앱, tailwind `standalone:` 변형), 상세는 메루카리 골격, 당근·메루카리·SAZO 흡수 3팩(가격제안·끌올·카운터·나눔·카테고리·URL 붙여넣기 대행) + 관리 팩(마이페이지 전면 컨트롤·어드민 분쟁/상품/사용자/환율) 배포됨, 마이그레이션 0021까지 DB 적용, vitest 71. 사줘식 장바구니·주문·결제(카트→주문서→Stripe 1회 결제) 반영됨. 시작 전 `git pull` + `npm test`로 기준 확인. 남은 로드맵: 토스페이먼츠 키 투입·라이브 테스트·커스텀 도메인·폰트 셀프호스팅·채팅 이미지/알림·auth 계정 완전 삭제(service_role). 결정 원칙: 한국 구매자 우선·브랜드 유지·11px 하한·마이그레이션은 대시보드 SQL(에디터는 전체가 한 트랜잭션).

## 2026-09-03 세션 반영

- **Next 14 → 16.3.3 / React 19 / ESLint 9(flat config)**, `npm audit` 0건. `middleware.ts` → `proxy.ts`. 린트는 `npm run lint`(= `eslint .`).
- **홈 = 마켓 허브** (`app/page.tsx` 파라미터 없을 때 → `components/HomeHub.tsx`): 신뢰 스트립 → 상대국 인기 캐러셀(`lib/market/trending.ts`, 큐레이션 키워드 `trending-data.ts`, `unstable_cache` 1h, 소스별 4초 타임아웃, DB 쓰기 없음) → 국내 2열 그리드 → 여행 직거래 → 푸터(사업자 정보 "준비 중" 플레이스홀더 — 값 주면 채움). `?q=`/`?tab=`은 기존 리스트 모드.
- **양방향 홈**: 게스트 언어 판정(`lib/locale.ts`: 쿠키 `tomo_lang` → Accept-Language), KR/JP 말풍선 토글(`LangToggle`), UI 사전 `lib/i18n.ts`(ko/ja, 테스트로 완전성 검사), 허브에 "상대국 친구들이 찾는 것" 팔기 섹션(큐레이션 테이블 반전). 로그인 사용자는 토글로 UI 언어만 변경(나라·통화는 프로필).
- **DESIGN.md v2**: 브랜드 유지, 흰 페이지, 아이보리는 틴트만, 라운드 12/10, Pretendard 11–17px 램프. Pretendard CDN 경로가 404였던 걸 npm 미러로 교체(런칭 전 셀프호스팅 권장).
- impeccable: PRODUCT.md schema 1, 크리틱 스냅샷 `.impeccable/critique/`, 라이브 모드 설정됨. 설계 문서 `docs/superpowers/specs/`, 계획 `docs/superpowers/plans/`.
- **SP2 완료(2026-09-03)**: 상품 상세·/global·외부상품 상세를 v2 토큰 + `t(lang, key)`로 재디자인 (스펙 `docs/superpowers/specs/2026-09-03-sp2-commerce-v2-design.md`, 계획 `docs/superpowers/plans/2026-09-03-sp2-commerce-v2.md`). 가격은 구매자 통화 17px/800, 안내는 navy/5 웰, 브리지는 여행 뱃지만, 써라운드는 워드마크만(HeartGauge 숫자도 Pretendard). 공유 버튼(`ChatButton`·`CheckoutButton`·`ProxyRequestButton`·`OriginalToggle`·`HeartGauge`)은 `lang` 프롭. i18n 키 `detail.*`/`global.*`/`source.*`/`ext.*`/`center.*` 추가(vitest 47).
- **SP3·SP4 완료(2026-09-03)**: 채팅·거래·대행·프로필·마이페이지(SP3), 로그인·온보딩·판매 폼·어드민(SP4)까지 v2 토큰 + 사전 적용 완료 — **앱 전체 재디자인 4개 스프린트 종료**. 스펙 `docs/superpowers/specs/2026-09-03-sp3-sp4-v2-design.md`. 운영자 화면은 한국어 고정(결정). 폼은 `LoginForm`/`OnboardingForm`/`SellForm` 클라이언트 + 서버 래퍼(`lang`, `/sell?hint=` 프리필). 온보딩 기본 나라·언어는 뷰어 언어, 완료 시 `tomo_lang` 쿠키 동기화. 타임라인 `StepList` 공유(네이비 완료/코랄딥 현재).
- **하이브리드 PWA(2026-09-04)**: 브라우저=웹사이트 문법(모든 페이지 상단 GNB `SiteHeader`, 탭바 없음, 브라우저 뒤로가기), 홈 화면 설치=standalone 앱 문법(하단 `BottomNav`, 가짜 뒤로가기, 2단 바). 분기는 tailwind `standalone:`/`browser:` 변형(`display-mode` 미디어쿼리) 한 곳. `app/manifest.ts` + `public/icon-*.png`(스펙 아이콘: 투톤 대각+흰 하트, `public/icon.svg`에서 렌더). 페이지별 `<title>`/OG는 `metadata`·`generateMetadata`.
- **우리만의 무기 3종(2026-09-05, 0021)**: ① 크로스리스팅 — `/sell?from=<메루카리·야후·당근·중고나라 URL>`이 기존 파서(`lib/market/item.ts` loadItem)로 제목·설명·가격·사진을 프리필(사진은 원본 링크 핫링크, 통화 다르면 가격 비움). ② 여행 직거래 심화 — `trips` 테이블(본인만 읽기, 판매자는 `travelers_to` 개수만), `/travel`(일정 등록→그 동네 직거래 상품), 상세에 내 여행 매칭 문구, **만남 거래**(`transactions.meetup`, `start_transaction(p_listing_id, p_intl_shipping_fee, p_meetup)`, 상태머신 paid→delivered(구매자 만나서 수령)→completed, 센터·국제배송 없음), 직거래 상품은 "만나서 거래(선결제)"가 기본 버튼. ③ 신뢰 지표 — `seller_stats(uid)`(완료 거래·해외/만남 거래·최근 90일 응답률) 상세 판매자 카드·프로필 칩. vitest 71(캐시 24h 넘으면 cart 주문 테스트 1건 skip — /global에서 상품 열어 갱신).
- **v3 리브랜드 "정제된 마켓"(2026-09-05)**: 카와이 시그니처 전부 폐기(파스텔 나라색·하트-O·두 말풍선·써라운드·말풍선 꼬리·하트 게이지·스쿼시/하트비트). 토큰 클래스명은 유지하고 값만 교체(`tailwind.config.ts`: navy=#111827 잉크, coral-deep=#1D4ED8 단일 액센트, rose=#DC2626, ivory=#F5F5F7, blue/pink=중립 필), `globals.css` 폰트페이스·섀도우·칩·브리지 정리, `Brand.tsx`(텍스트 워드마크·중립 글리프·텍스트 칩), `HeartGauge`(바), 채팅 말풍선은 나/상대 구분, 온보딩 나라 버튼 검정 활성, 아이콘 v3(블루 T). DESIGN.md v3·PRODUCT.md 갱신. 모션 감사(Emil Kowalski)·Apple 기준은 `plans/001-motion-audit.md`.
- **홈 히어로 v2(2026-09-05)**: 검색이 히어로(에어비앤비식). `HomeHub.tsx` `HomeHero` — 한 줄 헤드라인 + 큰 검색/URL 붙여넣기 폼(`/global?q=`, 데스크톱만 — 모바일은 헤더 검색창이 바로 위라 숨김) + 인기 검색어 링크(큐레이션 테마) + 테마 타일 4장(대표 사진·테마명·뷰어 통화 최저가, 탭하면 테마 검색). 로그인·게스트 공통. 사진 3장 모자이크 v1은 폐기(랜덤·저화질·의미 없음). i18n `hero.searchPlaceholder/search/trendingKw/from`.
- **서체 교체(2026-09-05)**: Pretendard CDN → Noto Sans KR/JP `next/font/google` 셀프호스팅(`app/layout.tsx` `--font-kr/--font-jp`, `html[lang=ja]` 분기). 굵기 400/600/700 세 단 — `tailwind.config.ts` fontWeight 리매핑(bold=600, extrabold=700, black=700)으로 클래스 수정 없이 전체 적용. 한글 `keep-all`, h1/h2 자간 -0.015em. 히어로 타일 최저가 0원 제외.
- **출처 로고(2026-09-05)**: 사조식 — 카드 좌상단 텍스트 뱃지 → 마켓 아이콘(`components/SourceLogo.tsx`, `public/logos/{mercari,yahoo_auction,daangn,joongna}.png` = 각 사이트 파비콘 원본). 상세 뱃지·해외직구 소스 탭은 로고+이름. 이름은 alt/title로 유지.
- **외부 상품 상세 번역(2026-09-05)**: `app/global/[source]/[id]/page.tsx` — 라이브 파싱분은 제목·설명·상태·카테고리·거래 태그를 뷰어 언어로 일괄 번역(`translateTexts`, `unstable_cache` 키 `ext-tr/v2/source/id/lang`, 1h). 기존 `OriginalToggle`로 원문/번역 토글(가격·배송 블록은 `between`). 실패 시 원문 + "번역 준비 중". 캐시 폴백(어드민 등록분)은 title_translated 그대로.
- **이동 후 로딩(2026-09-05)**: 라우트 `loading.tsx` 도입 — `app/loading.tsx`(피드 그리드, 전 라우트 기본), `app/global/[source]/[id]`·`app/listings/[id]`(상세 골격), `app/admin`(테이블). 스켈레톤은 `components/Skeletons.tsx`. 클릭 즉시 URL·골격이 바뀌고 데이터는 그 자리에서 스트리밍. 이후 채팅 목록·채팅방·마이페이지·장바구니·거래·주문·대행·프로필·여행(List/Chat), 판매·수정·프로필 편집(Form)까지 17개 라우트 전부 적용.
- **외부 상세 CTA 재배치(2026-09-05)**: 데스크톱은 떠다니는 sticky 카드 폐기 → 가격·배송·총액 표 바로 아래 흐름 배치(메루카리·아마존식), 총액 라벨은 모바일 바에서만. 모바일 고정 바는 safe-area 패딩. `SiteFooter`가 `/listings/*`·`/global/*`에서 하단 여백(pb-20, standalone pb-36)을 줘 푸터가 바 아래 깔리지 않는다. 번역 배치에 상세 표 값(extra)도 포함, 캐시 키 v3.
- **카드 제목 번역(2026-09-05)**: `lib/market/translate-items.ts` `withTranslatedTitles(items, lang)` — 뷰어 언어와 다른 나라 소스의 제목을 한 요청으로 번역(4s 타임아웃, 실패 시 원문). 적용: 해외직구 검색 결과, 상세의 판매자 다른 상품·비슷한 상품. 홈 인기는 기존 trending 캐시 번역. 양방향(ko 뷰어→메루카리 한국어, ja 뷰어→당근·중고나라 일본어) 확인.
- **해외직구 = 상대국 마켓만(2026-09-05)**: `app/global/page.tsx` `sourcesFor(country)` — 한국 뷰어는 메루카리·야후옥션, 일본 뷰어는 당근·중고나라만 탭·검색·캐시 목록에 노출. 내 나라 마켓 상품은 TOMO가 더해줄 게 없어서(대행 불필요) 상세는 참고용으로 격하: 큰 검정 "원본에서 직접 거래하기" → 한 줄 안내 + 작은 아웃라인 "원본에서 보기". `searchMarkets`가 소스 배열을 받는다.
- **외부 상세 정리(2026-09-05)**: 판매자 다른 상품에서 현재 상품·중복 제거(당근은 URL id≠내부 id라 제목·가격으로도), 상품 없으면 섹션 숨김, "원본에서 더 보기" 외부 링크 제거(전환은 우리 상세로). 상품 상태 표는 설명 바로 아래로. 하단 원본 링크는 상대국 상품에서만.
- **검색 필터(2026-09-05, 메루카리 참조)**: `SearchFilters`(min/max 가격·sort rec/new/price_asc/price_desc·cond new/used·sold 포함). 메루카리는 API(itemConditionId·status·priceMin/Max·sort), 야후옥션은 URL(min/max·istatus·s1/o1) 서버 필터, 당근·중고나라는 `applyFilters` 후처리(가격·판매완료·정렬; 상태는 목록 정보 없음). 가격은 뷰어 통화 입력 → `viewer.rate`로 소스 통화 환산. UI는 `<details>` + 네이티브 select, 탭·검색 폼이 필터 파라미터 유지. 카테고리 필터는 마켓별 체계가 달라 키워드로 대신(미구현).
- **결제 Stripe → 토스페이먼츠(2026-09-05, 한국 사업자 결정)**: `lib/toss.ts`(승인 `tossConfirm`·취소 `tossCancel`·KRW 환산 `krwAmount`·orderId `tx_<uuid>`/`po_<uuid>`), `lib/toss-client.ts`(v2 standard SDK 동적 로드, `payWithToss`; 카카오/네이버페이는 `card.easyPay` DIRECT). `/api/checkout`·`/api/order`는 결제창 파라미터 `{ toss }`를 내려주고, 승인은 `/api/toss/confirm`(성공 리다이렉트 GET: DB 기대 금액 재계산·대조 → 승인 API → `mark_paid`/`mark_proxy_order_paid` 멱등). DB 컬럼 재사용: `stripe_payment_intent_id`=paymentKey, `stripe_session_id`=orderId — 마이그레이션 없음. 실패는 `?pay=fail&code=`로 페이지 복귀(`PayNotice`). 결제 통화는 KRW만: JPY 거래·주문은 `exchange_rates` JPY_KRW로 환산 청구(환율 없으면 503). Stripe 패키지·웹훅 삭제. **환경변수: `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`** (Vercel + .env.local). 토스 개발자센터 테스트 키로 실제 청구 없이 전 흐름 검증 가능. 환불은 `tossCancel` 헬퍼만 있고 분쟁 처리에 아직 연결 안 됨.
- **토스 결제 E2E 검증 완료(2026-09-05)**: 프로덕션에서 안전결제 → 결제창(카드) → 승인 라우트 → `paid`·상품 `sold`까지 확인(거래 30d2631d, ¥1,800→16,200원). Vercel production/preview에 `TOSS_CLIENT_KEY`/`TOSS_SECRET_KEY`(문서용 공개 테스트 키) 등록됨 — 라이브 전환 시 본인 키로 교체. 결제 대기 거래 재결제 버튼(`PayTxButton`) 추가. 테스트 시 임의 카드번호는 카드사 창이 BIN 검사로 거절 → 실제 카드(청구 없음) 또는 카카오페이 사용. 브라우저 자동화는 토스 결제창(크로스 오리진 iframe)에 클릭이 안 들어가 결제창 안은 사람이 눌러야 한다.
- **지원 봇(2026-09-05, 사조 채널톡 봇 구조 적용)**: `lib/support-tree.ts`(ko/ja 스크립트 트리: 인사+배송 소요 안내 → 대분류 주문 전/주문 후/판매/여행 → 질문 → 답변 문단 + 바로가기 링크 + "추가 질문?" + 관련 질문·상담원 연결(/chat)·이전·처음), `components/SupportBot.tsx`(말풍선 UI, LLM·서버 없음), `SupportLauncher.tsx`(우하단 플로팅 "문의" → 모바일 바텀시트/데스크톱 우하단 400px 패널; 로그인·온보딩·어드민·고객센터·채팅방에서 숨김), 고객센터 첫 화면에 인라인. 운영시간 같은 미확정 정보는 넣지 않음. 답변 수정은 트리 파일만.
- **상담원 연결 = 문의 티켓(2026-09-05)**: 사조를 눌러 보니 "상담원 연결"은 바로 사람이 아니라 폼(상품 URL*·옵션·수량·문의 내용*) → 접수. 같은 구조로 `support_tickets`(**마이그레이션 0022, 적용 필요**), `/api/support`(POST, RLS user_id=auth.uid()), 봇 폼 카드(주문 전: URL·옵션·수량 / 주문 후: 주문번호 / 판매·여행: 내용만; 게스트는 로그인 안내), 마이페이지 "문의" 섹션(상태·답변 표시), 어드민 `/admin/support`(답변 1회 → answered, 닫기; 내비 카운트 = open). 고객센터의 "채팅으로 문의" 버튼 제거(대화 테이블은 상품 필수라 지원용으로 못 씀).
- **문의 패널 = 미니 메신저(2026-09-06, 사조 채널톡 첫 화면 구조)**: `SupportLauncher`가 홈/대화/설정 3탭. 홈 = 브랜드 커버·봇 인사 미리보기·큰 "문의하기" CTA(→ 봇 채팅, 헤더 뒤로가기) / 대화 = 내 문의 목록(`GET /api/support/tickets`, 상태·답변 미리보기) + 새 문의 / 설정 = 연락처 정보(프로필 편집 링크)·언어 KR/JP(쿠키 + refresh)·채팅 알림(PushToggle, 로그인 시). 운영시간은 정해진 게 없어 표기 안 함. 데스크톱 400×600 패널, 모바일 바텀시트.
- **토스 심사 준비(2026-09-06)**: `docs/toss-review-checklist.md`가 기준 문서. 사업자 정보는 `lib/company.ts`(env `NEXT_PUBLIC_COMPANY_*`, `.env.example` 참고)에서 읽어 푸터·약관·고객센터에 표시(비면 "준비 중"). 약관류 `/terms` `/privacy` `/refund`(`LegalDoc`, ko/ja, 회사값 치환). 상세·외부 상세·주문서에 `PolicyNote`(배송 업체·기간·취소·반품 방법·주소·비용). 주문서에 필수 동의 체크(약관·개인정보·환불). 고객센터에 전화·이메일·운영시간 블록. 남은 건 사용자 몫: env 값 채우기, 통신판매업 신고, 토스 가입·서류, 심사용 테스트 계정, 라이브 키 교체.
- **출시 전 전수 점검(2026-09-07)** — 보안·성능·SEO·UI 4개 감사(에이전트) 후 적용:
  - 보안: 테스트 계정 비번 교체(`TEST_PASSWORD` env, git 밖), 오픈 리다이렉트(`//evil`) 차단, 보안 헤더(HSTS·XFO·nosniff·Referrer·Permissions + CSP Report-Only, `next.config.mjs`), 레이트리밋 `lib/ratelimit.ts`(공개 검색·시세 IP당, 로그인 API 사용자당), 외부 상품 id 정규식·스냅샷 URL은 `parseMarketUrl` 일치 필수·이미지 https만, 상품 이미지는 우리 스토리지 URL만, 토스 리다이렉트 origin `NEXT_PUBLIC_SITE_URL`, **마이그레이션 0023(적용 필요)**: listings 컬럼 단위 update 권한 + with check, `push_targets_for`(service_role)로 푸시 키 노출 차단(`lib/push.ts` 폴백 있음).
  - 성능: `SupportLauncher`에서 봇·PushToggle 동적 import(전 페이지 supabase-js 242KB 제거), 메루카리 `unstable_cache`(DPoP 때문에 fetch 캐시 0%였음), 검색어 번역 24h 캐시, 제목 번역 타임아웃 2.5s, 외부 상세 병렬화, `createServerSupabase` React cache, 미들웨어 profiles 조회는 보호 경로만, 홈 히어로 헤드라인·검색 즉시 렌더(타일만 Suspense), 업로드 클라이언트 리사이즈 `lib/image-resize.ts`(긴 변 1600 JPEG), Geist 폰트 삭제.
  - SEO/마케팅: `lib/site.ts` SITE_URL(기본 tomo-delta.vercel.app — `-projects` URL은 Vercel이 noindex), `metadataBase`·canonical·twitter card·아이콘, `app/robots.ts`·`app/sitemap.ts`(판매중 상품 포함)·`app/opengraph-image.tsx`, 상품 상세 설명/가격 메타 + Product JSON-LD + 봇 조회수 제외, 외부 상세·비공개 페이지 noindex, Organization JSON-LD(사업자 정보 완비 시), Vercel Analytics·Speed Insights, 공유 텍스트 브랜드, 404 한/일.
  - UI/기능: `app/error.tsx`·`global-error.tsx`, `/global` 전용 스켈레톤, 문의 FAB이 상세 구매 바를 안 가리게, 상세 데스크톱 CTA를 가격 아래로, 로그인 화면 홈 링크·약관 동의 문구, 만남 장소 일본어, 헤더 2열 내비 44px, 버튼 600, 이모지 제거(카테고리·사전안내), 매니페스트 배경 흰색, 고객센터 전화 셀은 값 있을 때만, 이미지 없는 외부 캐시 항목 첫 화면 제외.
- **Yahoo!フリマ 별도 소스(2026-09-07)**: 기존 "야후옥션·플리마"는 auctions.yahoo.co.jp만 긁고 있었음 → `yahoo_flea` 소스 신설(`lib/market/yahoo-flea.ts`). 검색은 공개 JSON `paypayfleamarket.yahoo.co.jp/api/v1/search`(sort ranking/openTime/price, priceFrom/To, open=1; 상태는 condition.key로 후처리), 상세는 상품 페이지 `__NEXT_DATA__ initialState.itemsState.items.item`(사진 media, 상태 텍스트, 배송 방법·발송까지·발송지·브랜드 → extra, 좋아요·조회·질문 수, 판매자 평가). 판매자 다른 상품 API 파라미터는 못 찾음(undefined). URL 붙여넣기 `/item/z…` 지원, 로고 `public/logos/yahoo_flea.png`, **마이그레이션 0024(external_items source 제약) 적용 필요** — 적용 전엔 플리마 상품 장바구니·대행 저장이 실패. 상세의 배송·취소·환불 안내(`PolicyNote`)는 접힌 details로 상세 맨 아래로 이동.
- **야후옥션 잠정 중단(2026-09-07, 결정)**: 입찰형 경매는 정액 중고거래인 TOMO와 성격이 달라 `LIVE_SOURCES`에서 제외(파서·타입·로고는 유지 — 재개 시 배열에 `"yahoo_auction"` 한 줄). 탭·검색·URL 상세·트렌딩(DB 큐레이션도 `{mercari,yahoo_flea}`로 갱신)·FAQ·봇·약관 문구에서 제거. 기존 캐시된 옥션 상품 상세는 캐시 폴백으로만 열림.
- **홈 빈 상태(2026-09-07)**: 허브의 "토모에서 바로 거래"·"여행 가서 직거래"는 사진 있는 상품만 조회(`app/page.tsx` `.not("images","eq","{}")` — 시드·테스트 상품은 리스트 모드에만). 0건이면 빈 그리드·심볼 대신 한 줄 초대 카드: 국내는 "첫 상품을 기다리고 있어요 → 판매하기", 여행은 "{상대국} 여행 계획이 있나요? → 여행 일정 등록"(차별점은 계속 노출). 실제 상품이 들어오면 자동으로 그리드로.
  - 남은 것(사용자): 0023·0024 SQL 적용, 커스텀 도메인 연결 후 `NEXT_PUBLIC_SITE_URL` 교체, 시드 데모 상품(alice/bob, 이미지 없음) 정리 — 테스트가 bob 상품을 쓰므로 hidden 처리 권장, CSP Report-Only 위반 로그 확인 후 강제 전환.
- **어드민 재설계(2026-09-05, Linear 참조)**: `app/admin/layout.tsx`가 권한 가드 + 셸(사이드바 `components/admin/AdminNav.tsx`, 처리 필요 카운트 배지). 프리미티브 `components/admin/ui.tsx`(PageHeader·Panel·Table·Pill·Kpi·FilterTabs·Thumb·Avatar·상태 메타). 토큰은 `globals.css` `.admin` 스코프(중립 회색·1px 헤어라인·13px·6px 라운드) — 재사용 클라이언트 폼(견적·환율·큐레이션·토글)은 `.admin` 오버라이드로 도구 문법이 됨. /admin에서는 GNB·푸터·탭바 숨김. 페이지: 대시보드(KPI 6 + 인박스), 거래(신규, 상태 필터), 분쟁(펼쳐서 처리), 대행 요청(필터·펼쳐서 견적/전이), 주문(신규, proxy_orders), 센터(행에서 입고/발송), 상품, 사용자, 외부 상품(+수동 등록 패널), 큐레이션, 후기(신규, 삭제), 환율. 운영 화면은 한국어 고정.
- **SEO 감사·수정(2026-09-08)**: `claude-seo` 전수 감사(Health 52/100, 보고서는 세션 스크래치패드 — 요지: canonical·타이틀 중복·메타 동일·hreflang 부재·구매대행 랜딩 부재). Phase 1 완료: 루트 canonical 제거→페이지별 `alternates.canonical`, 타이틀 `| TOMO` 이중 접미사 제거, 정적 9페이지 description, 배송 기간 10~18일 통일. Phase 2 완료: `/guide` 구매대행 랜딩(수수료표·4단계·차별점·FAQ, FAQPage+HowTo JSON-LD, GNB·푸터·sitemap 등록), `/help` FAQPage JSON-LD + h3 질문 헤딩, `/llms.txt`. Phase 2b 완료: **hreflang** — `?lang=ko|ja` URL 변형(proxy.ts가 `x-tomo-lang` 헤더로 전달, `lib/locale.ts` 최우선) + `lib/seo.ts pageMeta()`로 정적 페이지 canonical(변형별)·`alternates.languages`·og:locale, sitemap에 ja 변형 등록. **IndexNow** — `lib/indexnow.ts` + `public/<KEY>.txt`, 상품 등록 시 핑. **/global CLS 0.30** — Lighthouse가 footer.mt-auto 이동을 지목 → 결과 영역 `min-h-[70dvh]`. 홈 Organization JSON-LD는 `companyComplete`에서 phone 제외로 프로덕션 출력 확인(전화는 있으면 contactPoint에 포함). 홈 모바일 LCP: 실브라우저 로드는 TTFB 90ms·load 0.9s로 빠르고 Lighthouse 11.5s는 스로틀 시뮬레이션에서 외부 마켓 CDN 썸네일이 늦게 오는 것 — `static.mercdn.net`·`auc-pctr.c.yimg.jp` preconnect(Link 헤더로 출력) 적용. 추가 개선은 PSI 쿼터 복구 후 재측정해 LCP 요소를 특정한 뒤(후보: 히어로 테마 타일 첫 이미지 → next/image 최적화 또는 셀프 프록시 리사이즈).
- **검색엔진 등록(2026-09-08)**: Google Search Console — 속성 `https://tomo-delta.vercel.app/`(URL 접두어) HTML 태그로 소유 확인 완료(`app/layout.tsx` `metadata.verification.google`), `sitemap.xml` 제출. 네이버 서치어드바이저 — 소유확인 태그도 layout.tsx에 하드코딩(자동화 도구가 naver 도메인 차단이라 등록·사이트맵 제출 클릭은 수동).
- **홈 타일 고정·버그 2건(2026-09-16)**: 인기 검색어·히어로 타일 4종(포켓몬카드·치이카와·중고명품·피규어)을 코드 테이블 `lib/market/trending-data.ts`로 고정 — DB·캐시 무관, 상품 0건이어도 유지. 타일 사진은 `public/hero/<key>.jpg`(1200px, 100~230KB). 버그: ① 닫힌 바텀시트(`dialog.sheet`)가 flex 유틸리티 때문에 레이아웃에 남아 모바일 히어로 타일 탭을 가로챔 → `:not([open]){display:none}`. ② 일본어 홈에 한국어 제목이 그대로 — 번역 실패(null)가 1시간 캐시에 굳던 문제, 실패는 캐시하지 않도록 수정.
- **CSP 리포트 수집(2026-09-18)**: Report-Only였지만 `report-uri`가 없어 위반이 어디에도 안 남고 있었음 → `app/api/csp-report/route.ts`(레이트리밋, `console.warn("csp-violation", …)`) + `next.config.mjs`에 `report-uri /api/csp-report`. 프로덕션 공개 페이지(홈·/global·검색·/guide·/help·/login)는 외부 리소스가 이미지(`https:` 허용)뿐이라 위반 없음 확인. 로컬 dev에서 뜨는 `eval`·`va.vercel-scripts.com/*.debug.js` 위반은 dev 전용 소음(프로덕션은 `/_vercel/insights` 동일 출처). **강제 전환 조건**: 배포 후 프로덕션에서 토스 결제 1회 → Vercel 런타임 로그 `csp-violation` 검색 → 없으면(또는 나온 도메인을 추가한 뒤) 헤더 키를 `Content-Security-Policy`로.
- **마이그레이션 확인(2026-09-18)**: 0023은 적용됨(anon으로 `rpc/push_targets_for` 호출 시 42501 permission denied = 함수 존재·권한 회수 상태). 0024는 외부에서 판별 불가(yahoo_flea 행 0건 — 제약 때문인지 저장 시도가 없었던 건지 모름) → 사용자가 대시보드 SQL로 `0024_yahoo_flea_source.sql` 실행 완료(2026-09-18, 외부 검증은 불가 — 플리마 상품 장바구니 담기가 되면 확정). Supabase MCP 커넥터는 여전히 다른 조직(kirapop·marketing)에 붙어 있어 tomo DB 작업 불가. 홈 LCP: PSI 쿼터 429로 재측정 못 함 — 히어로 타일은 이미 앞 2장 eager+fetchpriority=high, 실측 후에만 손댈 것(후보: `public/hero/*.jpg` 1200→640px).
- 다음 후보: 토스 라이브 전환(`docs/toss-review-checklist.md`), 커스텀 도메인 → `NEXT_PUBLIC_SITE_URL`, 시드 데모 상품 hidden. Stripe는 일본 결제 수요가 생기면.
- 운영자 계정: `tomo.test.center@gmail.com`이 admin. 실계정(mellowdazzle@gmail.com)은 온보딩 후 대시보드 SQL로 `profiles.is_admin=true` 1회 — 이후엔 `/admin/users` 버튼으로 부여. Supabase MCP 커넥터는 다른 조직 계정에 붙는 일이 잦아 DB 작업은 대시보드 SQL이 확실.
- 주의: 저장소 안에 `tomo/`(중복 clone)가 생기면 `tsc`가 같이 컴파일해 실패한다. 2026-09-03에 `C:/dev/tomo-clone-duplicate`로 옮겨 둠 — 필요 없으면 삭제.
- 시드 상품에 `[test]` 접두 2건 남아 있음(의도적 유지). vitest 53개.

## 2026-09-04 (회사 컴) — 채팅 이미지·알림 / 계정 완전 삭제 / 큐레이션 DB화

- **사줘식 장바구니·주문·결제(2026-09-04)**: 외부상품 상세 하단 `장바구니 | 바로 구매`(경매는 기존 입찰 대행). `/cart`(체크·삭제·24h 지난/품절 캐시 자동 제외, 주문 개요 하단 고정/우측 sticky) → `/order?items=`(배송지 프로필 저장·프리필, 결제수단 타일 카드/카카오페이/네이버페이 — JPY는 카드만) → `POST /api/order` → `create_proxy_order`(금액 DB 재계산, 국제배송비 주문당 1회, 수수료 10%) → Stripe Checkout(`payment_method_types`, 미활성이면 카드로 1회 재시도, 세션 ID 저장 실패 시 세션 만료+503) → 웹훅 `mark_proxy_order_paid`(주문·하위 요청 `paid`, 카트 비움). `/order/[id]` 영수증(다시 결제 시 이전 세션 만료/취소). 마이페이지 대행 섹션은 주문 단위 행. 마이그레이션 **0018**(`cart_items`·`proxy_orders`·`proxy_requests.order_id`·`profiles.ship_*`). GNB 카트 아이콘+배지(`tomo:cart` 이벤트로 즉시 갱신). 카카오/네이버페이는 Stripe 한국 계정에서만 활성. 로컬에서 `/api/cart`·`/api/order`는 `SUPABASE_SERVICE_ROLE_KEY` 필요(없으면 503). 스펙 `docs/superpowers/specs/2026-09-04-sazo-cart-checkout-design.md`, 계획 `docs/superpowers/plans/2026-09-04-sazo-cart-checkout.md`. vitest 65.


코드 전부 반영, **마이그레이션 0017 DB 적용 완료**(Supabase MCP로 적용·검증: 테마 11건 시드, 비공개 버킷+정책 3, 함수 3, FK 제거). 내용: `messages.image_path`, 비공개 버킷 `chat-images` + 참여자 RLS, `conversation_reads`(읽음), `push_subscriptions`, `trending_themes`, `profiles.id → auth.users` FK 제거 + `deleted_at`, 함수 `unread_count / unread_by_conversation / push_targets`.

**Vercel 환경변수**: VAPID 3종은 CLI로 넣음(Production+Preview, 2026-09-04). `SUPABASE_SERVICE_ROLE_KEY`는 2026-09-04 Vercel Production에 대시보드로 추가 완료(Preview엔 없음 — 프리뷰에선 탈퇴가 비활성화만 됨). 로컬 `.env.local`엔 없으니 로컬에서 완전 삭제를 테스트하려면 추가 필요. **남은 직접 작업 없음.** 참고 — `.env.local`에 있는 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`·`VAPID_PRIVATE_KEY`·`VAPID_SUBJECT`(웹푸시), 그리고 `SUPABASE_SERVICE_ROLE_KEY`(계정 완전 삭제; 대시보드 → Project Settings → API Keys). 로컬 `.env.local`에도 service_role 추가.

무엇이 어떻게 동작하나:
- **채팅 이미지**: 첨부 버튼 → 클라이언트가 `chat-images/<대화>/<유저>/<uuid>`에 업로드 → `/api/messages`에 `imagePath` → 말풍선에 서명 URL(1h)로 표시. 5MB·jpeg/png/webp/gif.
- **안읽음**: 방에 있으면 `conversation_reads` 갱신. 채팅 목록 배지, 하단 탭바·GNB 채팅 아이콘 숫자/점(`unread_count` rpc, layout에서 1회).
- **웹푸시**: 마이페이지 "채팅 알림" 스위치 → `public/sw.js` 등록·구독 → `push_subscriptions`. 발송은 `/api/messages`에서 `push_targets(대화)`(SECURITY DEFINER, 상대 구독만) → `web-push`. VAPID 없으면 조용히 생략. iOS는 홈 화면에 추가한 PWA에서만 동작.
- **계정 삭제**: `/api/account/delete` — `deactivate_my_account`(익명화·상품 숨김) 후 service_role 있으면 `auth.admin.deleteUser`; 없으면 202(비활성화만). 어드민 사용자 화면 "완전 삭제" 버튼(`/api/admin/users/delete`). 프로필은 유령으로 남아 거래 기록 보존.
- **큐레이션**: `lib/market/themes.ts`가 `trending_themes`를 10분 캐시로 읽고 실패/비어있음이면 `trending-data.ts` 폴백. 어드민 `/admin/trending`에서 추가·수정·순서·노출·삭제. 홈 캐러셀은 앞 4개, 팔기 칩은 전부.

- **외부 상품 상세 보강(당근·중고나라)**: `MarketItemDetail`에 `region/category/postedAt/sellerTemp/counts/tradeTags` 추가. 당근은 임베디드 아폴로 JSON(`"content"…"recommendedArticles"` 앵커에서 역방향 탐색)으로 닉네임·동네·카테고리·끌올시각·관심/채팅/조회 + 마크업의 매너온도(`45.6<!-- -->°C`), 중고나라는 `self.__next_f` 플라이트 JSON(`\"productSeq\":ID` 세그먼트를 언이스케이프)으로 닉네임·동네·카테고리 경로·게시시각·조회·라벨(직거래/새상품/안전결제)·이미지 전부. 상세 페이지에 맥락 줄·거래 라벨 칩·판매자 카드(매너온도)·설명 본문 색(ink). 파서는 `parseDaangnContext/parseJoongnaContext`로 분리돼 저장 HTML로 오프라인 검증 가능.

- **SAZO식 URL 붙여넣기 보완**: 당근 영숫자 슬러그 ID(`…-wd1p22fbdiyc/`)·쿼리스트링·`page.auctions` 서브도메인·`mercari.com/jp/items/` 대응, 홈 검색창에도 연결(기존엔 /global만). 테스트 8건.
- **메루카리·야후 상세 보강 + 판매자의 다른 상품(4마켓)**: `MarketItemDetail.sellerRating/sellerUrl/sellerItems`, `counts.bids`. 메루카리는 `/items/get`의 seller(평가 good/normal/bad, num_ratings)·num_likes/comments·item_category·updated + `/items/get_items?seller_id=`로 판매자 상품(v2 검색 sellerIds는 무시됨). 야후는 `__NEXT_DATA__`의 seller.rating(goodRating/summary)·watchListNum·bids·category.path·startTime·shipSchedule + `/seller/<aucUserId>` 페이지 `__NEXT_DATA__`(imageUrl·buyNowPrice·isFixedPrice)로 판매자 상품. 당근은 상세 JSON의 `userArticles`. 중고나라는 스토어가 클라이언트 렌더라 `sellerUrl`(store/<storeSeq>) 링크만. 상세 하단 "판매자의 다른 상품" 캐러셀 + "원본에서 더 보기".

## 인프라

- Supabase: 프로젝트 `tomo` (id `zftztnkczlblnkgaijzc`, 서울 리전, seoulbuy 조직 — 이든에이치 계정)
  - 마이그레이션 13개 적용 완료 (`supabase/migrations/` = DB 실제 상태와 일치. 0011 external_items, 0012 proxy_requests, 0013 storage own-folder delete, 0013 conversation participant delete)
  - 0014 wishlists 적용 완료(2026-09-03, 대시보드 SQL) — 찜 기능(상세 ♡ 토글·마이페이지 찜 목록·`wishlist_count` 공개 함수)
  - 0015 trade_pack 적용 완료(2026-09-03, 대시보드 SQL) — 당근·메루카리·SAZO 흡수 3팩. listings에 condition/shipping_payer/ship_days/allow_offers/view_count/bumped_at, price 0 허용(나눔), wishlists.price_at_wish, `offers` 테이블(3단계 가격제안, `respond_offer` 수락 시 가격 인하), `bump_listing`(48h), `increment_view`, `conversation_count`. 피드는 `bumped_at` 정렬. vitest 52
  - 0016 admin_pack 적용 완료(2026-09-04, 대시보드 SQL — 에디터는 스크립트 전체가 한 트랜잭션이라 중간 오류 시 전부 롤백됨) — listings.hidden/hidden_by_admin(RLS로 전 쿼리 자동 제외, 운영자 숨김은 트리거로 셀러가 못 되살림), profiles.suspended(RESTRICTIVE 정책으로 글쓰기 차단), transactions.dispute_reason/resolution, 함수 admin_set_listing_hidden/admin_set_user/deactivate_my_account/open_dispute/resolve_dispute, 운영자 후기 삭제·환율 수정·외부상품 삭제 정책. vitest 53
  - 마이페이지: 할 일(데이터 유도 알림)·받은/보낸 제안·찜 해제·내 상품 상태전환/숨김/수정(`/listings/[id]/edit`, PATCH `/api/listings/[id]`)/삭제·프로필 편집(`/mypage/edit`)·탈퇴(비활성화). 거래 상세에 분쟁 신고. 어드민: `/admin/disputes`(정산/환불) `/admin/listings` `/admin/users` `/admin/rates`, 외부상품 숨김/삭제, 대행 큐 묶음 뱃지, 프로필 후기 삭제. 미구현: auth 계정 완전 삭제·Stripe 실환불(service_role/Stripe 키 투입 후), 인기 큐레이션 DB화
  - 상세 페이지는 메루카리 골격(제목→가격+배송주석→설명→상품정보 표→판매자→안심거래→하단 가격+구매 바), 공유·찜·가격제안·판매자 도구(끌올/제안 응답), 하단 "판매자의 다른 상품·비슷한 상품". 홈·리스트 카테고리 칩(`?cat=`). /global 검색창에 상품 URL 붙여넣기(`lib/market/url.ts`), 대행 요청란+묶음배송 희망은 note 필드로 전달. Supabase MCP 커넥터는 다른 계정에 붙어 있을 때가 많으니 마이그레이션은 대시보드 SQL이 가장 확실
  - Auth: 이메일 확인 꺼짐(개발용). **Google 로그인 설정 완료(2026-09-03)** — GCP 프로젝트 `My First Project`(id `disco-parsec-261005`, mellowdazzle@gmail.com 계정), OAuth 클라이언트 `TOMO web`(승인된 원본: 배포 URL·localhost:3000, 리디렉션 URI: `https://zftztnkczlblnkgaijzc.supabase.co/auth/v1/callback`). Supabase Site URL = 배포 URL, Redirect URLs = 배포·로컬 `/auth/callback`. 배포본에서 구글 버튼 → 온보딩 도달 확인. 동의 화면은 "외부·테스트" 상태라 테스트 사용자 외 계정으로 로그인하려면 GCP 인증 플랫폼 → 대상에서 "앱 게시" 필요
- **Google 로그인 (2026-09-08 설정·검증 완료)**: GCP 프로젝트 `My First Project`(id `disco-parsec-261005`, mellowdazzle@gmail.com 계정) → OAuth 동의 화면 TOMO(외부, **프로덕션 게시됨** — 홈페이지·개인정보처리방침·약관 링크 등록), 웹 클라이언트 `TOMO web`(원본: 배포 URL·localhost:3000, 리디렉션: `https://zftztnkczlblnkgaijzc.supabase.co/auth/v1/callback`). Supabase Auth: Google 프로바이더 Enable(Client ID/Secret 입력), Site URL 배포 주소, Redirect URLs `/auth/callback` 배포·로컬. 앱 쪽은 `components/LoginForm.tsx` 구글 버튼 + `app/auth/callback/route.ts`. 배포본에서 구글 로그인 → 온보딩 도달 실검증. **2026-09-08 추가**: 프로덕션 도메인 `tomo-delta.vercel.app`을 Supabase Site URL·Redirect URLs(`/auth/callback`)와 구글 클라이언트 승인 원본에 추가, tomo-delta에서 구글 계정 선택 화면 도달 확인. 동의 화면 브랜딩에 홈페이지·/privacy·/terms 링크 등록 후 프로덕션 게시. 커스텀 도메인 연결 시 같은 3곳 갱신 필요.
- 테스트 계정: `tomo.test.alice@gmail.com`(한국/서울 마포구), `tomo.test.bob@gmail.com`(일본/신주쿠), `tomo.test.center@gmail.com`(센터 admin, is_admin=true) — 비밀번호는 `.env.local`의 `TEST_PASSWORD` (2026-09-07 교체, git 밖)
- 데모 상품 4건 시드됨. 재시드: `npx tsx scripts/seed-demo.ts` (멱등)

## 완료된 것

- 인증·온보딩(국가/지역/언어), 전 테이블 RLS + 권한상승 차단, 신뢰온도 스키마
- 상품 등록(이미지 업로드 + 자동번역 훅) / 피드(전체·내동네·해외직구 탭, 환산가) / 상세(원문 토글) / 검색(한일 양방향)
- 채팅: 구매자↔판매자 1:1 실시간(Supabase Realtime) + 발송 시점 메시지 자동번역·저장, 번역 말풍선(원문 언어색)+원문 토글, `/chat` 목록·`/chat/[id]` 채팅방. 참여자만 열람 RLS
- 에스크로 DB 계층(Plan 04 Task 1): 상태머신 SECURITY DEFINER 함수(start/advance/mark_paid/attach_payment_intent/submit_review) + 예약 lazy-expiry + 수수료 10% + 후기→신뢰온도. 직접 쓰기 차단, 함수 EXECUTE는 authenticated 한정(0009). 마이그레이션 0008·0009
- 에스크로 UI(Plan 04 Task 4·5·6): `/transactions/[id]`(타임라인·금액·운송장·역할별 액션), `/admin/center`(admin SELECT RLS 0010, 센터별 입고/발송 큐), `/profile/[id]`(하트게이지·상품·받은 후기, `me` 별칭), 상세 안전결제 버튼(키 없으면 graceful)
- 공개 브라우징: 게스트도 피드/상세/프로필 열람 가능, 액션 시에만 로그인 유도
- 오픈마켓(Plan 05): 외부마켓 파서 4종(`lib/market/` — 메루카리 DPoP, 야후옥션, 당근, 중고나라) + 소스별 언어 처리 통합 검색, `external_items` 캐시(0011), `/global` 해외마켓 피드·외부상품 상세, 대행구매 요청 플로우(`proxy_requests` 0012, 견적 포함 대행 큐), 수동 외부상품 등록, 키 없을 때 한↔일 검색어 번역 폴백
- 마이페이지(`/mypage`) + 관리자 대시보드
- 여행 직거래: 피드 탭(전체/내 동네/여행 직거래)·상품 뱃지·상세 안내 — 상대국 방문 중 직접 만나 거래
- 디자인 패스: 메루카리/당근 참고 타이포·모션·상태·피드 밀도. 판매완료 상품은 피드 하단 정렬

## 배포

- **Vercel 배포 완료** (production). 프로젝트 `tomo` (팀 montsaintandco's projects, Hobby). GitHub `montsaintandco/tomo` 연동 → master 푸시 시 자동 재배포
- URL: https://tomo-montsaintandcos-projects.vercel.app (배포별 URL 예: tomo-mqhr5o7b9-…)
- Vercel 환경변수: `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`만 설정됨(Production+Preview). 아직 미설정: `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`SUPABASE_SERVICE_ROLE_KEY`(결제) — 없으면 결제 기능 graceful 대기, 오류 아님. 번역은 키 불필요(아래)

## 남은 로드맵

1. **키 넣고 Stripe 라이브 테스트**: 코드 완료(`lib/stripe.ts`, `/api/checkout`, `/api/stripe/webhook`, `lib/supabase/admin.ts`) — 키 없으면 503. 로컬은 `.env.local`+`stripe listen`, 배포는 Vercel 환경변수 추가 + Stripe 대시보드 webhook 엔드포인트(`/api/stripe/webhook`) 등록
2. 커스텀 도메인(선택). 폰트는 리디자인(3afcdee)에서 Cafe24 써라운드+Pretendard `@font-face`(globals.css)로 확정 적용 — 복원 항목 종결

## 필요한 키 (아직 없음)

- `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` (테스트 모드) — Plan 04에서
- Supabase `service_role` 키 — Plan 04 웹훅 + `scripts/cleanup-orphan-images.ts` 일괄 정리에서 (대시보드 → Project Settings → API Keys)

## 번역 (2026-08-26 전환: 무료, 키 불필요)

- `lib/translate.ts` — 구글 무료 엔드포인트 `clients5.google.com/translate_a/t?client=dict-chrome-ex` (POST, q 복수 지원, 키 없음). 리스팅·채팅·검색어 번역 전부 이 경로. 실패 시 null(graceful), 검색어는 MyMemory 2차 폴백 → 원문
- `@anthropic-ai/sdk` 의존성 제거됨. `ANTHROPIC_API_KEY` 더 이상 불필요
- 주의: 비공식 엔드포인트라 IP에 따라 차단될 수 있음(`translate.googleapis.com` gtx는 데이터센터 IP에서 차단 확인됨 — 그래서 clients5 채택). 차단 시에도 UI는 "번역 준비 중" 표시로 동작

## 주의사항 / 이월된 마이너 이슈

- API 라우트는 미들웨어 보호 밖 (자체 인증 필수 — /api/listings 참고)
- 구매자발 상태 전이는 반드시 SECURITY DEFINER DB 함수로 (listings UPDATE RLS가 셀러 전용)
- RLS 서브쿼리 교훈: WITH CHECK 안 서브쿼리에서 unqualified 컬럼은 서브쿼리 테이블로 바인딩됨. 삽입 대상 행 컬럼은 반드시 `테이블명.컬럼` 으로 한정할 것 (0006→0007 정책 버그 수정 사례)
- 이월 이슈 4건 정리 완료(2026-08-26): 피드 쿼리 에러 표시(`app/page.tsx` 에러 상태+재시도), 로그인 명시적 로그인/회원가입 탭(자동 signUp 폴스루 제거), 폼 a11y(login·onboarding·sell 라벨/aria-pressed/legend/role=alert), 고아 이미지(0013 own-folder delete 정책 적용됨 + sell 실패 시 즉시 정리 + `scripts/cleanup-orphan-images.ts` — 기존 고아 일괄 삭제는 service_role 키 필요, 없으면 skip)
- 상세 내역: 저장소 내 `.superpowers/sdd/progress.md` (전체 진행 레저)

## 문서

- `2026-07-17-tomo-design-spec.md` — 제품 설계 스펙 (승인본)
- `2026-07-17-tomo-plan-01-foundation.md`, `2026-07-21-tomo-plan-02-listings.md`, `2026-07-21-tomo-plan-03-chat.md` — 실행 완료된 구현 플랜
- `2026-07-21-tomo-plan-04-escrow.md` — 실행 플랜. Task 1(마이그레이션) 완료, Task 7 부분(상태머신·수수료·RLS 테스트) 완료. Task 2~3(Stripe·webhook) 키 대기, Task 4~6(UI) 완료
- `2026-07-26-tomo-plan-05-open-market.md` — 오픈마켓 플랜. 실행 완료
- 브랜드: 토모 TOMO — 말풍선 두 개(블루=한국, 핑크=일본) 겹침에서 하트. 카와이 컨셉

## Claude에서 이어서 작업하려면

새 세션에서 이 폴더를 연결하고: "TOMO 프로젝트 이어서. HANDOFF.md 읽고 진행". 최우선 잔여 작업은 Stripe 3종 키 투입(Plan 04 Task 2~3 라이브 테스트 — STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET/SUPABASE_SERVICE_ROLE_KEY). 번역은 무료 구글 경로로 전환 완료(키 불필요), 이월 이슈 4건도 정리 완료.

## 2026-09-04 (오피스) — "전부 수정" 라운드
- 외부 상품 상세(`app/global/[source]/[id]/page.tsx`) 재구성: 가로 스와이프 갤러리+사진 N장, 예상 총액 히어로(정가 서브라인), 양방향 `proxyEstimate`(KRW/JPY), 같은 나라 상품은 원본 직거래 링크, 고정 바 = 총액+버튼, 대행 신청은 `<dialog>` 바텀시트(요청사항·묶음·경매 최대 입찰가), 진행 4단계 안내, 판매자 카드 국가칩+검수 문구.
- 홈 재베이스라인 26/40 후 수정: 국내 서브카피 사실화, 외부 카드에 원문 제목 1줄 상시, KR/JP 토글 44px(폭 32, 375px 오버플로 주의), 게스트 "내 동네"→전체 리스트, 팔기 버튼 네이비, 허브 검색 헤더 비고정, 소스 배지 i18n·지역 lang·ja 더보기 라벨.
- 디텍터 0건(11px 플로어, 푸터 17px). 크리틱 스냅샷 `.impeccable/critique/` (상세 21, 홈 26 — 수정 전 기준). 다음 크리틱은 수정 후 재채점.
- 검증: tsc/lint/vitest 58 통과, 375/데스크톱 브라우저 확인.
- 결제 금액 표기를 사줘(SAZO)식으로 통일: 카드·히어로는 뷰어 통화 단일가("약" 제거), 상세 표는 상품 가격 → 현지 유통비 → 총 상품 금액 → 국제 배송비(첫 건 8,000원/¥900 개략) → 통관·대행 수수료(상품가 10%) → 총 결제 예상, "주문 시 1회 결제 · 2차 결제 없음". `lib/fees.ts` `proxyEstimate`가 유일한 계산처, 어드민 QuoteForm 기본 수수료도 10%. 국제배송비는 무게 데이터 쌓이면 구간표로.
- 상세 갤러리를 메루카리식으로(`components/Gallery.tsx`: 데스크톱 좌측 세로 썸네일, 모바일 아래 가로 썸네일, 화살표·카운터). "무게에 따라 견적 확정" 문구 삭제(1회 결제 구조와 모순). 상세 하단 "비슷한 상품" = 같은 마켓에서 제목 앞 3단어 검색(`searchSource`, 번역 없음), Suspense 스트리밍. 모바일 GNB는 카트 추가로 꽉 차서 판매 버튼 아이콘화·아이콘 36px.
- 거주 국가 변경 가능(2026-09-04): 마이페이지 프로필 편집에 KR/JP 토글, 바꾸면 지역은 그 나라 첫 항목으로. 마이그레이션 **0019**(`grant update (country)`) Supabase MCP로 적용 완료. 기존 등록 상품의 country는 유지, 이후 등록·주문 통화만 바뀜. vitest 67.
- GNB를 사줘식으로(2026-09-04): 로고 | 검색창(키워드·URL, /global로 GET) | KR/JP·카트·로그인/채팅·마이·판매, 2열 내비 = 홈·서비스 소개(/about)·카테고리(/categories)·고객센터(/help, FAQ <details>)·공지사항(/notice, lib/notices.ts 코드 테이블). 홈 데스크톱의 페이지 검색창은 숨김(모바일은 유지). 푸터는 한 줄 메뉴 + 회사 정보로 축소(브랜드 밴드·설명 제거).
- 속도(2026-09-04): 원인 = Vercel 함수가 미국(iad1)에서 서울 Supabase(ap-northeast-2)로 페이지당 직렬 5~7 RTT + Pretendard 2MB 통파일. 조치: `vercel.json` regions icn1(서울), 레이아웃 unread·카트 병렬, getViewer 프로필·환율·언어 병렬, Pretendard 다이나믹 서브셋 CSS(@import). 로그인 사용자 TTFB가 크게 줄어야 정상.
- 결제 구조 사줘 역산 반영(2026-09-04): "수수료" 단어 제거. 상세는 상품 가격·총 상품 금액(상품 가격 + 현지 유통비 ₩0)·배송 예상(약 10~14일)·"주문 전 3가지 확인" 모달만. 배송비·통관은 장바구니·주문서에서: 상품 소계 → 국제 배송비 → **통관·관세** → 전체 금액 + "받으실 때 추가 청구 없음" ? 모달(비용 안내). 통관·관세 = 면세 한도(KRW 20만/JPY 1만) 이하 소계 10%, 초과 시 KR 관세 8%+부가세 10%(CIF) + 5%, JP 소비세 10% + 5% (`lib/fees.ts customsCharge`, DB `proxy_customs`, 마이그레이션 **0020** MCP 적용). 사줘 캡처(소계 1,410,657 → 통관·관세 337,276)를 ±2원으로 재현하는 테스트 포함. vitest 70, 파일 병렬 끔(alice 픽스처 경합).

## 2026-11-23 호스팅 이전: Vercel → 아마존 Lightsail 도쿄(Coolify), 에어쉽과 같은 서버

- 새 주소: **https://tomo.airship.click** (Cloudflare Proxied, airship.click 영역). Vercel(tomo-montsaintandcos-projects.vercel.app)은 되돌리기용으로 그대로 둔다.
- 서버: `airship-tokyo-1` (57.182.181.165). Coolify 프로젝트 `tomo` / 앱 `tomo-image`(uuid `davjrdbsym90qkqzgmdt4zlu`, Docker Image `ghcr.io/montsaintandco/tomo:latest`, 포트 3000, 상태 점검 GET /robots.txt).
- 빌드: `.github/workflows/server-image.yml` — master 푸시(md·docs·plans·supabase·.agents만 바뀐 푸시는 건너뜀) → `next build`(standalone) → `deploy/server.Dockerfile` 이미지 → ghcr. 수동은 Actions 「server-image」 Run workflow.
- NEXT_PUBLIC_* 는 빌드 때 박히므로 저장소 Actions 변수(vars)에 있다. 서버 실행 비밀값(SUPABASE_SERVICE_ROLE_KEY·TOSS_*·VAPID_*)은 Coolify 환경변수에만 있다.
- 배포: 서버 systemd `tomo-deploy-watch.timer`(1분) → `/usr/local/bin/tomo-deploy-watch`가 ghcr :latest 다이제스트 변화를 보면 Coolify API(10.0.1.1:8000)로 배포. 로그 `journalctl -t tomo-deploy`. Cloudflare 캐시는 안 비운다(정적 파일 해시 이름, 비우면 airship.click 전체가 비워짐).
- 코드: Vercel 밖에서는 `output: "standalone"`, Vercel 애널리틱스 끔, 레이트리밋 IP는 `cf-connecting-ip` 먼저, 호스팅 표기(푸터·개인정보처리방침)는 AWS.
- VAPID 키는 새로 만들었다(주소가 바뀌어 기존 구독은 어차피 못 씀).
- **DB 주의**: Supabase tomo(`zftztnkczlblnkgaijzc`)는 10/27부터 일시정지(무료 2개 한도로 재개 막힘). 로그인·내 상품·채팅·결제 등 DB 기능은 새 주소에서도 안 된다. 외부 마켓 검색·번역·정적 페이지만 동작.
- 되돌리기: Cloudflare에서 tomo 레코드 삭제, Coolify `tomo-image` 중지, `systemctl disable --now tomo-deploy-watch.timer`. Vercel은 그대로라 이전 주소는 계속 산다.
## 2026-11-23 — 에어쉽·키라팝 기능 이식 (마이페이지·어드민 포함)

설계서: `docs/port-plan-2026-11-23.md`(이식 목록·제외 이유·DB·파일 소유). Ren 지시 「airship·키라팝 기능 중 tomo 이식할 것 전부, 마이페이지·어드민 포함」.

- **환불·취소(0025)**: 토스 실환불 연결(`lib/refunds.ts`, `/api/admin/cancel`, `/api/admin/refunds`). 순서는 DB 상태 변경 + `refunds` pending → 토스 취소(Idempotency-Key=환불 id) → `refund_mark`. 실패·키 없음은 `/admin/refunds` 대기열에서 「다시 시도」. 관리자 거래 취소·강제 구매확정, 관리자 대행 취소(환불액 미리보기·상한 안 수정), 고객 결제 후 취소 요청, 활동 기록 `/admin/activity`(`admin_actions`).
- **판매 정산·출금(0026)**: `seller_ledger`(완료 거래 트리거로 sale 적립), 출금 계좌·신청(`/mypage/payouts`), 어드민 `/admin/payouts`(지급 완료·반려·수동 조정·미지급 합계), 회원 상세 `/admin/users/[id]`.
- **마이페이지 셸·알림·주소록·탈퇴(0027·0028)**: `/mypage` 하위 10메뉴(구매·판매·가격제안·정산·찜·알림·문의·배송지·설정), 20건씩 더보기. 알림은 DB 트리거가 `notifications`에 kind만 넣고 문구는 i18n `notif.<kind>`. 헤더 벨(데스크톱)·마이 아이콘 점(모바일). 주소록(복수 배송지·기본·KR 통관부호, `profiles`에는 통관부호 안 둠). 탈퇴는 `account_blockers()`로 진행 거래·환불·정산 잔액·출금 신청이 있으면 409. **0028은 `profiles` select를 열 단위로 바꿔 `ship_*` 공개 조회를 막는다**(이전엔 anon 키로 누구나 배송지를 읽을 수 있었음).
- **배너·공지(0029)**: `banners`(KR/JP/ALL·기간·순서·storage `banners` 버킷) → 홈 `BannerStrip`, `/admin/banners`. 공지 DB화 `/admin/notices`, `/notice`는 DB 오류·0건이면 `lib/notices.ts`로 폴백.
- **공용**: `lib/safe.ts`(`rows`·`tableMissing`) — 새 표가 없어도 화면이 죽지 않는다. i18n은 `lib/i18n-port/*.ts` 조각을 `lib/i18n.ts`의 `D`에 펼침. 어드민 내비에 「정산」 그룹(환불·판매 정산·출금, 카운트), 배너·공지·활동 기록 추가. 대시보드에 「돈 처리 대기」 줄.
- **제외**(이유는 설계서 2절): 바우처 충전·멤버십·등급·추천인·경매 자동입찰·3PL·홍보 레이더·AI 상담·알림톡/메일.
- **검증**: tsc 0, eslint 오류 0, 순수 함수 vitest 9파일 64개 통과, `next build` 성공. **DB 일시정지라 0025~0029는 미적용·미실행.** DB를 쓰는 기존 테스트(escrow·rls·cart 등)는 돌리지 못함.
- **DB 재개 후 할 일**: ① 0025→0026→0027→0028→0029 순서로 대시보드 SQL 적용(각각 `begin … rollback`으로 먼저 검증) ② 실환불은 토스 테스트 키로 부분·전액 1회씩 확인한 뒤 켠다 ③ 0028 뒤 `tests/cart-rls.test.ts`(주문 스냅샷으로 바꿈) 포함 전체 vitest ④ 배너 업로드→홈 노출(KR·JP), 공지 작성→/notice 반영.
- **AI 상담(2026-11-22, Ren 「tomo에 AI 상담 넣어」 — 위 「제외: AI 상담」·「LLM 미사용」 결정 번복)**: 에어쉽 support-ai 이식. `app/api/support-ai/route.ts`(비로그인 가능, IP 분당 10회, 스트림) + `lib/support-ai.server.ts`(지식=봇 트리·`lib/help-faq`·`lib/guide-content`·`lib/refund-policy`·`lib/fees`·`company`, 로그인 시 RLS로 본인 거래·대행 요청·주문 10건씩) + `SupportBot` 하단 입력창. 서버 env `AI_GATEWAY_API_KEY`(없으면 입력창 숨김·봇 트리만), `SUPPORT_AI_MODEL`(기본 openai/gpt-6-luna, 폴백 openai/gpt-5.6-luna). 로그 `0030_support_ai_log`(관리자 조회, 미적용이어도 동작) → `/admin/support-ai`.
- **DB 재개·적용(2026-11-23 11시)**: Supabase tomo(seoulbuy 무료 조직)를 재개했다. 0025~0029를 한 트랜잭션으로 시험 실행(표 9개·버킷·공지 1·주소 5 백필 확인 후 되돌림, 되돌림 확인)한 뒤 하나씩 적용했다. 0030(AI 로그)도 같은 방식. anon의 `profiles.ship_name` select 권한이 false인 것 확인. 전체 vitest 100개 중 98 통과·1 건너뜀, 실패 1건(rls 프로필 수정 차단 테스트의 `select()` 전체 열)은 `select("id")`로 고쳐 통과.
- **토스 키 주의**: `.env.local`의 공개 테스트 시크릿 키로 결제 조회 API를 부르면 `UNAUTHORIZED_KEY`가 난다. 지금 키로는 환불이 전부 `/admin/refunds` 대기열(failed)로 간다. 본인 토스 테스트/라이브 키로 바꿔야 실환불이 된다.
- **AI 상담 키**: Coolify `tomo-image`에 `AI_GATEWAY_API_KEY`(에어쉽과 같은 키)를 넣었다.

## 2026-11-23 결제 토스 → Stripe 전환 (Ren 「결제 스트라이프로 전환」)

- Stripe Checkout(호스팅 결제창) 리다이렉트. 청구는 KRW(약관 그대로, JPY 상품은 JPY_KRW 환산). 카드·국내카드(kr_card)·카카오페이·네이버페이는 `allowed_payment_method_types` 필터라 계정에서 켜진 것만 보인다.
- 확정: `/api/stripe/return?session_id=`(성공 리다이렉트)와 `/api/stripe/webhook`(checkout.session.completed·async_payment_succeeded) 둘 다 `lib/stripe-settle.ts settleSession`(멱등). DB·Stripe 오류는 던짐 → 웹훅 500 재시도.
- 자동 환불: DB가 확실히 「확정 불가」라고 답한 결제(이미 다른 결제로 확정·취소·금액 바뀜·옛 창)만 전액 환불(키 `auto_<pi>`). 이미 환불이 나간 PI는 확정하지 않는다. 세션 metadata `app=tomo:<SITE_URL>`이 다르면 무시.
- 0031(적용 완료 2026-11-23): `mark_tx_paid(tx_id, pi)` 한 문장 확정, 미결제 예약 10분 → 45분(결제창 30분), `transactions.stripe_session_id`. 재결제는 열린 창 재사용, 새 창은 거래 생성 10분 안에만.
- 환불(`lib/refunds.ts`): Stripe refunds, 같은 refund_id 환불이 이미 있으면 다시 안 보냄, 키 `<refund_id>:<amount>`. 토스 결제(pi_ 아님)는 `LEGACY_TOSS`로 실패 → 토스 상점관리자에서 직접.
- 필요한 서버 env(Coolify `tomo-image`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`(엔드포인트 https://tomo.airship.click/api/stripe/webhook). 없으면 결제 버튼이 「결제 준비 중」(503).
- 리뷰: deep 서브에이전트 지적(높음 3·중간 6) 반영. 실제 결제·웹훅은 키가 없어 아직 미시험.
### Stripe 계정·운영사 (2026-11-26, Ren 「같이쓰고 토모 운영사정보 에어쉽으로 변경」)
- 계정: 에어쉽 Stripe(일본, acct_1UEg3mKrvmPnPbYC, 실결제). Coolify `tomo-image`의 `STRIPE_SECRET_KEY`=sk_live(에어쉽 integration_secrets와 같은 키), `STRIPE_WEBHOOK_SECRET`=tomo 전용 운영 웹훅 `we_1UfrC7KrvmPnPbYCv36Xbov4`의 서명 비밀. 시험용 테스트 웹훅 `we_1Ufr1dKrvmPnPbYCGokhdU9n`(테스트 모드)도 남겨 둠.
- 에어쉽 웹훅은 tomo 세션(kind tx/po, checkout_version 없음)을 「우리 앱 세션 아님」으로 건너뛴다(src/routes/api/stripe/webhook.ts settle). tomo 웹훅은 metadata.app 이 다르면 무시. 결제창 상호는 「AirShip」으로 보인다.
- 운영사 표기: 몽상앤코 · 대표 정회승 · 762-25-00775 · 통신판매 제2019-광주서구-0159호 · help@airship.click(Actions vars + Coolify env + .env.local). 운영시간 문구는 예전 값 유지.
- 시험(테스트 모드): bob 계정으로 ₩50,000 결제 2회 → 결제창(카드·국내카드·Google Pay 표시) → `/transactions/<id>?pay=ok` 「決済が完了しました」, DB paid·PI·paid_krw 기록, 웹훅 전달 대기 0 → 관리자 취소로 Stripe 전액 환불 done. 운영 키로는 결제창(cs_live) 생성만 확인 후 만료·정리, 실결제는 안 함.
- 같이 고친 것: standalone 서버에서 route handler 의 req.url 이 http://0.0.0.0:3000 → 결제 복귀·Google 로그인 콜백 리다이렉트를 SITE_URL 기준으로(5273129). 이전 전에는 Google 로그인 콜백도 0.0.0.0 으로 튕겼을 것(추정).
- 시험 관리자 계정 tomo.test.center 메일 인증을 켬(로그인 막혀 있었음).
## 2026-11-26 AAA 업데이트 (Ren 「키라팝·에어쉽 참조해 트리플A급으로」) — 정본: docs/aaa/index.md

- 조사 4건(01 현황·02 에어쉽·03 키라팝·04 화면) → deep 설계 05-roadmap(트랙 13개) → 준비 커밋 P → 1차 T0~T5 → 2차 T6~T11 → QA 07 → 일본어 수정. 운영 버전 9d35791, 게이트·이미지·db-tests·스모크 모두 success.
- 운영 흐름: master 푸시 → `server-image`(gate: tsc·lint·단위 테스트 → build → ghcr) → 서버 1분 감시 배포 → `smoke`(/api/health version 일치 대기 후 주요 화면). DB 테스트는 별도 `db-tests` 워크플로(로컬 Supabase 재생+seed, 운영 DB 안 씀, 아직 배포 게이트 아님).
- DB 적용(운영): 0032 error_events · 0033 reports/blocks · 0034 external_items.origin(고객 입력 행 비공개) · 0035 주문 신선도 15분·직거래 배송비 DB 결정 · 0036 search_logs · 0037 admin_order_transitions/RPC 2개.
- 새 운영 화면: /admin/errors, /admin/reports, 대시보드 「내 차례」·시스템 상태, 주문 상세 시트(항목 상태 변경), 상품 제목·가격 수정. /api/health.
- env(선택): OPS_TELEGRAM_BOT_TOKEN·OPS_TELEGRAM_CHAT_ID(Coolify + GitHub Secrets) 넣으면 서버 오류·스모크 실패가 텔레그램으로 온다. SUPPORT_AI_DAILY_CAP·SUPPORT_AI_DAILY_PER_IP(기본 300·30).
- worktree 주의: worktree 안 `next build` 가 `.next/standalone/node_modules` junction 을 만든다. 지울 때는 모든 ReparsePoint 를 먼저 끊는다(2026-11-26 메인 node_modules 2회 삭제 사고, docs/aaa/index.md).
- 남은 것: 운영 실결제 1회(Ren 확인 필요), 외부 상품 찜(DB 필요), 브랜드 색 통일(04#11), 서치콘솔·네이버 새 도메인 등록, db-tests 게이트 승격, 판매자 본인 가격 수정 API 의 거래 중 가격 변경 차단(T8 지적).
### 2026-11-26 후속(카테고리·나머지 적용)
- 카테고리 21개 대분류·151개 세부(8323c36), 메루카리 categoryId, 한국 마켓 카테고리 번호(중고나라 categorySeq·당근 category_id 실측, 8d16c0b).
- tomo 시험 매물 6개와 딸린 시험 거래 30·대화 4·환불 기록 2 삭제(되돌림 시험 후). 판매 중 0개.
- 해외 상품 찜(0038 external_wishlists), 판매자 가격 잠금(0039 트리거), 브랜드 색 통일(DESIGN.md 색 규칙, ink-soft 7.6:1·ink-faint 4.8:1), 빠른 필터 칩·결과 스켈레톤.
- 구글 서치콘솔 tomo.airship.click 확인·사이트맵 제출, 네이버 서치어드바이저 소유확인·사이트맵·robots 수집요청 완료.
- 남은 것: 운영 실결제 1회(Ren 확인), 텔레그램 운영 알림 봇 토큰, 홈 캐러셀·카테고리 미리보기 카드 찜 하트(찜 여부 조회 연결 필요), 검색엔진 수집 결과 며칠 뒤 확인.
### 2026-11-27 환불 「무효」·미결제 대행 정리 (Ren 134 1ㄱ 2ㄱ)
- 0040_refund_void(적용 완료, begin…rollback 리허설 후): refund_status에 void 추가, refund_mark는 done·void 행 안 바꿈. notify_refund는 done만 알림이라 void 전환 알림 없음. /admin/refunds 「완료·무효」 패널에 「무효」 표시(대기열은 pending·failed만), 고객 주문·대행 상세와 어드민 주문 환불 합계에서 void 제외, processRefund는 void면 안 보냄.
- 데이터: refunds ec2d78aa(건이아빠 ₩12,950 토스 테스트 결제) failed→void. 미결제 대행 요청 9건(건빵 1·Donguk 8) requested→cancelled, 주문 8건(d28a4bb1 포함) pending_payment→cancelled. 같은 트랜잭션에서 proxy_requests_notify를 끄고 다시 켜서 알림 0건(notifications 47건·max id 51 그대로).

### 2026-11-27 T1 운영 안전 (0041, 설계 docs/aaa/12 4장 P0 · Ren 결정 13개 기본값 승인)
- 0041_ops_safety(운영 적용 완료): enum 값 `held`(보류)는 단독으로 먼저 커밋했다(같은 트랜잭션에선 새 값을 못 씀). 나머지는 begin…rollback 리허설(센터 분쟁 환불·운영자 센터 취소 → held, paid 단계 → active, 판매자 보류 직접 해제·설정 거부, 정지 운영자 resolve/cancel/advance/삭제/해제 거부·거래 조회 0, 진행 거래 회원 삭제 거부, 운영자 계정·본인 삭제 거부, 직접 쓰기 기록·무세션 쓰기 미기록) 통과 후 적용, 카탈로그로 확인.
- 보류 규칙(한 함수 listing_after_tx_cancel): 결제 전·paid 취소 → 판매중, 그 뒤(발송·센터·배송) 또는 분쟁 직전 상태 모름 → held. 분쟁 직전 상태는 transactions.disputed_from 트리거가 남긴다. 해제는 admin_release_listing_hold(메모 필수) → 판매중+판매자 숨김, 판매자가 「다시 보이기」로 재판매. 어드민 분쟁·상품 화면에 보류 표시·「보류 해제」, 판매자 화면은 상태 버튼 숨김+안내.
- is_admin_user()에 정지 검사, advance_transaction·advance_proxy·quote_proxy의 직접 is_admin 검사와 정책 4개(0010·0011·0012)를 is_admin_user()로 바꿈. 앱 getViewer.isAdmin도 정지면 false.
- 회원 완전 삭제: admin_prepare_user_delete(검사 user_delete_blockers: 진행 거래·대행, 환불 pending/failed, 출금 requested, 정산 잔액≠0, 운영자 계정) → 통과 시 익명화·기록 후 라우트가 auth 삭제. 소유자 구분은 T3.
- 직접 쓰기 기록: banners·notices·trending_themes·exchange_rates·external_items(입력·수정·삭제), support_tickets(수정), reviews(삭제) — 운영자 세션만(service_role·크론은 기록 안 함). 활동 기록 「콘텐츠·직접 수정」 필터.
- Stripe 웹훅: settleSession이 metadata.app≠APP_TAG면 DB·Stripe 호출 없이 null → 200. 가드 추가 불필요, 단위 테스트(tests/unit/stripe-cross-app) 추가.
- 주의: worktree 안 turbopack 빌드는 node_modules junction을 거부한다 → `next build --webpack`으로 확인했다.
### 2026-11-27 T2 주문 번호·크론·알림 (0042, docs/aaa/12 T2)
- 0042(운영 적용 완료, begin…rollback 리허설 2회 후): proxy_orders.code T+6자리·transactions.code TX+6자리(기존 21·60행 만든 순서로 채움, 기본값 시퀀스, 고유 제약). transactions.delivered_at(배송 완료 시각 트리거). cron_runs(운영자만 읽기).
- pg_cron·pg_net 켬. 작업 3개: tomo_release_reservations(5분, 결제 대기 예약 45분 그대로 정리만), tomo_auto_complete(매시 15분, 배송 완료 7일 뒤 completed, disputed·refund_pending 제외, 활동 기록 tx_auto_complete), tomo_rates(매일 00:30 UTC → POST /api/cron/rates, 헤더 x-cron-secret = Vault tomo_cron_secret, 서버는 cron_secret_ok()로 확인 — env 불필요).
- 환율(lib/fx-refresh.ts): 원천 airship.click/api/fx-rate(관세청 고시, 에어쉽과 같음), 가산 0 유지. 지금 적용 값보다 3% 넘게 바뀌면 보류 → /admin/rates 「이 값으로 적용」, 텔레그램 「[TOMO]」(OPS_TELEGRAM_* 없으면 무음).
- 알림: proxy_paid(주문당 평생 1회), tx_to_center(구매자), tx_center_received(양쪽), tx_auto_completed(양쪽). 인앱만(웹푸시는 여전히 채팅만).
- 화면: 어드민 주문·거래 목록·시트에 번호와 번호 검색(?q=T000012 / TX000034), 고객 주문·거래 상세, 마이페이지 구매·판매 목록.
- 되돌리기: 0042 파일 하단 주석(cron.unschedule 3개 등).
### 2026-11-27 T3 운영 API(서명 브리지, 0043, docs/aaa/12 T3·8장 — 구현 표는 같은 문서 9장)
- 0043_ops_bridge(운영 적용 완료, begin…rollback 리허설 2회 후): ops_actors(센터 운영자 → tomo 운영자, is_owner = money), ops_requests(request_id 멱등), ops_outbox(이벤트 9종, 24시간 재전송). 이벤트 트리거는 AFTER 로 따로 붙였다(notify_transaction·notify_proxy 는 0042 그대로). pg_cron `tomo_ops_outbox` 1분 → POST /api/cron/ops-outbox(x-cron-secret, cron_secret_ok).
- 코드: lib/ops-bridge.ts(HMAC 서명·상수 시간 비교·멱등 executeOnce·이벤트 본문), lib/ops-server.ts(인증·운영자 연결·운영자 세션·저장), lib/ops-api.ts(경로 31개), app/api/ops/[...path], app/api/cron/ops-outbox. 어드민 취소·회원 삭제 본체를 lib/admin-actions.ts 로 옮겨 /api/admin/* 와 /api/ops/* 가 같이 쓴다(로직 복사 없음).
- 운영자 이름으로 실행 = 설계 1안. 서비스 키로 generateLink(magiclink, 메일 안 보냄) → verifyOtp 로 그 운영자 세션을 만들고 RPC 를 부른 뒤 signOut. 짧은 토큰 직접 발급은 불가(JWT 서명키가 ES256 비대칭, 비밀키 없음). 액세스 토큰 수명은 프로젝트 기본 1시간이고 서버 메모리 밖으로 나가지 않는다. RPC 수정 없음.
- env(Coolify tomo-image): OPS_BRIDGE_SECRET·OPS_BRIDGE_KEY_ID(=tomo-1) 넣음(2026-11-27). 같은 값이 C:\dev\tomo\.env.local 에 있다(A1 이 에어쉽 integration_secrets 에 넣는다). OPS_HOOK_URL·OPS_HOOK_TOKEN 은 아직 없음 → 이벤트는 outbox 에 쌓이고 24시간 뒤 포기. A1 이 받는 쪽을 만든 뒤 넣는다.
- 연결된 운영자: Ren(mellowdazzle@gmail.com, 소유자). center_actor_id 는 비어 있고 센터의 첫 서명 요청 id 로 채워진다(이후 id 가 다르면 403). 시험 중 채워진 값은 비웠다.
- 점검 도구: `node node_modules/tsx/dist/cli.mjs scripts/ops-call.mts GET /api/ops/meta`(.env.local 비밀값 사용, 출력 안 함).
- 되돌리기: Coolify 에서 OPS_BRIDGE_SECRET 삭제 후 재시작 → /api/ops/** 전부 503. DB 는 0043 하단 주석.

### 2026-11-27 A1 에어쉽 연결(이벤트 훅 env)
- Coolify `tomo-image` env 에 `OPS_HOOK_URL`(=https://airship.click/api/site-hook/tomo)·`OPS_HOOK_TOKEN` 을 넣고(Add 로 하나씩, 미리보기 배포 칸에도 자동 복사됨) Redeploy 했다. 토큰 값은 에어쉽 `integration_secrets` `site:tomo`.hook_token 과 같다(값은 기록하지 않음). 재배포 뒤 /api/ops/health `outbox.hook_configured=true`.
- 에어쉽 쪽: `integration_secrets` `site:tomo`(base_url·key_id·secret·hook_token, 연결 테스트 meta 성공), 표 `connected_sites`·`connected_site_events`·`connected_site_ops_log`·`connected_site_access`(Ren ops+money), 화면 /admin/sites/tomo. 에어쉽 커밋 `0941d874`, 문서 에어쉽 `docs/connected-sites.md`.
- 첫 서명 요청(counts)으로 `ops_actors.center_actor_id` 가 Ren 의 에어쉽 user id(7ce8d1c0-…)로 채워졌다.
- 시험: outbox 에 `ticket.opened`(code 「시험(A1 연결 확인)」) 1건 → 1분 크론이 첫 시도에 전송 → 에어쉽 저장·어드민 알림·텔레그램 1건. 같은 event_id 재전송은 `duplicate` 로 버려짐, 틀린 토큰 401. 시험 행은 양쪽에서 지웠다(텔레그램 메시지 1건은 남음).
- 되돌리기: Coolify 에서 OPS_HOOK_URL 삭제 후 재시작 → 이벤트 전송 멈춤(outbox 24시간 뒤 포기).
### 2026-11-27 B0 메루카리 경매 인식·차단 (docs/aaa/14-auction.md B·C절)
- 실측(2026-11-27): 검색 v2 는 body 에 `withAuction: true` 를 넣어야 항목 `auction` 칸이 온다(없으면 경매도 null — 「ワンピースカード」 20건 중 경매 6건이 전부 null). 경매면 `{id, bidDeadline, totalBid, highestBid, initialPrice, state}`, 입찰 0건도 id·bidDeadline 이 있다. 상세 items/get 은 `include_auction=true` 를 붙여야 `auction_info`(`state` STATE_ONGOING·STATE_NO_BID, total_bids, highest_bid=표시 가격)가 온다. 일반 상품은 두 칸 다 없다.
- 코드: lib/market/mercari.ts 가 경매를 `auction: true` + `unbuyable: "auction"`(야후옥션과 같은 「구경만」)으로 표시. 상세는 구매 영역이 「경매 상품은 지금 지원하지 않아요 (구경만)」 비활성 버튼으로 바뀌고 장바구니·바로 구매가 사라진다. 카드 배지 「경매 · 구경만」(야후 포함, 옛 「입찰중」), 검색은 맨 뒤, 홈 줄·비슷한 상품·시세 힌트에서는 빠진다.
- 서버 차단: upsertExternalItem 이 경매면 409 `code: auction`(장바구니 /api/cart → `pay.err.auction`, 대행 신청 /api/proxy 도 거부, 스냅샷 안 적음). /api/order 재확인(lib/price-check)은 경매면 `auction`(BLOCKING) → 409 `pay.err.changed`, 이미 장바구니에 있던 경매도 결제 전에 막힌다. 경매는 external_items.fetched_at 을 새로 쓰지 않아 마켓을 못 읽을 때 15분 캐시로 통과하지 못한다. DB 변경 없음.
- vitest.unit.config.ts 에 `@` 별칭 추가(앱 코드 `@/` 경로 모듈을 단위 테스트에서 읽게). 테스트 tests/unit/mercari-auction.test.ts 11개(가드를 끄면 3개 실패 확인).
### 2026-11-27 A3 에어쉽 돈 화면용 운영 API(docs/aaa/12 9.4 A3)
- lib/ops-api.ts 경로 4개 추가: GET payouts/summary(money, admin_seller_liability 를 운영자 세션으로), GET users/:id/ledger(money, 원장 잔액·최근 20줄), POST users/:id/ledger_adjust(money, expected_status = 「통화:지금 잔액」, admin_adjust_seller_ledger), POST listings/:id/release(ops, 메모 필수, admin_release_listing_hold). meta.money_actions 에 ledger.adjust.
- SQL 변경 없음(0045 없음). 기존 RPC 그대로.
- 검사: tests/unit/ops-routes-a3.test.ts(돈 경로 scope money, 보류 해제 ops). (`@` 별칭은 B0 에서 이미 들어감.)
- 에어쉽 쪽 화면·가드는 에어쉽 docs/connected-sites.md 「A3」.

### 2026-11-27 U1·U2 자체 상품 경매 DB·서버 (docs/aaa/14-auction.md 부록 「U1·U2 구현 기록」)
- 0046_auctions·0047_auction_settle 운영 적용 완료(롤백 리허설 49단언 통과·결함 주입 3종 확인 뒤). 크론 `tomo_auctions` 1분(cron_runs job=auctions). 0045 비워 둠.
- 상한가 입찰 한 가지, 마감 5분 안 상승 시 5분 연장, 낙찰 뒤 48시간 결제(`/api/auctions/[id]/pay` → /api/checkout auctionId → start_auction_transaction, 기존 45분 거래·TX 번호), 미결제 경고·90일 2회 30일 제한·통산 3회 정지, 다시 경매/일반 전환. 입찰 단계에서 돈은 안 움직인다.
- 서버: `lib/auction.ts`(규칙표·판정·오류 키), `lib/auction-server.ts`, `app/api/auctions/**`, 알림 문구 `lib/i18n-port/auction.ts`. 플래그 `NEXT_PUBLIC_AUCTION=1` 없으면 404 — 운영 env 에는 아직 넣지 않음(U6 에서 켠다).
- 동시 입찰: 운영에서 연결 2개 실측(잠금 대기 확인) + `tests/auction.db.test.ts`.
- 다음: U3(등록·상세·카드), U4(마이페이지·검색·알림 화면), U5(운영), U6(리허설·켜기).
- 되돌리기: 0047 → 0046 파일 하단 주석 순서.

### 2026-11-27 U3·U4 경매 화면 (플래그 꺼진 채 배포, docs/aaa/14-auction.md 부록 「U3·U4 구현 기록」)
- 화면은 빌드 때 `NEXT_PUBLIC_AUCTION=1` 일 때만 나온다. 운영 Actions Variables 에는 아직 없다(U6 에서 켠다). 꺼져 있으면 목록 조회도 경매 칸을 안 붙인다(`auctionSelect()` 빈 글자).
- 등록: `SellForm` 판매 방식(바로 판매/경매)·시작가 단위 검사·기간 1·3·5·7일·마감 미리보기. 순서 = `POST /api/listings {saleType:"auction"}`(숨김·택배·제안 끔) → `POST /api/auctions`(공개). 2단계 실패면 숨긴 상품을 지운다. 경매 상품 수정은 가격·거래 방법·제안·국제 거래 칸 잠금(PATCH 도 그 칸을 무시).
- 카드(홈·검색·상세 하단·여행·프로필): 「경매」 배지·현재가 라벨·입찰 수·남은 시간(1시간 이하 경고색). `components/auction/AuctionCardMeta.tsx`.
- 상세: `components/auction/AuctionPanel.tsx` — 폴링(pollMs, 가린 탭 멈춤, 상품 id 로 조회해 다시 경매도 따라감), server_now 기준 카운트다운, 상한가 입력·예상 최대 결제액(directDetailTotal 재사용)·확인 단계(10배 초과 한 번 더)·입찰 기록(번호 마스킹)·낙찰 결제·판매자 취소/다시 경매/전환. 경매 상품은 하단 구매 바·제안·SellerPanel(끌올) 안 보임.
- 마이페이지 `/mypage/auctions`(입찰 중·낙찰·내 경매), 메뉴 배지·할 일(낙찰 결제 필요·유찰/미결제 뒤 선택 필요). 홈 목록 「경매만」(`?auction=1`, 진행 중만). 찜은 「경매」 표시·값내림 끔. 내 상품 목록은 경매 상품에 숨기기·삭제 버튼을 안 둔다.
- 다음: U5(운영 함수·/admin/auctions·ops capability), U6(운영 리허설 14항목 뒤 Actions Variables 에 `NEXT_PUBLIC_AUCTION=1` 넣고 재빌드).
### 2026-11-27 U5 경매 운영 (0048, docs/aaa/14-auction.md 부록 「U5 구현 기록」)
- 0048_auction_ops 운영 적용 완료(적용 전 0048 객체 없음 확인, 롤백 리허설 10묶음 통과·결함 주입 4종 확인 뒤). 0046·0047 함수는 그대로.
- 운영 함수: admin_close_auction(진행 중만, 메모 필수, cancelled + 상품 숨김 + 입찰자·판매자 알림 auction_cancelled), admin_void_bid(진행 중만, 입찰자 하나의 입찰 전부 무효 → 1등·현재가·입찰 수·listings.price 재계산, 그 사람 재입찰 금지 `bid voided`, 알림 auction_bid_voided), admin_clear_strike(남은 경고로 제한 재계산). 전부 is_admin_user()·활동 기록.
- 조회: admin_auctions·admin_auction_detail(상한은 마감 뒤에만)·auction_ops_counts — 운영자 세션 또는 service_role.
- 의심 표시(표시만): auction_flags(same_contact·repeat_no_win·relist_rebid·new_account_pusher). 이벤트 auction.ended·unpaid·cancelled·flagged(ops_outbox 제약 13종).
- 진행 중 경매 상품은 admin_set_listing_hidden(숨김) 거절, 진행 중 경매가 있는 판매자는 admin_set_user(정지) 거절 → 강제 종료 먼저.
- 화면: /admin/auctions(탭·검색·지연·의심, 상세 시트 조작), 메뉴 「경매」, 대시보드 처리 대기 줄. 플래그와 무관.
- 운영 API: capability auction, GET auctions·auctions/:id, POST auctions/:id/close·void_bid·clear_strike(ops), counts 3줄. 에어쉽 화면은 에어쉽 docs/connected-sites.md 「U5」.
- 되돌리기: 0048 파일 하단 주석 → 코드 revert.
### 2026-11-27 U6 경매 리허설·켜기 (docs/aaa/14-auction.md 부록 「U6 기록」)
- 로컬(운영 DB·Stripe 테스트 키) 14단계 브라우저 리허설: 실결제(10번)만 빼고 통과. 시각은 시험 행만 service role 로 당김. 결함 고침(aad4be8): 입찰 있는 경매 내용 수정 잠금, 빌드 env 에 NEXT_PUBLIC_AUCTION 누락, 미결제 경매 「거래 보기」, 내 경매 전환 표시, 번역 제목, 「경매만」 마감 임박순.
- 켬: Actions Variables `NEXT_PUBLIC_AUCTION=1` + aad4be8 배포(gate·image·db-tests·smoke success). 운영 판매 폼 「판매 방식」·「경매만」·/mypage/auctions·경매 API 확인. 고객센터 FAQ·llms.txt·AI 상담에 경매 규칙(플래그 켜질 때만).
- 시험 데이터 전부 정리(표별 건수는 14 부록), 에어쉽 connected_site_events 3건 삭제.
- 남은 것: 낙찰 결제창 45분 만료 때 tx_cancelled 알림이 양쪽에 감(오해 소지, SQL 0049 필요), 실결제 1회(Ren 승인), 「추가 설명 덧붙이기」 없음, 공지 등록(Ren).
- 끄기: Actions 변수 삭제 → 재빌드.

### 2026-11-27 해외 마켓 경매 입찰 대행 M0~M2 + 0049 (docs/aaa/15 부록 「M0~M2 구현 기록」)
- 0049_auction_pay_expire_notify(운영 적용): 낙찰 결제창 45분 만료로 거래가 취소돼도 경매가 결제 대기면 낙찰자에게만 auction_pay_expired, 판매자에게는 알림 없음. notify_transaction 은 지금 정의를 읽어 cancelled 줄만 바꿨다(되돌리기 SQL 은 파일 끝, md5 로 원복 확인).
- 0050_market_bids(운영 적용, 롤백 리허설 48단언·결함 주입 4종 뒤): 표 5개·MB 번호·신청/결제창 연결/승인/취소/만료/해제·매입 기록 함수·가드(기본값 Ren 확정). 접수 스위치 accepting=false.
- 코드: lib/market-bid.ts(금액·사실·오류 키), lib/market-bid.server.ts(승인만 결제창·확정·해제·매입), app/api/market-bid(POST·DELETE, 플래그 없으면 404), 웹훅·복귀 kind=mb 분기, createSession manual 옵션(카드만), 메루카리 상세 auctionInfo.
- 플래그 `NEXT_PUBLIC_MARKET_AUCTION` 은 운영에 없음(넣지 말 것 — M6 리허설 뒤).
- Stripe 테스트 모드 실측: 승인만 결제창 완료 = session complete + payment_status unpaid + PI requires_capture, capture_before = 승인 + 7일(시험 Visa). 부분 매입·취소·만료 뒤 승인 자동 해제 확인. 시험 데이터 정리 완료.
- 다음: M3(마이그레이션 0051 — 설계 번호에서 한 칸 밀림), M4 고객 화면, M5 운영.
### 2026-11-27 실결제 시험 뒤 결함 수정 (0051, docs/aaa/index.md 사고 기록)
- 0051_tx_embed_fix 운영 적용(되돌림 리허설: 0051 없이 결함 재현 → 0051 로 통과, 되돌리기 SQL 로 notify_transaction md5 원복 확인).
- A: listings.held_tx_id FK 제거(칸 유지, 무결성 대체 검사 없음 — 쓰는 곳이 listing_after_tx_cancel 하나). 거래→상품 임베드는 전부 `listings!transactions_listing_id_fkey(...)`. 새 FK 를 더해 표 쌍 관계가 2개 이상이 되면 `tests/postgrest-embeds.db.test.ts` 가 관계 이름 없는 코드 임베드를 잡는다. 운영 감시는 `/api/health` `embeds`(스모크가 "ok" 확인).
- B: 결제된 경매 거래를 운영자 취소·분쟁 환불하면 상품을 숨긴다(auctions.tx_id = 그 거래). 판매자 마이페이지 경매 「다시 경매/전환 선택 필요」·할 일 숫자에 paid+판매중 포함(`sellerNeedsChoice`).
- C: 공개 목록(상세 판매자 다른 상품·비슷한 상품, 홈 목록·허브, 여행, 카테고리 수, 프로필)에서 숨김 상품 제외(`hidden=false`, 운영자 숨김도 hidden 이 같이 켜짐). 상태 필터 없는 홈 목록·프로필은 보류(held)도 제외.
- D: 화면 시각은 `lib/datetime.ts` `fmtAt`(Asia/Seoul). 어드민 `fmtDate`·상품 표, 고객 채팅 목록·알림·출금·문의·상품 등록일.
- E: 직거래 결제 완료 때 구매자 알림 `tx_buyer_paid`(ko/ja). notify_transaction 은 paid 줄 하나만 바꿈(0049 방식, 되돌리기 SQL 파일 끝).
- F: 에어쉽 connected_site_events 의 auction.ended 시험 1건(11/27 16:48)은 남아 있음 — 에어쉽 docs/connected-sites.md 에 DB 접근 방법이 없어 지우지 않았다.
### 2026-11-27 해외 마켓 경매 입찰 대행 M3~M5 (docs/aaa/15 부록 「M3~M5 구현 기록」 — 운영자 수동 입찰 절차서 포함)
- 0052_market_bid_settle(운영 적용, 되돌림 리허설 15묶음·결함 주입 5종 뒤): 입찰됨·밀림·보류·낙찰(검사 실패 = 보류)·매입 실패·주문 전환(T 번호 대행 주문 paid, PI = 그 승인)·유찰/못 넣음/운영 취소(확실할 때만 승인 해제 예약), 크론 `tomo_market_bids`(DB 판정 1분: 결제창 만료·마감 30분 전 미입찰 자동 취소·결과 지연 보류·승인 만료 이벤트)와 `tomo_market_bids_stripe`(→ `/api/cron/market-bids`, 해제·매입 재시도), 이벤트 bid.* 6종, 운영 조회·설정 함수, `can_read_client_item` 에 market_bids.
- 화면: 상세 신청 패널(`components/market-bid/MarketBidPanel.tsx`), `/bids/[id]`(결제 복귀), `/mypage/bids`, 알림 7종 ko/ja — 플래그 `NEXT_PUBLIC_MARKET_AUCTION=1` 빌드에서만. tomo 어드민 `/admin/market-bids`(입찰 필요 줄·입찰됨 기록·낙찰 처리 미리보기 + 두 번 확인·유찰·보류·못 넣음·접수 스위치·한도). 운영 API capability `market_auction`(입찰됨·밀림·보류·유찰 ops, 낙찰·못 넣음·운영 취소·설정 money), counts 4줄. 에어쉽 연결 사이트 「마켓 입찰」 화면.
- 플래그는 운영 Variables 에 없음(server-image.yml 에 전달 줄만), accepting=false. 켜기 = M6 리허설 + Ren 승인 뒤.
- Stripe 테스트 모드 로컬 한 바퀴(승인 → 입찰됨 → 낙찰 부분 매입 ₩23,595 → T000027 → 대행 취소 부분 환불 ₩10,000 done, 유찰 → PI canceled) 통과, 시험 데이터 정리.
### 2026-11-27 해외 마켓 경매 입찰 대행 M6 리허설 (docs/aaa/15 부록 「M6」 — 절차서·켜기/끄기·실제 시험 준비물 포함)
- 로컬(운영 DB·Stripe 테스트 키) 브라우저 리허설 10항목 전부 통과. 실제 입찰·실결제 없음. 플래그는 운영에 넣지 않았다(accepting=false).
- 0053_market_bid_repay(운영 적용, 되돌림 리허설 10묶음·결함 주입 4종 뒤): 매입 실패 → 48시간 재결제(kind mbp, 즉시 결제, 금액 = 매입액) → 주문 전환, 받지 않은 결제는 전액 환불, 기한 + 35분 지나면 닫고 입찰 정지. fee_jpy = 0 표 제약.
- 고침: 플래그 꺼진 화면 실제 404(proxy isFlagOffPath), 패널 배송지 접기, 「경매 · 구경만」 배지, 입찰 수 중복 문구, 제목 번역 저장, 알림 MB 번호, 선점 상품 미리 표시, 결제 복귀 문구(void/refunded), 어드민 확인창·사유·사건 이름.
- 정리: 시험 신청 8·승인 9·사건 41·정지 1·주문 2·요청 2·알림 25·활동 10·상품 4·outbox 17(전송 전 삭제), MB 번호 1부터.
### 2026-11-27 해외 마켓 경매 입찰 대행 운영 켜기 시도 (docs/aaa/15 「운영 켜기 기록」)
- 플래그 `NEXT_PUBLIC_MARKET_AUCTION=1` 운영 Variables 추가·server-image #42 배포. 패널은 운영에 보인다.
- 시험 1(실카드 승인→취소): MB000001 ₩28,469 결제창까지 갔으나 카드사 3D Secure(SMS)가 떠서 멈춤. PI …r8jKah Incomplete(청구 0). 판정: accepting=false(접수 중지), 한도는 확정값.
- 고객 FAQ·llms·AI 상담원 변경은 `docs/aaa/15-market-bid-faq.patch` 로 보관(미배포). 시험 통과 뒤 적용.
- 발견: 「입찰 필요」 마감 임박 재알림 없음(제안만, 미구현).### 2026-11-27 T4 센터 검수·센터 발송 안내·운영 띠 (docs/aaa/12 10장)
- 0054_inspections(운영 적용, 되돌림 리허설 26단언·결함 주입 2종 뒤): inspections(추가만, 정상/문제·메모·사진 10장·검수자·입고 함께), 비공개 버킷 inspection-photos(당사자 읽기·운영자 올리기), admin_record_inspection(입고 처리 함께), center_addresses(에어쉽 센터 주소 옮김, 받는 사람 TOMO)·admin_set_center_address.
- 판매자 거래 상세(국제·결제 완료) 「센터로 보내는 방법」: 주소 끝에 `TOMO TX000123`(새 매칭 코드 없음). 거래·대행 상세에 검수 기록(읽기, 서명 URL).
- 어드민: 센터 화면 직거래+대행·번호 검색·검수 입력·주소 수정, 분쟁 화면 검수 열람, 위쪽 띠(에어쉽 어드민 안내, 닫기).
- 운영 API: GET/POST `inspections/:kind/:id`, POST `…/upload`(서명 업로드 URL). 번호 검색 `opsCodeQ`. 에어쉽은 센터·대행 상세 입력, 직거래·분쟁 상세 읽기.
- 시험 데이터 전부 정리. 남은 것: 받는 사람 이름·전화(지금 TOMO·없음)는 Ren 확인 뒤 어드민 센터 화면에서 바꾼다. 판매자 안내·고객 검수 블록 화면 실측 없음.
### 2026-11-27 입찰 워커 연결 A1(에어쉽 DB) 운영 적용 (docs/aaa/16 12절)
- 에어쉽 `daa85c27` 마이그레이션 20261128100000_site_bids 운영 적용, 스위치 site_bid_bridge.enabled=false. 돈 함수 md5 불변, 분기 8곳, 리허설 ①~⑤·결함 주입 5종 통과.
- T1(tomo 0055·운영 API·크론·이벤트)은 아직. 다음 작업자 메모는 docs/aaa/16 12.3.
### 2026-11-27 입찰 워커 연결 T1(tomo) 운영 적용 (docs/aaa/16 12.4, 경로 표 docs/aaa/12 9장)
- 0055_market_bid_worker(운영 적용, 되돌림 리허설 1묶음 30여 단언 통과·결함 주입 4종 검출 뒤): 접수 확인(armed), 워커 낙찰 = 보류 `worker_won`(낙찰 확인 대기, 매입 없음), 건강 신호 표 `market_bid_worker_health` + 5분 끊기면 접수 자동 중단(실행자 airship 일 때만, 자동 재개 없음, `bid.worker_down` 1회), 크론 워커 규칙(미접수 워커 건 마감 30분 전 자동 취소, 접수된 건은 워커 비정상·결과 지연 때 보류), 재알림 `bid.to_place_due`(2·1시간 전·접수 10분 지연), 고객 취소 마감(마감 30분 전·접수된 워커 건), 시스템 주체 `site-bids@system.airship.click`(ops_actors.is_system, money 불가).
- 운영 API 워커 경로 4개(시스템 주체 전용): GET `market-bids/worker-queue`, POST `market-bids/worker-health`, POST `market-bids/:id/armed`, POST `market-bids/:id/worker-result`. 어드민 /admin/market-bids 에 실행자·워커 상태 띠·자동 중단 사유·「낙찰 확인 대기(워커)」 줄.
- 설정은 그대로: executor=manual, accepting=false. MB000001 안 건드림. 수동 전환 버튼·워커 건 고객 취소(에어쉽 동기 취소)는 T2.
