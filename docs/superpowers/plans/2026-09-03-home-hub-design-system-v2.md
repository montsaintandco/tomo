# 마켓 허브 홈 + 디자인 시스템 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈을 "상대국 마켓 인기 상품 + 국내 상품 + 신뢰 요소"가 보이는 마켓 허브로 재구성하고, 브랜드를 유지한 채 디자인 토큰을 성숙한 프로덕트 톤(v2)으로 교체한다.

**Architecture:** 순수 큐레이션/선택 로직(`lib/market/trending-data.ts`, 테스트 대상)과 Next 데이터 캐시 레이어(`lib/market/trending.ts`, `unstable_cache` 1h + 소스별 4초 타임아웃)를 분리한다. 홈(`app/page.tsx`)은 `q`/`tab` 파라미터가 없을 때 허브 모드(`components/HomeHub.tsx`)를, 있을 때 기존 리스트 모드를 렌더한다. 외부 마켓 섹션은 `<Suspense>`로 스트리밍한다. 토큰 v2는 `tailwind.config.ts`/`globals.css`/`layout.tsx`에서 바뀌고 모든 페이지가 상속한다.

**Tech Stack:** Next.js 16 App Router(서버 컴포넌트, `unstable_cache`), React 19, Tailwind 3, Supabase, vitest 4.

## Global Constraints

