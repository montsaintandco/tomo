# TOMO 프로젝트 핸드오프 (2026-07-21)

한일 크로스보더 중고거래 플랫폼. Plan 01(기반)·Plan 02(상품)·Plan 03(채팅) 완료 상태.

## 재개 방법

```bash
# tomo-project.zip 압축 해제 후
cd tomo
npm install
npm run dev   # http://localhost:3000
npm test      # vitest 30개 통과해야 정상
```

`.env.local`은 zip에 포함되어 있음 (Supabase URL + anon key). Node 18+ 필요.

## 인프라

- Supabase: 프로젝트 `tomo` (id `zftztnkczlblnkgaijzc`, 서울 리전, seoulbuy 조직 — 이든에이치 계정)
  - 마이그레이션 9개 적용 완료 (`supabase/migrations/` = DB 실제 상태와 일치)
  - Auth: 이메일 확인 꺼짐(개발용)
- 테스트 계정: `tomo.test.alice@gmail.com`(한국/서울 마포구), `tomo.test.bob@gmail.com`(일본/신주쿠), `tomo.test.center@gmail.com`(센터 admin, is_admin=true) — 비밀번호 모두 `test-pass-1234`
- 데모 상품 4건 시드됨. 재시드: `npx tsx scripts/seed-demo.ts` (멱등)

## 완료된 것

- 인증·온보딩(국가/지역/언어), 전 테이블 RLS + 권한상승 차단, 신뢰온도 스키마
- 상품 등록(이미지 업로드 + 자동번역 훅) / 피드(전체·내동네·해외직구 탭, 환산가) / 상세(원문 토글) / 검색(한일 양방향)
- 채팅: 구매자↔판매자 1:1 실시간(Supabase Realtime) + 발송 시점 메시지 자동번역·저장, 번역 말풍선(원문 언어색)+원문 토글, `/chat` 목록·`/chat/[id]` 채팅방. 참여자만 열람 RLS
- 에스크로 DB 계층(Plan 04 Task 1): 상태머신 SECURITY DEFINER 함수(start/advance/mark_paid/attach_payment_intent/submit_review) + 예약 lazy-expiry + 수수료 10% + 후기→신뢰온도. 직접 쓰기 차단, 함수 EXECUTE는 authenticated 한정(0009). 마이그레이션 0008·0009
- 에스크로 UI(Plan 04 Task 4·5·6): `/transactions/[id]`(타임라인·금액·운송장·역할별 액션), `/admin/center`(admin SELECT RLS 0010, 센터별 입고/발송 큐), `/profile/[id]`(하트게이지·상품·받은 후기, `me` 별칭), 상세 안전결제 버튼(키 없으면 graceful)

## 남은 로드맵

1. **키 3종 넣고 Stripe 라이브 테스트**: 코드는 작성 완료(`lib/stripe.ts`, `/api/checkout`, `/api/stripe/webhook`, `lib/supabase/admin.ts`) — 전부 키 없으면 503 graceful. `.env.local`에 `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`SUPABASE_SERVICE_ROLE_KEY` 추가 후 `stripe listen --forward-to localhost:3000/api/stripe/webhook`로 테스트카드 결제→`paid`→listing `sold` 확인. Stripe 대시보드에 webhook 엔드포인트 등록도 필요(배포 후)
2. 배포: Vercel + 폰트 복원(Cafe24 써라운드/M PLUS Rounded — 샌드박스 문제로 제거됨, layout.tsx에 재적용. next/font/google은 빌드시 폰트 fetch — Vercel에선 정상)

## 필요한 키 (아직 없음)

- `ANTHROPIC_API_KEY` — 실번역 작동용 (없으면 "번역 준비 중" 표시, 오류 아님)
- `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` (테스트 모드) — Plan 04에서
- Supabase `service_role` 키 — Plan 04 웹훅에서 (대시보드 → Project Settings → API Keys)

## 주의사항 / 이월된 마이너 이슈

- API 라우트는 미들웨어 보호 밖 (자체 인증 필수 — /api/listings 참고)
- 구매자발 상태 전이는 반드시 SECURITY DEFINER DB 함수로 (listings UPDATE RLS가 셀러 전용)
- RLS 서브쿼리 교훈: WITH CHECK 안 서브쿼리에서 unqualified 컬럼은 서브쿼리 테이블로 바인딩됨. 삽입 대상 행 컬럼은 반드시 `테이블명.컬럼` 으로 한정할 것 (0006→0007 정책 버그 수정 사례)
- 이월: 피드 쿼리 에러 표시, 고아 이미지 정리, 폼 a11y 라벨, 로그인 signIn→signUp 폴스루 UX
- 상세 내역: 저장소 내 `.superpowers/sdd/progress.md` (전체 진행 레저)

## 문서

- `2026-07-17-tomo-design-spec.md` — 제품 설계 스펙 (승인본)
- `2026-07-17-tomo-plan-01-foundation.md`, `2026-07-21-tomo-plan-02-listings.md`, `2026-07-21-tomo-plan-03-chat.md` — 실행 완료된 구현 플랜
- `2026-07-21-tomo-plan-04-escrow.md` — 실행 플랜. Task 1(마이그레이션) 완료, Task 7 부분(상태머신·수수료·RLS 테스트) 완료. Task 2~3(Stripe·webhook) 키 대기, Task 4~6(UI) 키 없이 선행 가능
- 브랜드: 토모 TOMO — 말풍선 두 개(블루=한국, 핑크=일본) 겹침에서 하트. 카와이 컨셉

## Claude에서 이어서 작업하려면

새 세션에서 이 폴더를 연결하고: "TOMO 프로젝트 이어서. HANDOFF.md와 .superpowers/sdd/progress.md 읽고 Plan 04 Task 2~3(Stripe 결제·webhook) 진행". 키 3종(STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET/SUPABASE_SERVICE_ROLE_KEY) 먼저 `.env.local`에 추가 필요. 키 없으면 배포(Vercel+폰트)부터.
