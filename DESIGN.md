---
name: TOMO
description: Korea–Japan secondhand market where two speech bubbles meet and make a heart — brand pinned, applied with mature-marketplace restraint.
colors:
  white: "#FFFFFF"
  tomo-ivory: "#FBF9F4"
  ink: "#26333F"
  ink-soft: "#5C6B77"
  ink-faint: "#93A0AB"
  tomo-blue: "#9CC5EC"
  tomo-pink: "#F2AFAF"
  tomo-coral: "#E2807F"
  tomo-coral-deep: "#C14E4C"
  tomo-navy: "#0C447C"
  tomo-rose: "#A34543"
typography:
  display:
    fontFamily: "Cafe24Ssurround, Pretendard, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    letterSpacing: "0"
  section-title:
    fontFamily: "Pretendard, -apple-system, sans-serif"
    fontSize: "17px"
    fontWeight: 800
    lineHeight: 1.25
  card-title:
    fontFamily: "Pretendard, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.375
  row-title:
    fontFamily: "Pretendard, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.375
  price:
    fontFamily: "Pretendard, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 800
  price-row:
    fontFamily: "Pretendard, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 800
  body:
    fontFamily: "Pretendard, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Pretendard, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 700
  meta:
    fontFamily: "Pretendard, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  micro:
    fontFamily: "Pretendard, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 700
rounded:
  chip-tail: "9px"
  chip-tail-cut: "2px"
  focus: "6px"
  thumb: "10px"
  card: "12px"
  chat: "18px"
  full: "9999px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.tomo-coral-deep}"
    textColor: "#FFFFFF"
    rounded: "{rounded.full}"
    padding: "10px 24px"
  button-navy:
    backgroundColor: "{colors.tomo-navy}"
    textColor: "#FFFFFF"
    rounded: "{rounded.full}"
    padding: "10px 24px"
  card:
    backgroundColor: "#FFFFFF"
    rounded: "{rounded.card}"
  thumb:
    backgroundColor: "rgba(12, 68, 124, 0.05)"
    rounded: "{rounded.thumb}"
  trust-strip:
    backgroundColor: "{colors.tomo-ivory}"
    rounded: "{rounded.card}"
    padding: "12px 8px"
  footer:
    backgroundColor: "{colors.tomo-ivory}"
    rounded: "{rounded.card}"
    padding: "20px 16px"
  chip-bubble-kr:
    backgroundColor: "rgba(156, 197, 236, 0.35)"
    textColor: "{colors.tomo-navy}"
    padding: "2px 6px"
  chip-bubble-jp:
    backgroundColor: "rgba(242, 175, 175, 0.38)"
    textColor: "{colors.tomo-rose}"
    padding: "2px 6px"
  pill-safe-pay:
    backgroundColor: "rgba(12, 68, 124, 0.05)"
    textColor: "{colors.tomo-navy}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  badge-travel-deal:
    backgroundColor: "linear-gradient(115deg, rgba(156,197,236,0.28), rgba(242,175,175,0.28))"
    textColor: "{colors.tomo-navy}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  tab-active:
    backgroundColor: "{colors.tomo-navy}"
    textColor: "#FFFFFF"
    rounded: "{rounded.full}"
    padding: "10px 14px"
  input-search:
    backgroundColor: "{colors.tomo-ivory}"
    rounded: "{rounded.full}"
    padding: "10px 16px 10px 40px"
---

# Design System: TOMO (v2)

## Overview

**Creative North Star: "브랜드는 그대로, 마켓은 어른스럽게" — 두 말풍선이 만나 하트가 되는 브랜드를, 당근·메루카리급 성숙한 마켓플레이스의 절제로 입힌다.**

v1은 파스텔을 사방에 칠한 카와이 세계였다. v2는 브랜드(하트 O 워드마크, 말풍선 칩, 블루/핑크/코랄/네이비/아이보리)를 핀 고정한 채, 색을 **역할**에 묶는다. 페이지는 흰 종이. 네이비가 제목·활성·구조를 잡고, 코랄딥이 유일한 행동의 목소리다. 블루와 핑크는 나라를 말할 때(국가 칩, 채팅 말풍선)만 나온다. 블루→핑크 브리지 그라데이션은 여행 직거래 뱃지 딱 하나에만 남는다. 아이보리는 종이가 아니라 **틴트**다 — 신뢰 스트립, 푸터, 검색 입력.

