# TOMO 프로젝트 핸드오프 (2026-07-21)

한일 크로스보더 중고거래 플랫폼. Plan 01(기반)·Plan 02(상품) 완료 상태.

## 재개 방법

```bash
# tomo-project.zip 압축 해제 후
cd tomo
npm install
npm run dev   # http://localhost:3000
npm test      # vitest 13개 통과해야 정상
```

`.env.local`은 zip에 포함되어 있음 (Supabase URL + anon key). Node 18+ 필요.

## 인프라

- Supabase: 프로젝트 `tomo` (id `zftztnkczlblnkgaijzc`, 서울 리전, seoulbuy 조직 — 이든에이치 계정)
  - 마이그레이션 5개 적용 완료 (`supabase/migrations/` = DB 실제 상태와 일치)
  - Auth: 이메일 확인 꺼짐(개발용)
- 테스트 계정: `tomo.test.alice@gmail.com`(한국/서울 마포구), `tomo.test.bob@gmail.com`(일본/신주쿠) — 비밀번호 `test-pass-1234`
- 데모 상품 4건 시드됨. 재시드: `npx tsx scripts/seed-demo.ts` (멱등)

## 완료된 것

- 인증·온보딩(국가/지역/언어), 전 테이블 RLS + 권한상승 차단, 신뢰온도 스키마
- 상품 등록(이미지 업로드 + 자동번역 훅) / 피드(전체·내동네·해외직구 탭, 환산가) / 상세(원문 토글) / 검색(한일 양방향)
- 에스크로 상태머신·센터(서울/나리타) 스키마 정의 (구현은 Plan 04)

## 남은 로드맵

1. **Plan 03 — 채팅**: Supabase Realtime + 메시지 자동번역 (다음 순서)
2. **Plan 04 — 에스크로 거래**: Stripe 테스트 모드, 상태머신 SECURITY DEFINER 함수, 센터 관리 화면(/admin/center), 후기→신뢰온도
3. 배포: Vercel + 폰트 복원(Cafe24 써라운드/M PLUS Rounded — 샌드박스 문제로 제거됨, layout.tsx에 재적용)

## 필요한 키 (아직 없음)

- `ANTHROPIC_API_KEY` — 실번역 작동용 (없으면 "번역 준비 중" 표시, 오류 아님)
- `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` (테스트 모드) — Plan 04에서
- Supabase `service_role` 키 — Plan 04 웹훅에서 (대시보드 → Project Settings → API Keys)

## 주의사항 / 이월된 마이너 이슈

- API 라우트는 미들웨어 보호 밖 (자체 인증 필수 — /api/listings 참고)
- 구매자발 상태 전이는 반드시 SECURITY DEFINER DB 함수로 (listings UPDATE RLS가 셀러 전용)
- 이월: 피드 쿼리 에러 표시, 고아 이미지 정리, 폼 a11y 라벨, 로그인 signIn→signUp 폴스루 UX
- 상세 내역: 저장소 내 `.superpowers/sdd/progress.md` (전체 진행 레저)

## 문서

- `2026-07-17-tomo-design-spec.md` — 제품 설계 스펙 (승인본)
- `2026-07-17-tomo-plan-01-foundation.md`, `2026-07-21-tomo-plan-02-listings.md` — 실행 완료된 구현 플랜
- 브랜드: 토모 TOMO — 말풍선 두 개(블루=한국, 핑크=일본) 겹침에서 하트. 카와이 컨셉

## Claude에서 이어서 작업하려면

새 세션에서 이 폴더를 연결하고: "TOMO 프로젝트 이어서. HANDOFF.md와 .superpowers/sdd/progress.md 읽고 Plan 03(채팅) 작성부터 시작해줘"
