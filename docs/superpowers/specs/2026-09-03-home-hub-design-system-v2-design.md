# SP1 — 마켓 허브 홈 + 디자인 시스템 v2 설계

날짜: 2026-09-03 · 상태: 승인됨 · 범위: 앱 전체 재디자인 4개 하위 프로젝트 중 1번

## 배경과 목표

현재 홈은 시드 상품 9건의 단일 리스트라 "상품이 없는 사기 사이트" 인상을 준다. 사용자 진단은 "둘 다": 콘텐츠가 비어 있고, 파스텔 카와이 세계관의 적용 방식이 성숙하지 못하다.

목표:
1. 홈에 상대국 마켓(메루카리·야후옥션 / 당근·중고나라)에서 많이 찾는 상품이 실제로 보인다.
2. 브랜드 핀 고정 요소(토모 블루/핑크/코랄, 하트-O 워드마크, Cafe24 써라운드+Pretendard)는 유지하되 당근·메루카리급 프로덕트 느낌으로 적용을 성숙시킨다.
3. 신뢰 요소(에스크로·센터 검수·자동번역·회사 정보)가 홈에서 보인다.

앱 전체 분해:
- **SP1 (이 문서)**: 디자인 시스템 v2 + 공유 셸 + 홈 + 인기 상품 데이터 레이어
- SP2: 상품 상세, /global, 외부상품 상세, 결제 진입
- SP3: 채팅, 거래 타임라인, 프로필/마이페이지
- SP4: 로그인/온보딩/판매 폼, 어드민

SP2~4는 SP1의 토큰·컴포넌트를 상속하며 각각 별도 스펙으로 진행한다.

## 결정 사항 (인터뷰 확정)

| 질문 | 결정 |
|---|---|
| 사기 사이트 인상의 원인 | 비주얼 + 빈 콘텐츠 둘 다 |
| 인기 상품 기준 | 국가별 인기 키워드 코드 큐레이션 (트렌드 API 없음, 파서는 키워드 검색만) |
| 브랜드 요소 | 유지, 적용만 성숙하게 |
| 재디자인 범위 | 앱 전체 (SP1~4로 분해) |
| 홈 구조 | A. 마켓 허브 홈 |

## 1. 데이터 레이어 — `lib/market/trending.ts`

### 큐레이션 테이블

```ts
type TrendingTheme = {
  key: string;          // 유일, URL-safe
  label: string;        // 한국어 라벨
  labelJa: string;      // 일본어 라벨
  term: string;         // 마켓 언어 검색어 (JP 마켓=일본어, KR 마켓=한국어)
  sources: MarketSource[];
};
const TRENDING: Record<"KR" | "JP", TrendingTheme[]>;
```

- **KR 뷰어 → 일본 마켓** (`mercari`, `yahoo_auction`): 포켓몬카드(ポケモンカード), 필름카메라(フィルムカメラ), 지브리 굿즈(ジブリ グッズ), 산리오(サンリオ), 세이코 빈티지 시계(セイコー 腕時計 ヴィンテージ), 애니 피규어(アニメ フィギュア).
- **JP 뷰어 → 한국 마켓** (`daangn`, `joongna`): K-pop 포토카드(포토카드), 한국 화장품(화장품), 캠핑용품(캠핑용품), 갤럭시(갤럭시), 한복·전통 소품(한복).
- 게스트는 KR 뷰어로 취급한다(기존 `getViewerOrGuest` 규칙과 동일).

### 조회 함수

```ts
getTrendingSections(viewerCountry: "KR" | "JP", limitThemes = 4): Promise<TrendingSection[]>
type TrendingSection = { theme: TrendingTheme; items: MarketItem[] };
```

- 테마별로 `unstable_cache`(키: `trending:<themeKey>`, `revalidate: 3600`)로 감싼 조회. 내부에서 소스별 검색기를 병렬 호출, 실패한 소스는 빈 배열로 처리, 결과를 소스 인터리브(기존 `searchMarkets`와 같은 규칙) 후 **썸네일 있는 상품만** 상위 10개.
- 테마의 아이템이 0개면 그 섹션은 반환하지 않는다(홈에서 숨김).
- 소스별 요청 타임아웃 4초(`fetchWithRetry`의 옵션으로 전달).
- DB 쓰기 없음. `external_items` insert는 admin RLS라 service role 키 없이 불가. 코드에 `ponytail:` 주석으로 "service role 키 투입 시 쓰기-스루 캐시로 승격" 경로만 남긴다.
- 순수 함수 분리: `pickTrendingItems(resultsBySource: MarketItem[][], cap = 10): MarketItem[]` (인터리브 + 썸네일 필터 + 캡) — 테스트 대상.

## 2. 홈 IA — `app/page.tsx`