신뢰는 장식이 아니라 시스템이다. 홈 첫 화면의 TrustStrip은 사실 세 가지(에스크로·센터 검수·자동번역)만 말하고, 판매중 행마다 안전결제 마이크로 필이 붙으며, 푸터는 사업자·약관 자리를 "준비 중"으로 정직하게 비워 둔다. 수치·후기·실적은 존재하지 않으므로 어디에도 쓰지 않는다.

**Key Characteristics:**
- 흰 페이지 + 네이비 틴트 잉크 스케일. 무채색 회색 없음, 아이보리는 틴트로만
- 네이비 = 구조, 코랄딥 = 행동, 블루/핑크 = 나라. 색마다 역할이 하나
- 카드 12px · 썸네일 10px · 필은 풀라운드. 카드는 보더 없이 `--shadow-soft` 한 단계
- 유일 상시 모션은 워드마크 하트비트. 캐러셀은 네이티브 scroll-snap
- 가격이 가장 굵다 (800, tabular). 제목은 400

## Colors

브랜드 팔레트는 v1과 동일하게 핀 고정(토모 블루 #9CC5EC / 핑크 #F2AFAF / 코랄 #E2807F / 코랄딥 #C14E4C / 아이보리 #FBF9F4 / 네이비 #0C447C). 바뀐 것은 색의 **배치 권한**이다.

### Surface
- **White** (#FFFFFF): 페이지 배경(`body.bg-white`, theme-color #FFFFFF), 카드, 헤더(`bg-white/95 backdrop-blur`), 하단 내비.
- **Tomo Ivory** (#FBF9F4): 틴트 전용 — TrustStrip 필드, SiteFooter 필드, 검색 입력 필. 페이지 배경이나 카드 배경으로 쓰지 않는다.

### Structure
- **Tomo Navy** (#0C447C): 워드마크 텍스트, 섹션 헤더의 "더보기 →" 링크, 활성 탭 필(흰 글자), 활성 내비 텍스트, TrustStrip 아이콘·라벨, 안전결제 필 텍스트, 여행 직거래 뱃지 텍스트, 구조 버튼(로그인·재시도). 모든 틴트 웰과 헤어라인은 `tomo-navy/5`, 스크림은 `tomo-navy/60~75`, 섀도우 색도 네이비다.

### Action
- **Tomo Coral Deep** (#C14E4C): 단 하나의 CTA 목소리 — 주요 버튼, 판매 FAB, 경매 "입찰중" 뱃지, 캐럿, 포커스 링. 흰 글자를 얹는다.
- **Tomo Coral** (#E2807F): 장식 하트 전용 — 워드마크 하트, TomoSymbol 하트, 여행 직거래 뱃지의 하트 글리프. 버튼 필로 쓰지 않는다.

### Nation
- **Tomo Blue** (#9CC5EC): 한국의 목소리. `.bubble-kr` 칩 필(35%), 한국어 채팅 말풍선(40%), 활성 내비 아이콘 필(30%), 텍스트 선택(45%).
- **Tomo Pink** (#F2AFAF): 일본의 목소리. `.bubble-jp` 칩 필(38%), 일본어 채팅 말풍선(45%).
- **Tomo Rose** (#A34543): 핑크 필드 위의 딥 텍스트(JP 칩, 일본어 채팅, 오류 텍스트).

### Neutral (navy-tinted ink)
- **Ink** (#26333F): 본문·제목·가격.
- **Ink Soft** (#5C6B77): 메타(지역·시간), 서브 카피, 플레이스홀더, 비활성 내비.
- **Ink Faint** (#93A0AB): 거래완료 행의 제목·가격, 경매 보조 문구, 푸터 법적 문구, 검색 아이콘 스트로크. 본문에는 쓰지 않는다.

### Named Rules
**The One-Role Rule.** 색마다 역할이 하나다. 네이비=구조·활성, 코랄딥=행동, 블루/핑크=나라, 아이보리=틴트. 한 화면에서 같은 색이 두 역할을 맡으면 위계가 무너진다.
**The Bridge Rule (v2).** 블루→핑크 그라데이션(`.grad-bridge-soft`)은 여행 직거래 뱃지("여행 중 직거래 가능") 한 곳에만 등장한다. 배너·카드·헤더 배경으로 확장하지 않는다.
**The Ivory-Is-Tint Rule.** 아이보리는 흰 페이지 위에서 "이 영역은 다른 성격"임을 알리는 틴트다. TrustStrip·SiteFooter·검색 입력 세 곳이 전부이며, 페이지·카드 배경으로 되돌리지 않는다.
**The No-Gray Rule.** 무채색 회색은 없다. 모든 중립·보더·섀도우·스크림·스크롤바는 네이비 틴트(`rgba(12,68,124,…)`)이고, 스켈레톤은 웜 아이보리로 시머한다.
**The Deep-Ink-On-Tint Rule.** 파스텔 필드 위에 파스텔 글자를 얹지 않는다. 블루 위엔 네이비, 핑크 위엔 로즈, 흰 글자는 코랄딥·네이비 필 위에서만.

## Typography

**Display Font:** Cafe24 Ssurround (`.font-brand`) — **워드마크 전용**. 섹션 제목·가격·본문 어디에도 쓰지 않는다.
**Body Font:** Pretendard variable 300–800 (-apple-system, Hiragino Kaku Gothic ProN, Yu Gothic 폴백 — 일본어 글리프 포함)

**Character:** 위계는 크기보다 **굵기 점프**(400 → 700 → 800)와 1–2px의 작은 크기 단계로 세운다. 가장 큰 본문 단계가 17px이다.

### Hierarchy (Pretendard)
- **Section Title** (800, 17px, leading-tight): SectionHeader `h2`. 홈 허브의 유일한 헤딩 단계.
- **Row Title** (400, 15px, leading-snug): 피드 행(ListingRow) 제목, 2줄 클램프.
- **Card Title** (400, 13px, leading-snug): 그리드·캐러셀 카드(ListingCard, ExternalItemCard) 제목, 2줄 클램프.
- **Price** (800, 15px, `.tnum`): 카드 가격. 피드 행은 16px/800. 해외 상품은 구매자 통화 환산이 크게, 원가는 12px/700 ink-soft로 작게.
- **Body** (400, 14px, relaxed): 빈 상태·안내 카피, 버튼 라벨(`text-sm`).
- **Label** (700, 13px): 세그먼트 탭, "더보기 →" 링크.
- **Meta** (400, 12px): 지역·시간, 섹션 서브 카피, 푸터 본문. TrustStrip 라벨은 12px/700 네이비.
- **Micro** (700, 11px): 국가 칩, 안전결제 필, 여행 직거래 뱃지, 소스·경매 뱃지, 내비 캡션. (v1의 10px 단계는 폐기 — 11px이 하한.)
- **Display** (Cafe24, 700): 워드마크만. 헤더 `text-2xl`, 푸터 `text-lg`.

### Named Rules
**The Price-Loudest Rule.** 모든 상거래 표면에서 가격이 가장 굵다(800, tabular-nums). 제목은 400을 지킨다. 해외 상품이면 구매자 통화 숫자가 큰 쪽이다.
**The 17-Ceiling Rule.** Pretendard의 최대 단계는 17px/800 섹션 타이틀이다. 더 큰 헤딩이 필요하면 그건 워드마크(Cafe24)의 자리이지 본문 서체의 자리가 아니다.
**The One-Tongue-Per-Viewer Rule.** UI는 뷰어 언어 하나로 말한다(`lib/i18n.ts`, `t(lang, key)`). 게스트 언어는 `tomo_lang` 쿠키 → Accept-Language 순으로 정하고, 헤더의 KR/JP 말풍선 토글(`LangToggle`)이 언어·나라·통화·인기 마켓을 한 번에 뒤집는다. 두 언어 병기는 워드마크 태그라인·메타 타이틀처럼 나라를 잇는 문장에만 남긴다.
**The Two-Sided Home Rule.** 홈은 어느 나라에서 열어도 "사기(상대국 인기)"와 "팔기(상대국 사람들이 내 나라에서 찾는 것)" 양면을 보여준다. 팔기 칩은 상대국 말풍선 색(KR 뷰어→핑크, JP 뷰어→블루)을 쓴다.

## Layout

`max-w-md` 단일 모바일 컬럼, `px-4` 가터, 고정 하단 내비와 `pb-24` 본문 여백. 헤더는 sticky `bg-white/95 backdrop-blur`. 홈 허브의 리듬은 **섹션 간 32px(`mt-8`)**, 섹션 헤더 아래 12px(`mb-3`), 카드 내부 6px(`mt-1.5`)·2px(`mt-0.5`). 2열 그리드는 `gap-x-3 gap-y-5`(12/20px), 캐러셀은 `gap-3` 140px 카드가 `-mx-4 px-4`로 가터를 뚫고 나간다. 피드 행은 96px 정사각 썸 + `py-3.5` + `border-tomo-navy/5` 헤어라인. 라이트 모드 고정(`color-scheme: light`, theme-color #FFFFFF).

## Elevation & Depth

깊이는 흰 페이지 위 흰 카드에 네이비 틴트 섀도우 한 단계로 만든다. 카드에 보더를 두지 않는다. 평면 요소(행·칩·썸 웰)는 `tomo-navy/5` 헤어라인과 틴트 웰로 분리한다. 그리드·캐러셀 카드(ListingCard, ExternalItemCard)는 섀도우 없이 `.press`만 — 카드가 아니라 **썸네일이 면**이다.

### Shadow Vocabulary
- **Soft** (`--shadow-soft`: `0 1px 2px rgba(12,68,124,0.05), 0 4px 16px rgba(12,68,124,0.07)`): `.card` 휴지 상태, 활성 탭.
- **Lift** (`--shadow-lift`: `0 2px 6px rgba(12,68,124,0.09), 0 12px 28px rgba(12,68,124,0.11)`): `a.card`/`button.card` hover, `translateY(-1px)` 동반.
- **Float** (`--shadow-float`: `0 3px 8px rgba(193,78,76,0.16), 0 8px 20px rgba(12,68,124,0.10)`): 판매 FAB 전용. v1 대비 절반 강도의 코랄 헤일로.

### Named Rules
**The Tinted-Shadow Rule.** 모든 섀도우는 네이비 틴트(FAB는 코랄 추가). 순수 검정 rgba 섀도우는 존재하지 않는다.
**The One-Step Rule.** 카드는 `--shadow-soft` 한 단계만 얹는다. 보더+섀도우 겹치기, 다단 섀도우 스택은 없다.

## Shapes

카드 12px(`rounded-card`), 썸네일 10px(`rounded-thumb`), 버튼·칩·탭·입력·뱃지·필은 풀라운드(9999px), 채팅 말풍선 18px, 포커스 링 6px. 시그니처 실루엣은 말풍선 꼬리: 국가 칩은 세 귀퉁이 9px, 한 귀퉁이 2px(KR 좌하단, JP 우하단), 채팅 말풍선은 화자 쪽 하단 4px. 날카로운 직각은 없다. v1의 20px 카드·16px 썸은 폐기 — 라운드는 브랜드가 아니라 **밀도**에 맞춘다.

## Components

### Buttons
- **Shape:** `.btn` 풀라운드, 700, 14px(`text-sm`), `px-6 py-2.5`.
- **Primary:** 코랄딥 필 + 흰 글자 — CTA(상품 등록하기, 해외직구 둘러보기), 판매 FAB.
- **Navy:** 네이비 필 + 흰 글자 — 구조·계정 액션(로그인하고 동네 설정, 다시 시도).
- **States:** hover 0.94 opacity, active `scale(0.95)` on `--squish` 180ms, disabled 0.45.

### TrustStrip (system)
`ul.grid-cols-3` on `rounded-card bg-tomo-ivory px-2 py-3`. 기둥 3개 고정: 에스크로 안전결제 / 센터 검수 배송 / 채팅 자동번역. 각 기둥은 24px 네이비 스트로크 아이콘(1.8) + 12px/700 네이비 라벨 + 11px ink-soft 서브. **사실만** — 수치·후기·별점 없음. 홈 허브의 첫 블록이며 `aria-label="토모 안전장치"`.

### SectionHeader
`mb-3 flex items-end justify-between`. 좌: `h2` 17px/800 ink + 선택적 12px ink-soft 서브(`mt-0.5`). 우: 선택적 `Link.press` 13px/700 네이비 "{label} →"(기본 "더보기"). 홈 허브의 모든 섹션이 이 헤더로 시작한다.

### MarketCarousel
`ul.-mx-4.flex.snap-x.snap-mandatory.gap-3.overflow-x-auto.px-4` + 스크롤바 숨김. 아이템 `w-[140px] shrink-0 snap-start`. JS 없음. `CarouselSkeleton`은 같은 폭 4장의 `.skeleton` 썸(aspect-square rounded-thumb) + 제목 줄(h-3) + 가격 줄(h-4). 여행 직거래 섹션도 같은 캐러셀 마크업으로 ListingCard를 태운다.

### ListingCard (2열 그리드 · 캐러셀)
`Link.press.flex-col`. 썸: `aspect-square rounded-thumb bg-tomo-navy/5`, 이미지 없으면 TomoSymbol 60%. 제목 13px/400 2줄(`mt-1.5`), 가격 15px/800 tnum(`mt-0.5`, 해외면 "약 {환산}"), 메타 11px ink-soft = CountryChip + 지역(`truncate`). 섀도우·보더 없음.

### ExternalItemCard (캐러셀 · 해외직구)
ListingCard와 같은 뼈대. 오버레이 뱃지: 좌상단 소스 라벨 `bg-tomo-navy/60 backdrop-blur-sm` 11px/700 흰색, 우상단 경매 "입찰중" 코랄딥 11px/700 흰색, 품절 스크림 `bg-tomo-navy/70` 14px/700 흰색. 경매면 11px ink-faint "현재가 · 낙찰가 변동". hover 시 이미지 `scale(1.03)` 300ms.

### ListingRow (피드 리스트)
`li.border-b.border-tomo-navy/5` + `Link.press.flex.gap-3.py-3.5`. 96px 썸 `rounded-thumb bg-tomo-navy/5`, 예약중/거래완료는 `bg-tomo-navy/75` 스크림 + 12px/700 흰 글자. 제목 15px/400 2줄, 메타 12px ink-soft(CountryChip + 지역 · 시간), 가격 16px/800 tnum(해외면 원가 12px/700 ink-soft 병기). 판매중 행은 마이크로 필 줄: 여행 직거래 뱃지(`.grad-bridge-soft` + 코랄딥 하트 + 네이비 11px/700) 조건부, **안전결제 필**(`bg-tomo-navy/5` + 네이비 실드 2.2 스트로크 + 네이비 11px/700) 항상. 거래완료 행은 제목·가격 ink-faint.

### Chips & Pills
- **CountryChip (`.bubble-kr` / `.bubble-jp`):** 11px/700, `px-1.5 py-0.5`, 파스텔 틴트 + 딥 잉크, 꼬리 귀퉁이 하나. 국기·텍스트 라벨 대신 쓰는 유일한 국가 신호.
- **안전결제 pill:** 풀라운드, `bg-tomo-navy/5`, 네이비 11px/700, 실드 아이콘. 판매중 행 전부에 붙는다.
- **여행 직거래 badge:** 풀라운드, `.grad-bridge-soft`, 네이비 11px/700, 코랄딥 하트. 브리지 그라데이션의 유일한 표면.
- **Overlay badges:** 풀라운드 11px/700 흰 글자, 소스는 navy/60 스크림, 경매는 코랄딥.

### Inputs / Fields
- **Search:** 풀라운드, `bg-tomo-ivory`(흰 헤더 위 틴트), `py-2.5 pl-10 pr-4`, **16px 입력 텍스트**(iOS 확대 방지), 리딩 아이콘 16px ink-faint 스트로크 2, 지우기 버튼 36px 원형 `.press`. 플레이스홀더 ink-soft 대화체("어떤 물건을 찾으세요?").
- **Focus:** 전역 2px 코랄딥 아웃라인, 2px 오프셋, 6px 라운드. 캐럿 코랄딥.

### Navigation
- **Segment tabs (검색·탭 모드에서만):** 풀라운드 `px-3.5 py-2.5` 13px/700 `.press`. 활성 = 네이비 필 + 흰 글자 + `--shadow-soft`, 비활성 = 흰 필 + ink-soft.
- **BottomNav:** fixed `max-w-md`, `bg-white/95 backdrop-blur`, `border-t border-tomo-navy/5`. 5항목, 11px/700 캡션, 22px 자체 스트로크 아이콘(비활성 1.7 → 활성 2.1), 활성 아이콘 필 `tomo-blue/30` 28×44 필, 활성 텍스트 네이비, 비활성 ink-soft. 중앙은 판매 FAB: 48px 코랄딥 원, `--shadow-float`, `-mt-5 -translate-y-2`, 캡션 코랄딥.

### SiteFooter (system)
`footer.mt-10.rounded-card.bg-tomo-ivory.px-4.py-5` 12px ink-soft relaxed. Wordmark `text-lg` → 이중 언어 태그라인 → `dl` 2열(사업자 정보 / 고객센터, `dt` 700 ink) → 11px ink-faint 법적 줄. 사업자·약관·개인정보처리방침 값은 사용자가 제공하기 전까지 **"준비 중"** — 절대 지어내지 않는다. 고객센터는 `/chat` 링크(underline).

### HomeHub (section order)
`div.px-4.pb-6.pt-1` 안에서: ① TrustStrip → ② "{상대국}에서 지금 인기" (Suspense 스트리밍, 테마별 SectionHeader + MarketCarousel, 전부 실패 시 조용히 비움) → ③ "토모에서 바로 거래" 2열 ListingCard 그리드(빈 상태는 TomoSymbol + 이중 언어 카피) → ④ "{상대국} 여행 가서 직거래" ListingCard 캐러셀(있을 때만) → ⑤ SiteFooter. 섹션 간격은 전부 `mt-8`. 파라미터(`q`, `tab`) 없는 첫 진입만 허브이고, 검색·탭은 ListingRow 리스트 모드.

### Detail surfaces (SP2 — 상품 상세 · 외부상품 상세)
같은 골격: 모바일은 풀블리드 정사각 이미지(스와이프, 우하단 `사진 N장` 11px 스크림 필, 좌상단 44px 뒤로가기 `bg-tomo-navy/60 backdrop-blur`) → 정보 컬럼 `p-4 gap-4`; 데스크톱은 2컬럼 `max-w-5xl`, 이미지가 `sticky top-24 rounded-card shadow-soft`. 제목 17px/700 ink(원문/번역 토글은 `bg-tomo-navy/5` 네이비 13px/700 필, `aria-pressed`, `lang` 속성이 표시 언어를 따라간다). **가격은 구매자 통화 17px/800 tnum이 큰 숫자**, 해외면 원가 12px/700 ink-soft가 한 줄 아래. 안내(해외 상품·여행 직거래·예약/완료)는 전부 `rounded-card bg-tomo-navy/5 p-3.5` 웰 + 네이비 700 리드 + 13px ink 본문 — 채팅 말풍선 모양·블루 틴트·브리지 배경은 쓰지 않으며, 여행 직거래는 웰 안의 `.grad-bridge-soft` 뱃지 하나가 유일한 그라데이션이다. 판매자 카드 `.card`: 아바타 `bg-tomo-navy/5` 네이비 700 이니셜(나라는 CountryChip이 말한다), 모바일 온도 필 `bg-tomo-navy/5` 네이비 11px/700 + 코랄딥 하트, 데스크톱은 HeartGauge(숫자 17px/800 코랄딥, Pretendard). 외부상품의 예상 금액표는 같은 navy/5 웰에 13px 행, 합계 행은 `border-tomo-navy/10` 헤어라인 위에 구매자 통화 15px/800 네이비 + 원가 11px/700 ink-soft, 주의 문구 11px ink-faint. 부가정보는 `dl.card` 2열(dt 700 ink). CTA는 모바일 하단 고정 바(`bottom-[62px]`, `bg-white/95 backdrop-blur`) / 데스크톱 흐름 배치, 코랄딥 하나 + 네이비 아웃라인 하나(채팅)까지만.

### Global market page (SP2 — /global)
헤더 `sticky bg-white/95 backdrop-blur`: h1 17px/800(데스크톱 20px) + 12px ink-soft 서브 + 게스트 로그인 네이비 필. 검색은 홈과 같은 아이보리 틴트 16px 필 + 지우기 ×. 소스 탭은 세그먼트 탭 규격(모바일 `py-3` 44px, 데스크톱 `py-2`), 라벨은 `source.*` 사전. "번역해서 찾았어요: …" 12px ink-soft 한 줄. 그리드는 2/3/4/5열 ExternalItemCard, 빈 상태는 TomoSymbol + 사전 카피.

### Brand Primitives (signature, unchanged)
`Wordmark`(TOM + 코랄 하트 SVG, `.heartbeat` 2.6s — 페이지의 유일한 상시 모션), `TomoSymbol`(블루+핑크 말풍선 겹침에 코랄 하트 — 빈 상태·이미지 없는 썸·피드 엔드캡), `CountryChip`. 모든 하트는 동일 SVG 패스.

### Motion
`--squish: cubic-bezier(0.34, 1.56, 0.64, 1)`. `.press:active` **0.98**, `.card:active` **0.98**, `.btn:active` 0.95, 180–200ms. 카드 hover는 `--shadow-lift` + `translateY(-1px)`; 외부 카드 이미지 hover `scale(1.03)`. 상시 모션은 워드마크 하트비트 하나. 스켈레톤 시머(1.4s)는 로딩 중에만. 캐러셀은 네이티브 scroll-snap이라 모션 코드가 없다. `prefers-reduced-motion`은 전부 0.01ms로 접는다.

## Do's and Don'ts

### Do:
- **Do** 페이지는 흰색으로, 아이보리는 TrustStrip·SiteFooter·검색 입력 틴트로만 쓴다.
- **Do** 네이비로 제목·활성·구조를, 코랄딥으로 행동을 말한다 — 한 화면에 코랄딥 CTA는 하나.
- **Do** 국가·언어 신호는 `.bubble-kr`/`.bubble-jp` 칩과 채팅 말풍선 틴트로만 준다.
- **Do** 가격은 800 + `.tnum`, 제목은 400. 해외 상품은 구매자 통화가 큰 숫자다.
- **Do** 카드 12px, 썸 10px, 필·칩·뱃지는 풀라운드. 탭 가능한 모든 것에 `.press`/`.btn`/`.card` 상태.
- **Do** 신뢰 UI(TrustStrip, 안전결제 필, 푸터)는 사실만 말하고, 없는 값은 "준비 중"으로 비워 둔다.
- **Do** 가로 목록은 네이티브 `snap-x snap-mandatory` + 140px 카드, JS 캐러셀을 쓰지 않는다.

### Don't:
- **Don't** 블루/핑크를 배경·배너·섹션 필로 쓰지 않는다. 나라 칩과 채팅 말풍선 밖에서는 나오지 않는다.
- **Don't** 브리지 그라데이션을 여행 직거래 뱃지 외에 쓰지 않는다.
- **Don't** 무채색 회색, 검정 섀도우, 카드 보더, 국기, 직각을 들이지 않는다.
- **Don't** Cafe24 Ssurround를 섹션 제목·가격·본문에 쓰지 않는다. 워드마크만.
- **Don't** 17px보다 큰 Pretendard 헤딩, 11px보다 작은 텍스트를 만들지 않는다.
- **Don't** 워드마크 하트비트 외의 상시 애니메이션을 추가하지 않는다.
- **Don't** 신뢰 수치·후기·거래 실적·사업자 정보를 지어내지 않는다.