- 브랜드 핀 고정 유지: 토모 블루 `#9CC5EC` / 핑크 `#F2AFAF` / 코랄 `#E2807F` / 코랄딥 `#C14E4C` / 아이보리 `#FBF9F4` / 네이비 `#0C447C`, 하트-O 워드마크, Cafe24 써라운드(로고만) + Pretendard.
- 페이지 배경은 흰색. 아이보리는 신뢰 스트립·푸터·검색 입력 틴트만.
- 블루/핑크는 국가 칩·채팅 말풍선 전용. 브리지 그라데이션은 여행 직거래 뱃지에만.
- 카드 12px, 썸네일 10px, 버튼/칩 풀라운드, `.press` 스케일 0.98.
- 타이포: 섹션 타이틀 17px/800, 카드 제목 13px/400 2줄 클램프, 가격 15px/800 `tnum`, 메타 12px, micro 11px(10px 전부 상향).
- 영구 모션은 워드마크 하트비트 하나뿐.
- DB 쓰기 없음. 수치·후기·사업자 정보 날조 금지(푸터는 "준비 중" 플레이스홀더).
- `formatWithConversion` 문자열 계약 불변, 기존 vitest 35개 유지.
- 커밋은 master 로컬, 푸시 없음.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/market/trending-data.ts` (신규) | `TRENDING` 큐레이션 테이블, `TrendingTheme` 타입, 순수 함수 `pickTrendingItems` |
| `lib/market/trending.ts` (신규) | `getTrendingSections` — 소스 검색기 호출 + 타임아웃 + `unstable_cache` |
| `tests/trending.test.ts` (신규) | 큐레이션 무결성 + `pickTrendingItems` |
| `tailwind.config.ts` / `app/globals.css` / `app/layout.tsx` (수정) | 토큰 v2: 배경 흰색, 라운드 12/10, press 0.98, themeColor |
| `components/BottomNav.tsx` / `components/Brand.tsx` / `components/ListingRow.tsx` / `components/ExternalItemCard.tsx` (수정) | micro 11px, 라운드 토큰, FAB 그림자 |
| `components/TrustStrip.tsx` (신규) | 신뢰 3칸 |
| `components/SectionHeader.tsx` (신규) | 섹션 타이틀 + 더보기 링크 |
| `components/MarketCarousel.tsx` (신규) | 가로 스냅 캐러셀 + `CarouselSkeleton` |
| `components/ListingCard.tsx` (신규) | 국내 상품 2열 그리드 카드 |
| `components/SiteFooter.tsx` (신규) | 회사/법적 정보 자리(플레이스홀더) |
| `components/HomeHub.tsx` (신규) | 허브 모드 조립(서버 컴포넌트, Suspense 섹션) |
| `app/page.tsx` (수정) | 허브/리스트 모드 분기, 허브에서 탭 숨김 |
| `.impeccable/config.json` (수정) | `undersized-ui-text 10px` ignore-value 제거 |
| `DESIGN.md` (교체) | impeccable documenter로 v2 기록 |

---

### Task 1: 큐레이션 테이블 + `pickTrendingItems` (TDD)

**Files:**
- Create: `lib/market/trending-data.ts`
- Test: `tests/trending.test.ts`

**Interfaces:**
- Consumes: `MarketItem`, `MarketSource`, `LIVE_SOURCES`, `SOURCE_CURRENCY` from `lib/market/types.ts`
- Produces: `export type TrendingTheme = { key: string; label: string; labelJa: string; term: string; sources: MarketSource[] }`, `export const TRENDING: Record<"KR" | "JP", TrendingTheme[]>`, `export function pickTrendingItems(resultsBySource: MarketItem[][], cap?: number): MarketItem[]`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/trending.test.ts
import { describe, it, expect } from "vitest";
import { TRENDING, pickTrendingItems, type TrendingTheme } from "../lib/market/trending-data";
import { LIVE_SOURCES, SOURCE_CURRENCY, type MarketItem } from "../lib/market/types";

const item = (source: MarketItem["source"], id: string, thumb = "t.jpg", soldOut = false): MarketItem => ({
  source, sourceId: id, url: `u/${id}`, title: id, price: 100,
  currency: SOURCE_CURRENCY[source], thumb, soldOut,
});

describe("TRENDING curation", () => {
  const all: TrendingTheme[] = [...TRENDING.KR, ...TRENDING.JP];
  it("has unique url-safe keys", () => {
    const keys = all.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9-]+$/);
  });
  it("has non-empty labels and terms", () => {
    for (const t of all) {
      expect(t.label.trim()).not.toBe("");
      expect(t.labelJa.trim()).not.toBe("");
      expect(t.term.trim()).not.toBe("");
    }
  });
  it("uses only live sources of the counterpart country", () => {
    for (const t of TRENDING.KR) for (const s of t.sources) {
      expect(LIVE_SOURCES).toContain(s);
      expect(SOURCE_CURRENCY[s]).toBe("JPY"); // 한국 구매자 → 일본 마켓
    }
    for (const t of TRENDING.JP) for (const s of t.sources) {
      expect(LIVE_SOURCES).toContain(s);
      expect(SOURCE_CURRENCY[s]).toBe("KRW"); // 일본 구매자 → 한국 마켓
    }
  });
  it("has at least 4 themes per country (home shows 4)", () => {
    expect(TRENDING.KR.length).toBeGreaterThanOrEqual(4);
    expect(TRENDING.JP.length).toBeGreaterThanOrEqual(4);
  });
});

describe("pickTrendingItems", () => {
  it("interleaves sources so one market cannot dominate", () => {
    const a = [item("mercari", "a1"), item("mercari", "a2"), item("mercari", "a3")];
    const b = [item("yahoo_auction", "b1"), item("yahoo_auction", "b2")];
    expect(pickTrendingItems([a, b]).map((i) => i.sourceId)).toEqual(["a1", "b1", "a2", "b2", "a3"]);
  });
  it("drops items without thumbnail or sold out", () => {
    const a = [item("mercari", "ok"), item("mercari", "nothumb", ""), item("mercari", "sold", "t.jpg", true)];
    expect(pickTrendingItems([a]).map((i) => i.sourceId)).toEqual(["ok"]);
  });
  it("caps at 10 by default", () => {
    const a = Array.from({ length: 8 }, (_, i) => item("mercari", `a${i}`));
    const b = Array.from({ length: 8 }, (_, i) => item("yahoo_auction", `b${i}`));
    expect(pickTrendingItems([a, b])).toHaveLength(10);
  });
  it("returns empty for all-empty input", () => {
    expect(pickTrendingItems([[], []])).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/trending.test.ts`
Expected: FAIL — `Cannot find module '../lib/market/trending-data'`

- [ ] **Step 3: 구현**