쿼리 파라미터 규칙:
- `q` 없음 → **허브 모드** (아래 섹션).
- `q` 있음 → **검색 결과 모드**: 현행 리스트 렌더 유지(검색 클리어 ×, 쿼리 보존 CTA, 빈 상태 그대로).
- `tab=local|travel` → 현행 필터 리스트 유지. 허브의 "전체 보기" 링크가 이 파라미터로 진입한다.

허브 모드 섹션(위→아래):
1. **헤더**: 워드마크 행(흐름) + 고정 검색바. 탭은 허브에서 제거.
2. **신뢰 스트립** (`components/TrustStrip.tsx`): 3칸 — "에스크로 안전결제" / "서울·나리타 센터 검수" / "채팅 자동번역". 인라인 SVG 아이콘 + 라벨. 아이보리 틴트 배경. 사실만, 수치·후기 없음.
3. **"일본에서 지금 인기"** (JP 뷰어: "한국에서 지금 인기"): 테마당 `SectionHeader`(라벨 + "더보기 →" `/global?q=<label>`) + `MarketCarousel`(가로 스냅, `ExternalItemCard` v2, 카드 폭 140px). 상위 4개 테마.
4. **"토모에서 바로 거래"**: 국내 등록 상품(판매중, 최신 12) 2열 이미지 그리드 `ListingCard`(신규). 섹션 헤더 링크는 "내 동네 상품 →" `/?tab=local` 하나(게스트는 기존 로그인 유도 빈 상태로 진입). 전체 리스트는 검색(`/?q=`)으로 진입한다.
5. **"여행 가서 직거래"**: 상대국 직거래 가능 상품(`trade_method in direct/both`, 최신 8) 캐러셀. 0개면 섹션 숨김. "전체 보기 →" `/?tab=travel`.
6. **푸터** (`components/SiteFooter.tsx`): 회사명·사업자등록번호·통신판매업신고·고객센터·이용약관·개인정보처리방침 자리. **값은 사용자가 제공할 때까지 플레이스홀더 라벨만**("사업자 정보 준비 중") — 날조 금지.

## 3. 디자인 시스템 v2

DESIGN.md는 impeccable new-work → document 흐름으로 **교체**한다(리파인 아님). 핵심 규칙:

- **표면**: 페이지 배경 흰색. 아이보리(#FBF9F4)는 신뢰 스트립·푸터·검색 입력 틴트만. 카드는 보더 없음, `--shadow-soft` 한 단계.
- **컬러 역할**: 네이비=제목·활성·구조. 코랄딥=단일 CTA·FAB. 블루/핑크=국가 칩·채팅 말풍선 전용. 브리지 그라데이션은 여행 직거래 뱃지 하나에만.
- **형태**: 카드 12px, 썸네일 10px, 버튼/칩 풀라운드. `--squish` 유지, 스케일 0.96 → 0.98.
- **타이포 (Pretendard)**: 섹션 타이틀 17px/800, 카드 제목 13px/400 2줄 클램프, 가격 15px/800 tnum, 본문 14, 메타 12, micro 11(10에서 상향; 디텍터 ignore-value 10px는 제거).
- **모션**: 워드마크 하트비트만 영구. 캐러셀은 네이티브 `scroll-snap`.
- **하단 내비**: 5항목 유지, FAB `--shadow-float` 강도 절반.
- **공유 컴포넌트 신규/개정**: `TrustStrip`, `SectionHeader`, `MarketCarousel`, `ListingCard`, `SiteFooter`, `ExternalItemCard`(v2 토큰), `BottomNav`(그림자), `Brand`(변경 없음).

`tailwind.config.ts`: `borderRadius.card` 20 → 12, `thumb` 10 추가. `globals.css`: 배경 흰색, `.card`/`.press` 스케일, micro 단계.

## 4. 오류·성능

- 섹션 3·5는 각각 `<Suspense fallback={<CarouselSkeleton/>}>`로 스트리밍. 헤더·신뢰 스트립·국내 그리드·푸터는 즉시 렌더.
- 외부 마켓 전부 실패 → 섹션 3 전체 숨김, 나머지 정상. 콜드 캐시 첫 요청 최대 4초(타임아웃 상한).
- 기존 `force-dynamic`은 홈에 쓰지 않는다(쿠키로 이미 동적). `unstable_cache`는 동적 라우트에서도 동작.

## 5. 테스트

- `tests/trending.test.ts`: (a) TRENDING 무결성 — key 유일, term 비어있지 않음, sources ⊂ LIVE_SOURCES, KR 테마는 JPY 소스만·JP 테마는 KRW 소스만; (b) `pickTrendingItems` — 인터리브 순서, 썸네일 없는 항목 제외, 캡 10.
- 기존 35개 테스트 유지. `formatWithConversion` 문자열 계약 불변.
- 완료 후 `/impeccable critique`로 홈 점수 추적(현재 추세 27 → 30/40).

## 범위 밖 (YAGNI)

- 어드민 키워드 테이블, 검색 로그 기반 트렌드, external_items 쓰기-스루, 페이지네이션, 다크 모드, SP2~4 표면.
