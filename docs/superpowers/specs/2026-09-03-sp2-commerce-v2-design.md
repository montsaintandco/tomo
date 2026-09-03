# SP2 — 커머스 표면 v2 (상품 상세 · /global · 외부상품 상세)

날짜: 2026-09-03 · 상태: 승인(사용자 사전 결정 반영) · 범위: 앱 전체 재디자인 4개 중 2번. SP1의 토큰·컴포넌트·i18n 사전을 상속한다.

## 결정 사항

| 항목 | 결정 |
|---|---|
| 우선 관점 | 한국 구매자 우선(구매자 통화가 큰 숫자), 일본어 뷰어도 같은 규칙으로 뒤집힘 |
| 브랜드 | 유지. v2 규칙(One-Role·Bridge·Ivory-Is-Tint·17-Ceiling) 그대로 |
| 타이포 하한 | 10px 전부 11px |
| 문자열 | 하드코딩 한국어/병기 전부 `t(lang, key)`로. 두 언어 병기는 폐기(One-Tongue) |
| 레이아웃 | 기존 반응형 골격(모바일 단일 컬럼·데스크톱 2컬럼/6xl 그리드) 유지 |

## 1. 상품 상세 `app/listings/[id]/page.tsx`

- 이미지 컬럼: 그대로(스와이프·카운터). 카운터 11px. 뒤로가기 aria i18n.
- 판매자 카드 `.card`: 아바타 `bg-tomo-blue/25`는 국가 칩이 아니므로 `bg-tomo-navy/5` + 네이비 700 이니셜(Pretendard, 써라운드 제거). 온도 필(모바일)은 `bg-tomo-navy/5` 네이비 11px/700 — 핑크 필은 나라 신호라 폐기. 데스크톱 HeartGauge 유지.
- 제목 17px/700 ink(`OriginalToggle`). 원문/번역 토글은 `bg-tomo-navy/5` 네이비 필 13px/700, 라벨 i18n.
- 가격: **구매자 통화 17px/800 tnum**("약 …"), 해외면 원가 12px/700 ink-soft 병기. 써라운드 금지.
- 안내: 채팅 말풍선·블루 틴트·브리지 배경 전부 폐기 → `rounded-card bg-tomo-navy/5 p-3.5` 웰 + 네이비 700 리드 + 13px ink 본문. 여행 직거래는 웰 위에 `.grad-bridge-soft` 뱃지(`card.travel`)만.
- 상태(예약중/거래완료) 웰 i18n. CTA 바(모바일 고정·데스크톱 흐름) 유지, 버튼 라벨 i18n(`ChatButton`·`CheckoutButton`에 `lang`).
- `HeartGauge`: 숫자 Pretendard 17px/800 코랄딥(써라운드 제거), 라벨 i18n, 눈금 11px.

## 2. 해외직구 `/global`

- 헤더 `bg-white/95`(아이보리 배경 폐기). h1 17px/800 ink + 12px ink-soft 서브(`SectionHeader` 규격). 로그인 링크 i18n.
- 검색: `bg-tomo-ivory` 틴트, **16px 입력**, 지우기 ×(홈과 동일 마크업), 플레이스홀더 i18n.
- 소스 탭: `py-2.5`(44px), 라벨 i18n(`source.*` 키 신설, `SOURCE_LABEL`은 한국어 폴백으로 유지), "준비중" i18n.
- "번역해서 찾았어요" 12px i18n. 빈 상태 i18n. 그리드·`ExternalItemCard` 변경 없음.

## 3. 외부상품 상세 `app/global/[source]/[id]/page.tsx`

- 이미지 컬럼: 상품 상세와 같은 골격(데스크톱 sticky `rounded-card shadow-soft`). 모바일은 첫 이미지 정사각 + 나머지 세로.
- 뱃지 행: 소스(네이비 필)·입찰중(코랄딥)·품절(navy/70) 11px/700 흰 글자, i18n.
- 제목 17px/700 ink(원문 `lang` 속성). 가격 **구매자 통화 17px/800** + 원가 12px/700 ink-soft, 경매면 "현재가" 12px ink-faint 안내 i18n.
- 예상 금액표: `rounded-card bg-tomo-navy/5`(아이보리 폐기) 13px, 합계 행 헤어라인 `border-tomo-navy/10`, 총액 네이비 800 tnum, 주의 문구 11px ink-faint. 전 라벨 i18n.
- 판매자·상태·부가정보 `.card` 12px ink-soft. 캐시 폴백 안내 웰 i18n. 원본 링크 12px ink-soft underline.
- CTA: 로그인/품절/대행 신청 라벨 i18n(`ProxyRequestButton`에 `lang`).

## 4. i18n 추가 키

`detail.*`(뒤로가기·사진 수·신뢰온도·기본온도·원문/번역 토글·번역 준비 중·여행 직거래 안내·해외 상품 안내·센터명·예약중/거래완료·로그인 CTA·채팅·연결 중·안전결제·결제 준비 중·결제 실패), `global.*`(제목·서브·검색 라벨·플레이스홀더·전체·준비중·번역 검색어·빈 상태 4종), `source.*` 4종, `ext.*`(예상 금액표 7종·판매자·상태·캐시 안내·원본 열기·로그인 CTA·품절 CTA·현재가 안내·대행 신청·신청 중·준비 중·신청 실패). `tests/i18n.test.ts`가 완전성·번역 여부를 검사한다.

## 범위 밖

채팅·거래·프로필(SP3), 폼·어드민(SP4), 이미지 갤러리 확대, 가격 히스토리, 찜.