```ts
// lib/market/trending-data.ts
// 상대국 마켓에서 "많이 찾는" 테마 큐레이션 — 트렌드 API가 없어 코드로 관리한다.
// ponytail: 키워드가 자주 바뀌면 Supabase 테이블 + /admin 편집 UI로 승격
import type { MarketItem, MarketSource } from "./types";

export type TrendingTheme = {
  key: string;        // 유일, URL-safe
  label: string;      // 한국어 라벨
  labelJa: string;    // 일본어 라벨
  term: string;       // 마켓 언어 검색어 (JP 마켓=일본어, KR 마켓=한국어)
  sources: MarketSource[];
};

const JP: MarketSource[] = ["mercari", "yahoo_auction"];
const KR: MarketSource[] = ["daangn", "joongna"];

export const TRENDING: Record<"KR" | "JP", TrendingTheme[]> = {
  // 한국 구매자가 일본 마켓에서 많이 찾는 것
  KR: [
    { key: "pokemon-card", label: "포켓몬카드", labelJa: "ポケモンカード", term: "ポケモンカード", sources: JP },
    { key: "film-camera", label: "필름카메라", labelJa: "フィルムカメラ", term: "フィルムカメラ", sources: JP },
    { key: "ghibli", label: "지브리 굿즈", labelJa: "ジブリ グッズ", term: "ジブリ グッズ", sources: JP },
    { key: "sanrio", label: "산리오", labelJa: "サンリオ", term: "サンリオ", sources: JP },
    { key: "seiko-vintage", label: "세이코 빈티지 시계", labelJa: "セイコー ヴィンテージ", term: "セイコー 腕時計 ヴィンテージ", sources: JP },
    { key: "anime-figure", label: "애니 피규어", labelJa: "アニメ フィギュア", term: "アニメ フィギュア", sources: JP },
  ],
  // 일본 구매자가 한국 마켓에서 많이 찾는 것
  JP: [
    { key: "kpop-photocard", label: "K-pop 포토카드", labelJa: "K-POP トレカ", term: "포토카드", sources: KR },
    { key: "k-beauty", label: "한국 화장품", labelJa: "韓国コスメ", term: "화장품", sources: KR },
    { key: "camping", label: "캠핑용품", labelJa: "キャンプ用品", term: "캠핑용품", sources: KR },
    { key: "galaxy", label: "갤럭시", labelJa: "Galaxy", term: "갤럭시", sources: KR },
    { key: "hanbok", label: "한복·전통 소품", labelJa: "韓服・伝統小物", term: "한복", sources: KR },
  ],
};

/** 소스별 결과를 인터리브해 한 마켓이 도배하지 않게 하고, 썸네일 없는/품절 상품은 뺀 뒤 cap까지 자른다 */
export function pickTrendingItems(resultsBySource: MarketItem[][], cap = 10): MarketItem[] {
  const lists = resultsBySource.map((r) => r.filter((i) => i.thumb && !i.soldOut));
  const out: MarketItem[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max && out.length < cap; i++) {
    for (const l of lists) if (l[i] && out.length < cap) out.push(l[i]);
  }
  return out;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/trending.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: 커밋**

```bash
git add lib/market/trending-data.ts tests/trending.test.ts
git commit -m "feat(market): 국가별 인기 테마 큐레이션 + pickTrendingItems"
```

---

### Task 2: 트렌딩 조회 레이어 (캐시 + 타임아웃)

**Files:**
- Create: `lib/market/trending.ts`

**Interfaces:**
- Consumes: `TRENDING`, `pickTrendingItems`, `TrendingTheme` (Task 1); `mercariSearch`, `yahooAuctionSearch`, `daangnSearch`, `joongnaSearch` (기존, 시그니처 `(keyword: string) => Promise<MarketItem[]>`)
- Produces: `export type TrendingSection = { theme: TrendingTheme; items: MarketItem[] }`, `export async function getTrendingSections(country: "KR" | "JP", limitThemes?: number): Promise<TrendingSection[]>`

- [ ] **Step 1: 구현**

```ts
// lib/market/trending.ts
import { unstable_cache } from "next/cache";
import { mercariSearch } from "./mercari";
import { yahooAuctionSearch } from "./yahoo-auction";
import { daangnSearch } from "./daangn";
import { joongnaSearch } from "./joongna";
import { TRENDING, pickTrendingItems, type TrendingTheme } from "./trending-data";
import type { MarketItem, MarketSource } from "./types";

export type TrendingSection = { theme: TrendingTheme; items: MarketItem[] };

const SEARCHERS: Record<MarketSource, (q: string) => Promise<MarketItem[]>> = {
  mercari: mercariSearch,
  yahoo_auction: yahooAuctionSearch,
  daangn: daangnSearch,
  joongna: joongnaSearch,
};

// 홈은 첫 화면이다 — 파서 하나가 느려도 4초 넘게 붙잡지 않는다 (파서 내부 재시도는 그대로 둠)
const SOURCE_TIMEOUT_MS = 4000;
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

async function fetchTheme(theme: TrendingTheme): Promise<MarketItem[]> {
  const results = await Promise.all(theme.sources.map((s) =>
    withTimeout(SEARCHERS[s](theme.term).catch(() => [] as MarketItem[]), SOURCE_TIMEOUT_MS, [] as MarketItem[])
  ));
  const picked = pickTrendingItems(results);
  // 빈 결과를 1시간 캐시하면 안 되므로 throw → 캐시 저장 안 됨, 호출부가 []로 받는다
  if (picked.length === 0) throw new Error(`trending:${theme.key}: empty`);
  return picked;
}

