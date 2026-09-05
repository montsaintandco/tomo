---
name: TOMO
description: Korea–Japan secondhand market. v3 "정제된 마켓" — white ground, neutral grays, one accent blue, photos lead, text wordmark, Noto Sans KR/JP. Kawaii brand signature retired 2026-09-05.
colors:
  white: "#FFFFFF"
  ink: "#111827"
  ink-soft: "#6B7280"
  ink-faint: "#9CA3AF"
  accent: "#1D4ED8"
  danger: "#DC2626"
  tint: "#F5F5F7"
  well: "rgba(17, 24, 39, 0.05)"
  chip: "#F3F4F6"
  accent-tint: "#EEF2FF"
typography:
  wordmark:
    fontFamily: "Noto Sans KR, Noto Sans JP, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    letterSpacing: "-0.04em"
  section-title:
    fontFamily: "Noto Sans KR, Noto Sans JP, -apple-system, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.25
  row-title:
    fontFamily: "Noto Sans KR, Noto Sans JP, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.375
  price:
    fontFamily: "Noto Sans KR, Noto Sans JP, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 700
  body:
    fontFamily: "Noto Sans KR, Noto Sans JP, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Noto Sans KR, Noto Sans JP, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  meta:
    fontFamily: "Noto Sans KR, Noto Sans JP, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  micro:
    fontFamily: "Noto Sans KR, Noto Sans JP, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 600
rounded:
  chip: "4px"
  card: "8px"
  thumb: "8px"
  button: "8px"
  chat: "14px"
  pill: "9999px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  section: "32px"
motion:
  ease-out: "cubic-bezier(0.23, 1, 0.32, 1)"
  ease-in-out: "cubic-bezier(0.77, 0, 0.175, 1)"
  ease-drawer: "cubic-bezier(0.32, 0.72, 0, 1)"
  fast: "160ms"
  base: "220ms"
  sheet: "320ms"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#FFFFFF"
    rounded: "{rounded.button}"
    padding: "10px 24px"
  button-structure:
    backgroundColor: "{colors.ink}"
    textColor: "#FFFFFF"
    rounded: "{rounded.button}"
  card:
    backgroundColor: "#FFFFFF"
    rounded: "{rounded.card}"
    shadow: "0 1px 2px rgba(17,24,39,.04), 0 4px 14px rgba(17,24,39,.06)"
  country-chip:
    backgroundColor: "{colors.chip}"
    textColor: "#374151"
    rounded: "{rounded.chip}"
  input-search:
    backgroundColor: "{colors.tint}"
    rounded: "{rounded.pill}"
---

# Design System: TOMO (v3 — 정제된 마켓)

## Overview

**Creative North Star: "사진과 가격이 주인공, 인터페이스는 물러선다."** 2026-09-05에 카와이 브랜드 시그니처(파스텔 블루/핑크 나라색, 하트-O 워드마크, 두 말풍선 심볼, 써라운드 서체, 말풍선 꼬리 칩, 하트 게이지, 스쿼시·하트비트 모션)를 전부 폐기했다. 남은 것은 이름 TOMO와 제품 사실뿐이고, 비주얼은 Apple·메루카리급 절제로 다시 세웠다: 흰 바탕, 중립 회색 잉크, **단 하나의 액센트(딥 블루)**, 8px 라운드, 텍스트 워드마크, Noto Sans KR/JP.

토큰 클래스명은 v2를 유지한 채 값만 바꿨다(`tomo-navy`=잉크/구조, `tomo-coral-deep`=액센트, `tomo-rose`=오류, `tomo-ivory`=틴트, `tomo-blue`/`tomo-pink`=중립 필). 코드에 남은 이름은 역사이고, 화면에 보이는 색이 진실이다.

## Colors

- **White** 페이지·카드·헤더. **Tint `#F5F5F7`** 검색 입력·신뢰 스트립·푸터 — 틴트로만, 페이지 배경 아님.
- **Ink `#111827`** 본문·제목·가격·활성 탭 필(흰 글자)·구조 버튼. 웰·헤어라인·스크림은 잉크의 5/10/60~75% 틴트.
- **Accent `#1D4ED8`** 단일 액센트 — 주요 CTA·링크·활성 상태·판매 FAB·찜 채움·후기 하트·신뢰 게이지 바·내 채팅 말풍선(10% 틴트)·크로스보더 강조 필(`#EEF2FF`). 한 화면에 액센트 CTA는 하나.
- **Danger `#DC2626`** 오류·분쟁·파괴적 액션·정지.
- **나라는 색이 아니라 글자**: `KR`/`JP` 중립 칩(`#F3F4F6` 위 `#374151`, 4px). 채팅 말풍선은 언어가 아니라 나/상대로 구분(내 것 액센트 틴트, 상대 잉크 5%).

