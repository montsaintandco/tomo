# TOMO 프로젝트 핸드오프 (2026-08-26, 이월 이슈 정리 반영)

한일 크로스보더 중고거래 플랫폼. Plan 01(기반)·02(상품)·03(채팅)·04(에스크로, Stripe 키 대기)·05(오픈마켓: 외부마켓 검색·대행구매) 완료 상태.

## 재개 방법

```bash
git clone https://github.com/montsaintandco/tomo.git
cd tomo
npm install
npm run dev   # http://localhost:3000
npm test      # vitest 35개 통과해야 정상
```

`.env.local`은 gitignore라 직접 생성 (둘 다 공개값 — anon key는 RLS로 보호됨):

```
NEXT_PUBLIC_SUPABASE_URL=https://zftztnkczlblnkgaijzc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmdHp0bmtjemxibG5rZ2FpanpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1ODc3ODMsImV4cCI6MjEwMDE2Mzc4M30.uRRfCrw71ZqA8mkjH9UJ0OW55aeQ362xX3N2Xo17GPI
```

Node 18+ 필요.

## 인프라

- Supabase: 프로젝트 `tomo` (id `zftztnkczlblnkgaijzc`, 서울 리전, seoulbuy 조직 — 이든에이치 계정)
  - 마이그레이션 13개 적용 완료 (`supabase/migrations/` = DB 실제 상태와 일치. 0011 external_items, 0012 proxy_requests, 0013 storage own-folder delete)
  - Auth: 이메일 확인 꺼짐(개발용)
- 테스트 계정: `tomo.test.alice@gmail.com`(한국/서울 마포구), `tomo.test.bob@gmail.com`(일본/신주쿠), `tomo.test.center@gmail.com`(센터 admin, is_admin=true) — 비밀번호 모두 `test-pass-1234`
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