// ponytail: Next 데이터 캐시(1h, stale-while-revalidate). service role 키가 생기면 external_items 쓰기-스루로 승격
const cachedTheme = (theme: TrendingTheme) =>
  unstable_cache(() => fetchTheme(theme), ["trending", theme.key], { revalidate: 3600 })()
    .catch(() => [] as MarketItem[]);

export async function getTrendingSections(country: "KR" | "JP", limitThemes = 4): Promise<TrendingSection[]> {
  const themes = TRENDING[country].slice(0, limitThemes);
  const items = await Promise.all(themes.map(cachedTheme));
  return themes.map((theme, i) => ({ theme, items: items[i] })).filter((s) => s.items.length > 0);
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "trending|error" | head`
Expected: 출력 없음 (에러 0)

- [ ] **Step 3: 커밋**

```bash
git add lib/market/trending.ts
git commit -m "feat(market): getTrendingSections — 테마별 캐시 1h + 소스 4초 타임아웃"
```

---

### Task 3: 디자인 토큰 v2

**Files:**
- Modify: `tailwind.config.ts:26` (`borderRadius`)
- Modify: `app/globals.css` (`.card` radius, `.press`/`.card` 스케일)
- Modify: `app/layout.tsx:15,20` (themeColor, body 배경)
- Modify: `components/BottomNav.tsx` (FAB 그림자, 라벨 11px)
- Modify: `components/Brand.tsx:45` (CountryChip 11px)
- Modify: `components/ListingRow.tsx` (뱃지 11px, 썸네일 라운드)
- Modify: `components/ExternalItemCard.tsx` (라운드, 뱃지 11px, 제목 13px, 가격 15px)
- Modify: `.impeccable/config.json` (10px ignore 제거)

**Interfaces:**
- Produces: Tailwind 토큰 `rounded-card`(12px), `rounded-thumb`(10px); CSS 변수 `--shadow-float` 절반 강도

- [ ] **Step 1: Tailwind 라운드 토큰**

`tailwind.config.ts`의 `borderRadius: { card: "20px" }`를 다음으로 교체:

```ts
      borderRadius: { card: "12px", thumb: "10px" },
```

- [ ] **Step 2: globals.css 토큰**

`:root`의 `--shadow-float` 줄을 교체:

```css
  --shadow-float: 0 3px 8px rgba(193, 78, 76, 0.16), 0 8px 20px rgba(12, 68, 124, 0.10);
```

`.card { ... border-radius: 20px; ... }`의 `border-radius: 20px;`를 `border-radius: 12px;`로, `.press:active { transform: scale(0.96); }`를 `.press:active { transform: scale(0.98); }`로 교체.

- [ ] **Step 3: layout.tsx 배경**

```ts
export const viewport: Viewport = { themeColor: "#FFFFFF" };
```
`<body className="bg-tomo-ivory pb-24 text-ink">` → `<body className="bg-white pb-24 text-ink">`.

- [ ] **Step 4: micro 11px 일괄 상향 + 라운드 토큰 적용**

```bash
sed -i 's/text-\[10px\]/text-[11px]/g' components/BottomNav.tsx components/Brand.tsx components/ListingRow.tsx components/ExternalItemCard.tsx
sed -i 's/rounded-2xl bg-tomo-navy\/5/rounded-thumb bg-tomo-navy\/5/' components/ListingRow.tsx components/ExternalItemCard.tsx
grep -rn "text-\[10px\]" components app | wc -l   # 기대: 0
```

`components/ExternalItemCard.tsx`에서 제목/가격 두 줄을 교체:

```tsx
        <p className="line-clamp-2 text-[13px] leading-snug text-ink">{item.title}</p>
        <p className="tnum text-[15px] font-extrabold text-ink">
```
(원본: `text-xs leading-snug text-ink-soft` → `text-[13px] leading-snug text-ink`; 가격 줄은 이미 15px.)

- [ ] **Step 5: 디텍터 ignore-value 제거**

```bash
node -e "const fs=require('fs');const p='.impeccable/config.json';const c=JSON.parse(fs.readFileSync(p,'utf8'));c.detector.ignoreValues=c.detector.ignoreValues.filter(v=>!(v.rule==='undersized-ui-text'&&v.value==='10px'));fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');console.log(c.detector.ignoreValues.length)"
```
Expected: `8`

- [ ] **Step 6: 빌드·테스트 확인**

Run: `npm run build 2>&1 | tail -3 && npm test 2>&1 | tail -4`
Expected: 빌드 `✓`, `Tests  43 passed` (기존 35 + Task 1의 8)

- [ ] **Step 7: 커밋**

```bash
git add tailwind.config.ts app/globals.css app/layout.tsx components/BottomNav.tsx components/Brand.tsx components/ListingRow.tsx components/ExternalItemCard.tsx .impeccable/config.json
git commit -m "design: 토큰 v2 — 흰 배경, 라운드 12/10, press 0.98, micro 11px, FAB 그림자 톤다운"
```

---

### Task 4: 공유 컴포넌트 5종

**Files:**
- Create: `components/TrustStrip.tsx`, `components/SectionHeader.tsx`, `components/MarketCarousel.tsx`, `components/ListingCard.tsx`, `components/SiteFooter.tsx`

**Interfaces:**
- Consumes: `ExternalItemCard`/`ExternalCardItem` (기존), `FeedListing` (기존 `components/ListingRow.tsx`), `CountryChip`, `Wordmark`, `TomoSymbol` (기존), `formatPrice`/`convertPrice` (`lib/currency.ts`), `displayTitle` (`lib/listings.ts`)
- Produces:
  - `TrustStrip(): JSX`
  - `SectionHeader({ title, sub?, href?, linkLabel? }: { title: string; sub?: string; href?: string; linkLabel?: string })`
  - `MarketCarousel({ items, rate, viewerCurrency }: { items: ExternalCardItem[]; rate: number; viewerCurrency: "KRW" | "JPY" })`, `CarouselSkeleton()`
  - `ListingCard({ listing, viewer }: { listing: FeedListing; viewer: Pick<Viewer, "country" | "language" | "rate" | "currency"> })`
  - `SiteFooter(): JSX`

- [ ] **Step 1: TrustStrip**

```tsx
// components/TrustStrip.tsx
// 신뢰 3칸 — 사실만 말한다 (수치·후기 없음). 원칙 1: 안전장치를 숨기지 말 것
const PILLARS = [
  {
    label: "에스크로 안전결제", sub: "받고 확인한 뒤 정산",
    icon: <><path d="M12 3.5l6.5 2.7v4.6c0 4.3-2.8 7.6-6.5 9.7-3.7-2.1-6.5-5.4-6.5-9.7V6.2z" /><path d="m9.3 11.6 1.9 1.9 3.5-3.5" /></>,
  },
  {
    label: "센터 검수 배송", sub: "서울·나리타 센터 경유",
    icon: <><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z" /><path d="M4 8.5l8 4.5 8-4.5M12 13v7" /></>,
  },
  {
    label: "채팅 자동번역", sub: "한국어·일본어 그대로",
    icon: <><path d="M4 6h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8l-3 3v-3H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" /><path d="M17 9.5h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-1v2.5l-3-2.5h-3" /></>,
  },
];

export default function TrustStrip() {
  return (
    <ul className="grid grid-cols-3 gap-1 rounded-card bg-tomo-ivory px-2 py-3" aria-label="토모 안전장치">
      {PILLARS.map((p) => (
        <li key={p.label} className="flex flex-col items-center gap-1.5 text-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="#0C447C" strokeWidth={1.8}
            strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
            {p.icon}
          </svg>
          <span className="text-[12px] font-bold leading-tight text-tomo-navy">{p.label}</span>
          <span className="text-[11px] leading-tight text-ink-soft">{p.sub}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: SectionHeader**

```tsx
// components/SectionHeader.tsx
import Link from "next/link";

export default function SectionHeader({ title, sub, href, linkLabel = "더보기" }: {
  title: string; sub?: string; href?: string; linkLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[17px] font-extrabold leading-tight text-ink">{title}</h2>
        {sub && <p className="mt-0.5 text-[12px] text-ink-soft">{sub}</p>}
      </div>
      {href && (
        <Link href={href} className="press shrink-0 text-[13px] font-bold text-tomo-navy">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 3: MarketCarousel + 스켈레톤**

```tsx
// components/MarketCarousel.tsx
import ExternalItemCard, { type ExternalCardItem } from "@/components/ExternalItemCard";

// 가로 스냅 — 네이티브 스크롤, JS 없음. 페이지 가터(px-4)를 뚫고 나가게 -mx-4
export default function MarketCarousel({ items, rate, viewerCurrency }: {
  items: ExternalCardItem[]; rate: number; viewerCurrency: "KRW" | "JPY";
}) {
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((it) => (
        <li key={`${it.source}:${it.sourceId}`} className="w-[140px] shrink-0 snap-start">
          <ExternalItemCard item={it} rate={rate} viewerCurrency={viewerCurrency} />
        </li>
      ))}
    </ul>
  );
}

export function CarouselSkeleton() {
  return (
    <div className="-mx-4 flex gap-3 overflow-hidden px-4" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="w-[140px] shrink-0">
          <div className="skeleton aspect-square rounded-thumb" />
          <div className="skeleton mt-2 h-3 w-4/5 rounded" />
          <div className="skeleton mt-1.5 h-4 w-1/2 rounded" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: ListingCard**

```tsx
// components/ListingCard.tsx
import Link from "next/link";
import { convertPrice, formatPrice } from "@/lib/currency";
import { displayTitle, type Viewer } from "@/lib/listings";
import { CountryChip, TomoSymbol } from "@/components/Brand";
import type { FeedListing } from "@/components/ListingRow";

// 2열 그리드 카드 — 이미지 우선, 가격이 가장 굵게 (Price-Loudest는 구매자 통화)
export default function ListingCard({ listing, viewer }: {
  listing: FeedListing;
  viewer: Pick<Viewer, "country" | "language" | "rate" | "currency">;
}) {
  const foreign = listing.country !== viewer.country;
  return (
    <Link href={`/listings/${listing.id}`} className="press flex flex-col">
      <div className="relative aspect-square overflow-hidden rounded-thumb bg-tomo-navy/5">
        {listing.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.images[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <TomoSymbol className="h-10 w-[3.75rem] opacity-60" />
          </div>
        )}
      </div>
      <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-ink">{displayTitle(listing, viewer.language)}</p>
      <p className="tnum mt-0.5 text-[15px] font-extrabold text-ink">
        {foreign
          ? `약 ${formatPrice(convertPrice(listing.price, listing.currency, viewer.rate), viewer.currency)}`
          : formatPrice(listing.price, listing.currency)}
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-soft">
        <CountryChip country={listing.country} />
        <span className="truncate">{listing.region}</span>
      </p>
    </Link>
  );
}
```

- [ ] **Step 5: SiteFooter**

```tsx
// components/SiteFooter.tsx
import Link from "next/link";
import { Wordmark } from "@/components/Brand";

// 회사/법적 정보 자리 — 값은 사용자가 제공할 때까지 "준비 중". 날조 금지
export default function SiteFooter() {
  return (
    <footer className="mt-10 rounded-card bg-tomo-ivory px-4 py-5 text-[12px] leading-relaxed text-ink-soft">
      <Wordmark className="text-lg" />
      <p className="mt-2">한국과 일본을 잇는 중고거래 · 韓国と日本をつなぐフリマ</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="font-bold text-ink">사업자 정보</dt><dd>준비 중</dd>
        <dt className="font-bold text-ink">고객센터</dt><dd><Link href="/chat" className="underline">채팅으로 문의</Link></dd>
      </dl>
      <p className="mt-3 text-[11px] text-ink-faint">이용약관 · 개인정보처리방침 — 준비 중</p>
    </footer>
  );
}
```

- [ ] **Step 6: 타입 체크 + 커밋**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "components/(TrustStrip|SectionHeader|MarketCarousel|ListingCard|SiteFooter)" | head`
Expected: 출력 없음

```bash
git add components/TrustStrip.tsx components/SectionHeader.tsx components/MarketCarousel.tsx components/ListingCard.tsx components/SiteFooter.tsx
git commit -m "feat(ui): 허브 공유 컴포넌트 — TrustStrip, SectionHeader, MarketCarousel, ListingCard, SiteFooter"
```

---

### Task 5: HomeHub + 홈 분기

**Files:**
- Create: `components/HomeHub.tsx`
- Modify: `app/page.tsx` (허브/리스트 분기, 허브에서 탭·배너 숨김)

**Interfaces:**
- Consumes: Task 2 `getTrendingSections`, Task 4 컴포넌트, `FeedListing`, `ViewerOrGuest` (`lib/listings.ts`), `SOURCE_CURRENCY`
- Produces: `HomeHub({ viewer, listings, travel }: { viewer: ViewerOrGuest; listings: FeedListing[]; travel: FeedListing[] })`

- [ ] **Step 1: HomeHub**

```tsx
// components/HomeHub.tsx
import { Suspense } from "react";
import type { ViewerOrGuest } from "@/lib/listings";
import { getTrendingSections } from "@/lib/market/trending";
import type { FeedListing } from "@/components/ListingRow";
import TrustStrip from "@/components/TrustStrip";
import SectionHeader from "@/components/SectionHeader";
import MarketCarousel, { CarouselSkeleton } from "@/components/MarketCarousel";
import ListingCard from "@/components/ListingCard";
import SiteFooter from "@/components/SiteFooter";
import { TomoSymbol } from "@/components/Brand";

// 외부 마켓 섹션 — 느릴 수 있으니 Suspense로 스트리밍. 전부 실패하면 조용히 비운다
async function TrendingSections({ viewer }: { viewer: ViewerOrGuest }) {
  const sections = await getTrendingSections(viewer.country);
  if (sections.length === 0) return null;
  const market = viewer.country === "KR" ? "일본" : "한국";
  return (
    <section className="mt-8">
      <SectionHeader title={`${market}에서 지금 인기`} sub="메루카리·야후옥션·당근·중고나라에서 많이 찾는 것들" />
      <div className="flex flex-col gap-6">
        {sections.map(({ theme, items }) => (
          <div key={theme.key}>
            <SectionHeader title={viewer.language === "ja" ? theme.labelJa : theme.label}
              href={`/global?q=${encodeURIComponent(theme.label)}`} />
            <MarketCarousel items={items} rate={viewer.rate} viewerCurrency={viewer.currency} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function HomeHub({ viewer, listings, travel }: {
  viewer: ViewerOrGuest; listings: FeedListing[]; travel: FeedListing[];
}) {
  const counterpart = viewer.country === "KR" ? "일본" : "한국";
  return (
    <div className="px-4 pb-6 pt-1">
      <TrustStrip />

      <Suspense fallback={<section className="mt-8"><SectionHeader title="지금 인기" /><CarouselSkeleton /></section>}>
        <TrendingSections viewer={viewer} />
      </Suspense>

      <section className="mt-8">
        <SectionHeader title="토모에서 바로 거래" sub="에스크로로 안전하게, 센터 검수 후 배송"
          href="/?tab=local" linkLabel="내 동네 상품" />
        {listings.length > 0 ? (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-5">
            {listings.map((l) => <li key={l.id}><ListingCard listing={l} viewer={viewer} /></li>)}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <TomoSymbol />
            <p className="text-sm text-ink-soft">아직 등록된 상품이 없어요 · まだ出品がありません</p>
          </div>
        )}
      </section>

      {travel.length > 0 && (
        <section className="mt-8">
          <SectionHeader title={`${counterpart} 여행 가서 직거래`} sub="여행 중 판매자와 직접 만나 받을 수 있어요"
            href="/?tab=travel" linkLabel="전체 보기" />
          <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {travel.map((l) => <li key={l.id} className="w-[140px] shrink-0 snap-start"><ListingCard listing={l} viewer={viewer} /></li>)}
          </ul>
        </section>
      )}

      <SiteFooter />
    </div>
  );
}
```

- [ ] **Step 2: app/page.tsx 분기**

`app/page.tsx` 상단 import에 추가:

```tsx
import HomeHub from "@/components/HomeHub";
```

`const localNeedsLogin = ...` 줄 바로 아래에 추가:

```tsx
  // 파라미터 없는 첫 진입 = 허브. 검색·탭은 기존 리스트 모드
  const hub = !q && !searchParams.tab;
```

기존 `const { data: listings, error: feedError } = localNeedsLogin ? ... : await query;` 바로 아래에 추가:

```tsx
  // 허브용 데이터 — 국내 판매중 최신 12 + 상대국 직거래 가능 최신 8 (병렬)
  const [hubOwn, hubTravel] = hub
    ? await Promise.all([
        supabase.from("listings").select(FEED_SELECT).eq("status", "active")
          .eq("country", viewer.country).order("created_at", { ascending: false }).limit(12),
        supabase.from("listings").select(FEED_SELECT).eq("status", "active")
          .neq("country", viewer.country).in("trade_method", ["direct", "both"])
          .order("created_at", { ascending: false }).limit(8),
      ])
    : [null, null];
```

`const FEED_LIMIT = 40;` 아래에 추가하고, 기존 `let query = supabase.from("listings").select("id, title, ... listing_translations(language, title)")`의 문자열 리터럴을 `FEED_SELECT`로 교체:

```tsx
const FEED_SELECT = "id, title, price, currency, source_language, country, region, status, images, created_at, trade_method, cross_border_enabled, listing_translations(language, title)";
```

헤더의 탭 `<nav className="flex gap-1.5" aria-label="구매 루트">…</nav>` 전체를 `{!hub && ( … )}`로 감싼다.

`</header>` 바로 다음의 `<div className="px-4 pb-6 pt-1">` 앞에 허브 분기를 넣는다 — 즉 `</header>` 다음 줄을:

```tsx
      {hub ? (
        <HomeHub viewer={viewer}
          listings={(hubOwn?.data ?? []) as unknown as FeedListing[]}
          travel={(hubTravel?.data ?? []) as unknown as FeedListing[]} />
      ) : (
      <div className="px-4 pb-6 pt-1">
```

그리고 그 `<div className="px-4 pb-6 pt-1">`의 닫는 `</div>` (`</main>` 바로 위) 다음에 `)}`를 추가해 삼항을 닫는다:

```tsx
      </div>
      )}
    </main>
```

리스트 모드의 대행 배너 `<Link href="/global" className="grad-bridge press mb-4 …">…</Link>` 블록은 삭제한다(허브의 인기 섹션이 그 역할을 대신하고, 검색 결과 위에서는 노이즈였다).

- [ ] **Step 3: 빌드·타입 확인**

Run: `npm run build 2>&1 | grep -E "✓|error|Error" | head`
Expected: `✓ Compiled successfully`, `✓ Generating static pages`

- [ ] **Step 4: 브라우저 검증 (1회 일괄)**

dev 서버(`tomo-dev`)에서 375px 에뮬레이션으로 `http://localhost:3000` 확인:
- 신뢰 스트립 3칸 렌더, 배경 흰색(`getComputedStyle(document.body).backgroundColor === "rgb(255, 255, 255)"`)
- "일본에서 지금 인기" 섹션에 테마 캐러셀 ≥1개, 각 카드에 썸네일
- "토모에서 바로 거래" 2열 그리드, "여행 가서 직거래" 캐러셀(JP 직거래 상품 있을 때)
- 푸터 "사업자 정보 준비 중"
- `/?q=카메라`는 기존 리스트 모드 + 탭 노출, `/?tab=travel`도 리스트 모드
- 가로 오버플로 없음, 콘솔에 새 에러 없음(404 이미지는 기존)

- [ ] **Step 5: 테스트·린트·커밋**

Run: `npm test 2>&1 | tail -3 && npm run lint 2>&1 | tail -2`
Expected: `43 passed`, `0 errors`

```bash
git add components/HomeHub.tsx app/page.tsx
git commit -m "feat(home): 마켓 허브 홈 — 신뢰 스트립, 상대국 인기 캐러셀(Suspense), 국내 그리드, 여행 직거래, 푸터"
```

---

### Task 6: DESIGN.md v2 기록 + 크리틱

**Files:**
- Replace: `DESIGN.md` (+ `.impeccable/design.json` 사이드카)

- [ ] **Step 1: 디텍터 스캔**

```bash
node "C:\Users\seren\AppData\Roaming\Claude\local-agent-mode-sessions\829c25c3-e0c4-4121-b7c3-190b64b7f23a\62524e9c-916b-43c4-b63b-cff67739f476\rpm\plugin_019iKSinETqKDZNU2NVcNna2\skills\impeccable\scripts\detect.mjs" --json app/page.tsx app/layout.tsx components
```
Expected: `[]` (발견 시 수정 후 재실행 1회)

- [ ] **Step 2: DESIGN.md 교체**

`impeccable:impeccable-documenter` 서브에이전트를 띄워 현재 코드(`app/globals.css`, `tailwind.config.ts`, `components/*`, `app/page.tsx`)에서 v2 시스템을 도출해 `DESIGN.md`와 사이드카를 다시 쓰게 한다. 프롬프트에 Global Constraints 표를 그대로 전달하고, 기존 DESIGN.md는 anti-reference(교체 대상)임을 명시한다.

- [ ] **Step 3: 커밋**

```bash
git add DESIGN.md .impeccable/design.json
git commit -m "docs(design): DESIGN.md v2 — 흰 바탕·성숙한 브랜드 적용, 허브 컴포넌트 기록"
```

- [ ] **Step 4: 크리틱**

`/impeccable critique app/page.tsx` 재실행으로 추세(27 → 30 → ?) 기록. P0/P1이 나오면 별도 polish 라운드로 이관(이 계획 범위 밖).