**Named Rules** — *One Accent*: 액센트는 한 색, 행동·활성·소유(내 것)에만. *No Nation Color*: 국가·언어를 색으로 표시하지 않는다. *Tint Is Not Ground*: 틴트는 필드 3곳에만.

## Typography

Noto Sans KR/JP 가변, `next/font`로 셀프호스팅(CDN 없음). `html[lang]`으로 분기 — 한글은 KR, 일본어는 JP(가나·한자 자형이 맞는 쪽). 워드마크는 같은 서체 700 + `-0.04em`. **굵기는 세 단 400/600/700**: 본문 400, 라벨·섹션 제목·버튼 600, 가격·헤드라인·워드마크 700. 800 이상은 쓰지 않는다 — Tailwind `font-bold`=600, `font-extrabold`=700으로 리매핑되어 클래스명은 역사, 값이 진실. 본문 최대 17px, 히어로 헤드라인 26/34px. 큰 헤딩 자간 `-0.015em`, 본문 0. 한글은 `word-break: keep-all`(단어 단위 줄바꿈), 일본어는 기본.

## Shapes & Depth

카드·썸네일·버튼 8px, 칩 4px, 채팅 말풍선 14px(화자 쪽 하단 4px), 검색 입력·세그먼트 탭·뱃지는 풀라운드. 깊이는 흰 카드 위 중립 섀도우 한 단계(`--shadow-soft`), 보더 없음. 그리드 카드는 섀도우 없이 썸네일이 면.

## Motion (v3)

토큰 `--ease-out` `--ease-in-out` `--ease-drawer`, `--dur-fast 160ms` `--dur-base 220ms` `--dur-sheet 320ms`. 오버슈트 없음. 프레스 `:active scale(0.97)` 160ms ease-out(pointer-down 즉시). hover 리프트·썸네일 확대는 `(hover: hover) and (pointer: fine)`에서만(`fine:`), 200ms. 바텀시트 `dialog.sheet`는 모바일 `translateY(100%)→0` 320ms 드로어 커브, 데스크톱 `scale(.97)+opacity` 220ms, 퇴장 미러, 백드롭 페이드. 펼침 패널 `.reveal` 160ms. 찜 하트 `.pop` 220ms(드문 딜라이트). **상시 모션 없음.** `prefers-reduced-motion`은 이동·변형만 제거하고 색·불투명도 150ms 유지. `prefers-reduced-transparency`면 반투명 크롬 불투명.

## Brand Primitives

`Wordmark` 텍스트 "TOMO". `TomoSymbol` 이름은 남았지만 이제 중립 사진 자리 글리프(빈 상태·이미지 없음). `CountryChip` KR/JP 텍스트 칩. `HeartGauge` 이름은 남았지만 숫자 + 액센트 바.

## Surfaces

홈 허브(신뢰 스트립 → 상대국 인기 → 국내 그리드 → 팔기 → 여행 직거래 → 푸터), 메루카리 골격 상세(제목→가격+배송주석→설명→정보 표→판매자→안심거래→하단 가격+구매 바), 해외직구, 여행 직거래(`/travel`), 채팅, 거래, 마이페이지, 하이브리드 PWA 셸(브라우저=상단 GNB, 설치=하단 탭바). 운영 콘솔(`/admin`)은 별도 세계(`.admin` 스코프, Linear 참조) — 중립 회색·1px 헤어라인·13px·6px.

## Do / Don't

- **Do** 사진을 크게, 크롬을 얇게. 액센트는 행동에만.
- **Do** 나라는 KR/JP 글자로. 채팅은 나/상대로.
- **Don't** 파스텔·그라데이션·장식 하트·말풍선 꼬리·써라운드·바운스 모션을 되살리지 않는다.
- **Don't** 17px보다 큰 본문 헤딩, 11px보다 작은 텍스트, 상시 애니메이션.
