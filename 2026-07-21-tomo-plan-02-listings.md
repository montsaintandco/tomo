# TOMO Plan 02 — 상품 (등록·번역·피드·상세·검색) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상품 등록(이미지 업로드 + 자동 ko↔ja 번역), 홈 피드(전체/내 동네/해외직구 탭 + 환산가), 상품 상세(원문 토글), 검색을 실제 동작하게 구축한다.

**Architecture:** 등록은 서버 Route Handler가 처리(번역 API 키는 서버 전용). 번역은 `@anthropic-ai/sdk`로 등록 시 1회 생성·저장, 실패해도 등록은 성공(스펙 §9). 피드·상세는 서버 컴포넌트가 Supabase에서 직접 조회. 이미지 업로드는 클라이언트→Supabase Storage 직행.

**Tech Stack:** 기존 스택 + `@anthropic-ai/sdk` (모델 `claude-opus-4-8`)

## Global Constraints

- 언어 `'ko'|'ja'`, 국가 `'KR'|'JP'`, 통화 `'KRW'|'JPY'` (스펙 §5)
- 환산가는 참고 표시: `"¥12,000 (약 108,000원)"` 형식 (스펙 §3.8)
- 번역 실패 시 등록·발송은 성공, "번역 준비 중" 표시 (스펙 §9)
- ANTHROPIC_API_KEY 미설정 시 번역 스킵(null) — 오류 아님
- 카테고리 값: `'figure','camera','fashion','kpop','game','vintage','etc'`
- Supabase project_id `zftztnkczlblnkgaijzc`. 저장소 /sessions/determined-magical-hopper/mnt/outputs/tomo, 빌드는 /tmp/build/tomo (rsync 후)
- 신규 npm 의존성은 /tmp/build/tomo에서 설치 후 package.json/lock을 저장소로 역복사

---

### Task 1: 번역·환율 유틸 (단위 테스트 포함)

**Files:**
- Create: `lib/currency.ts`, `lib/translate.ts`, `tests/currency.test.ts`
- Modify: `package.json` (@anthropic-ai/sdk 추가)

**Interfaces:**
- Produces: `convertPrice(amount: number, from: "KRW"|"JPY", rate: number): number` — 반올림 정수
- Produces: `formatPrice(amount: number, currency: "KRW"|"JPY"): string` — `"¥12,000"` / `"108,000원"`
- Produces: `formatWithConversion(amount, currency, rate, viewerCurrency): string` — 동일 통화면 formatPrice만, 다르면 `"¥12,000 (약 108,000원)"`
- Produces: `translateListing(input: {title: string; description: string; from: "ko"|"ja"}): Promise<{title: string; description: string} | null>` — 서버 전용, 키 없음/실패 시 null

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/currency.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { convertPrice, formatPrice, formatWithConversion } from "../lib/currency";

describe("currency", () => {
  it("converts JPY to KRW with rate", () => {
    expect(convertPrice(12000, "JPY", 9.0)).toBe(108000);
  });
  it("rounds converted amounts", () => {
    expect(convertPrice(999, "JPY", 9.01)).toBe(9001);
  });
  it("formats KRW and JPY", () => {
    expect(formatPrice(108000, "KRW")).toBe("108,000원");
    expect(formatPrice(12000, "JPY")).toBe("¥12,000");
  });
  it("shows conversion hint only across currencies", () => {
    expect(formatWithConversion(12000, "JPY", 9.0, "KRW")).toBe("¥12,000 (약 108,000원)");
    expect(formatWithConversion(50000, "KRW", 9.0, "KRW")).toBe("50,000원");
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인** — `npx vitest run tests/currency.test.ts` → FAIL (module not found)
- [ ] **Step 3: 구현** — `lib/currency.ts`:

```ts
export type Currency = "KRW" | "JPY";

export function convertPrice(amount: number, from: Currency, rate: number): number {
  return Math.round(amount * rate);
}

export function formatPrice(amount: number, currency: Currency): string {
  const n = amount.toLocaleString("en-US");
  return currency === "JPY" ? `¥${n}` : `${n}원`;
}

export function formatWithConversion(
  amount: number, currency: Currency, rate: number, viewerCurrency: Currency
): string {
  const base = formatPrice(amount, currency);
  if (currency === viewerCurrency) return base;
  const converted = convertPrice(amount, currency, rate);
  return `${base} (약 ${formatPrice(converted, viewerCurrency)})`;
}
```

- [ ] **Step 4: 테스트 통과 확인** — 4/4 PASS
- [ ] **Step 5: SDK 설치** — /tmp/build/tomo에서 `npm i @anthropic-ai/sdk`, package.json+package-lock.json을 저장소로 복사
- [ ] **Step 6: 번역 모듈** — `lib/translate.ts` (서버 전용):

```ts
import Anthropic from "@anthropic-ai/sdk";

const LANG_NAME = { ko: "Korean", ja: "Japanese" } as const;

export async function translateListing(input: {
  title: string; description: string; from: "ko" | "ja";
}): Promise<{ title: string; description: string } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const to = input.from === "ko" ? "ja" : "ko";
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `Translate this secondhand marketplace listing from ${LANG_NAME[input.from]} to ${LANG_NAME[to]}. Keep the tone casual and natural for a marketplace. Reply with ONLY a JSON object {"title": "...", "description": "..."} and nothing else.\n\nTitle: ${input.title}\nDescription: ${input.description}`,
      }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    const jsonText = block.text.slice(block.text.indexOf("{"), block.text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(jsonText);
    if (typeof parsed.title !== "string" || typeof parsed.description !== "string") return null;
    return { title: parsed.title, description: parsed.description };
  } catch {
    return null;
  }
}
```

- [ ] **Step 7: 빌드 확인 + 커밋** — `git add -A && git commit -m "feat: currency + translation utils"`

---

### Task 2: Storage 버킷·번역 RLS + 등록 API + /sell

**Files:**
- Create: `supabase/migrations/0004_storage_and_translations.sql`, `app/api/listings/route.ts`, `app/sell/page.tsx`

**Interfaces:**
- Consumes: `translateListing` (Task 1), `createServerSupabase`/`createBrowserSupabase` (Plan 01)
- Produces: `POST /api/listings` — body `{title, description, price, category, tradeMethod: 'direct'|'shipping'|'both', crossBorder: boolean, images: string[]}` → `{id}` 201 / `{error}` 4xx. 판매자 country/region/currency/언어는 프로필에서 서버가 결정
- Produces: Storage 버킷 `listing-images` (공개 읽기, 인증자 업로드)

- [ ] **Step 1: 마이그레이션** — `supabase/migrations/0004_storage_and_translations.sql`:

```sql
insert into storage.buckets (id, name, public) values ('listing-images','listing-images', true)
on conflict (id) do nothing;

create policy "anyone reads listing images" on storage.objects for select
  using (bucket_id = 'listing-images');
create policy "authenticated uploads listing images" on storage.objects for insert
  to authenticated with check (bucket_id = 'listing-images');

create policy "seller writes own listing translations" on listing_translations for insert
  with check (exists (select 1 from listings l where l.id = listing_id and l.seller_id = auth.uid()));
```

MCP `apply_migration` (name: `storage_and_translations`)로 적용.

- [ ] **Step 2: 등록 API** — `app/api/listings/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { translateListing } from "@/lib/translate";

const CATEGORIES = ["figure","camera","fashion","kpop","game","vintage","etc"];
const METHODS = ["direct","shipping","both"];

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles")
    .select("country, region, language").eq("id", auth.user.id).single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 400 });

  const body = await req.json();
  const { title, description, price, category, tradeMethod, crossBorder, images } = body;
  if (!title || !description || !Number.isInteger(price) || price <= 0)
    return NextResponse.json({ error: "invalid fields" }, { status: 400 });
  if (!CATEGORIES.includes(category) || !METHODS.includes(tradeMethod))
    return NextResponse.json({ error: "invalid category or method" }, { status: 400 });

  const { data: listing, error } = await supabase.from("listings").insert({
    seller_id: auth.user.id,
    title, description,
    source_language: profile.language,
    price,
    currency: profile.country === "KR" ? "KRW" : "JPY",
    category,
    trade_method: tradeMethod,
    cross_border_enabled: !!crossBorder,
    country: profile.country,
    region: profile.region,
    images: Array.isArray(images) ? images.slice(0, 5) : [],
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const translated = await translateListing({
    title, description, from: profile.language as "ko" | "ja",
  });
  if (translated) {
    await supabase.from("listing_translations").insert({
      listing_id: listing.id,
      language: profile.language === "ko" ? "ja" : "ko",
      title: translated.title,
      description: translated.description,
    });
  }
  return NextResponse.json({ id: listing.id }, { status: 201 });
}
```

- [ ] **Step 3: /sell 페이지** — `app/sell/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

const CATEGORIES = [
  ["figure","피규어"],["camera","카메라"],["fashion","패션"],["kpop","K-POP"],
  ["game","게임"],["vintage","빈티지"],["etc","기타"],
] as const;

export default function SellPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("etc");
  const [tradeMethod, setTradeMethod] = useState<"direct"|"shipping"|"both">("both");
  const [crossBorder, setCrossBorder] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const supabase = createBrowserSupabase();
      const { data: auth } = await supabase.auth.getUser();
      const images: string[] = [];
      for (const f of files.slice(0, 5)) {
        const path = `${auth.user!.id}/${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const { error: upErr } = await supabase.storage.from("listing-images").upload(path, f);
        if (upErr) throw upErr;
        images.push(supabase.storage.from("listing-images").getPublicUrl(path).data.publicUrl);
      }
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, price: parseInt(price, 10), category, tradeMethod, crossBorder, images }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      router.push(`/listings/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <h1 className="mb-4 text-xl font-bold text-tomo-navy">판매하기 · 出品する</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="text-sm font-bold">사진 (최대 5장)
          <input type="file" accept="image/*" multiple className="mt-1 block w-full text-sm"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
        <label className="text-sm font-bold">제목
          <input className="mt-1 w-full rounded-full border px-4 py-3" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} />
        </label>
        <label className="text-sm font-bold">설명
          <textarea className="mt-1 w-full rounded-card border px-4 py-3" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={2000} />
        </label>
        <label className="text-sm font-bold">가격
          <input className="mt-1 w-full rounded-full border px-4 py-3" type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} required />
        </label>
        <label className="text-sm font-bold">카테고리
          <select className="mt-1 w-full rounded-full border px-4 py-3" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <fieldset className="flex gap-2">
          {([["direct","직거래"],["shipping","배송"],["both","둘 다"]] as const).map(([v, l]) => (
            <button type="button" key={v}
              className={`flex-1 rounded-full py-2 text-sm font-bold ${tradeMethod === v ? "bg-tomo-blue text-white" : "border"}`}
              onClick={() => setTradeMethod(v)}>{l}</button>
          ))}
        </fieldset>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={crossBorder} onChange={(e) => setCrossBorder(e.target.checked)} />
          해외 판매 허용 (센터 경유 배송)
        </label>
        <button disabled={busy} className="rounded-full bg-tomo-coral py-3 font-bold text-white disabled:opacity-50">
          {busy ? "등록 중…" : "등록하기 · 出品"}
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 4: 검증** — 빌드 통과 + (curl로) 미인증 POST /api/listings → 401 확인
- [ ] **Step 5: 커밋** — `git add -A && git commit -m "feat: listing creation with storage + translation"`

---

### Task 3: 홈 피드

**Files:**
- Modify: `app/page.tsx`, `components/BottomNav.tsx`
- Create: `components/ListingCard.tsx`, `lib/listings.ts`

**Interfaces:**
- Consumes: `formatWithConversion` (Task 1)
- Produces: `getViewer(supabase): Promise<{id, country, region, language, currency, rate} | null>` (lib/listings.ts) — rate는 상대통화→내통화 환율 (exchange_rates에서 조회, JPY_KRW 또는 KRW_JPY)
- Produces: `<ListingCard listing={...} viewer={...} />` — 번역 제목 우선, 환산가 표시. Task 4·5도 사용

- [ ] **Step 1: 뷰어 헬퍼** — `lib/listings.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type Viewer = {
  id: string; country: "KR" | "JP"; region: string;
  language: "ko" | "ja"; currency: "KRW" | "JPY"; rate: number;
};

export async function getViewer(supabase: SupabaseClient): Promise<Viewer | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: p } = await supabase.from("profiles")
    .select("country, region, language").eq("id", auth.user.id).single();
  if (!p) return null;
  const currency = p.country === "KR" ? "KRW" : "JPY";
  const pair = currency === "KRW" ? "JPY_KRW" : "KRW_JPY";
  const { data: r } = await supabase.from("exchange_rates").select("rate").eq("pair", pair).single();
  return { id: auth.user.id, country: p.country, region: p.region, language: p.language, currency, rate: Number(r?.rate ?? 0) };
}

export function displayTitle(
  l: { title: string; source_language: string; listing_translations: { language: string; title: string }[] },
  viewerLanguage: string
): string {
  if (l.source_language === viewerLanguage) return l.title;
  return l.listing_translations.find((t) => t.language === viewerLanguage)?.title ?? l.title;
}
```

- [ ] **Step 2: 카드 컴포넌트** — `components/ListingCard.tsx`:

```tsx
import Link from "next/link";
import { formatWithConversion, type Currency } from "@/lib/currency";
import { displayTitle } from "@/lib/listings";
import type { Viewer } from "@/lib/listings";

export type FeedListing = {
  id: string; title: string; price: number; currency: Currency;
  source_language: string; country: "KR" | "JP"; region: string;
  status: string; images: string[];
  listing_translations: { language: string; title: string }[];
};

export default function ListingCard({ listing, viewer }: { listing: FeedListing; viewer: Viewer }) {
  const foreign = listing.country !== viewer.country;
  return (
    <Link href={`/listings/${listing.id}`}
      className="flex flex-col overflow-hidden rounded-card border bg-white">
      <div className="relative aspect-square bg-gray-100">
        {listing.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.images[0]} alt="" className="h-full w-full object-cover" />
        )}
        <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold text-white ${listing.country === "KR" ? "bg-tomo-blue" : "bg-tomo-pink"}`}>
          {listing.country}
        </span>
        {listing.status !== "active" && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 font-bold text-white">
            {listing.status === "reserved" ? "예약중" : "거래완료"}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 p-2">
        <p className="truncate text-sm">{displayTitle(listing, viewer.language)}</p>
        <p className="text-sm font-bold text-tomo-navy">
          {formatWithConversion(listing.price, listing.currency, foreign ? viewer.rate : 1, viewer.currency)}
        </p>
        <p className="text-xs text-gray-400">{listing.region}</p>
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: 홈 피드** — `app/page.tsx` (서버 컴포넌트) 교체:

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import ListingCard, { type FeedListing } from "@/components/ListingCard";
import Link from "next/link";
import { redirect } from "next/navigation";

const TABS = [["all","전체"],["local","내 동네"],["global","해외직구"]] as const;

export default async function Home({ searchParams }: { searchParams: { tab?: string; q?: string } }) {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/onboarding");
  const tab = searchParams.tab ?? "all";
  const q = searchParams.q?.trim();

  let query = supabase.from("listings")
    .select("id, title, price, currency, source_language, country, region, status, images, listing_translations(language, title)")
    .order("created_at", { ascending: false }).limit(40);

  if (tab === "local") query = query.eq("country", viewer.country).eq("region", viewer.region).in("trade_method", ["direct", "both"]);
  else if (tab === "global") query = query.neq("country", viewer.country).eq("cross_border_enabled", true);

  if (q) {
    const { data: tIds } = await supabase.from("listing_translations")
      .select("listing_id").ilike("title", `%${q}%`).limit(40);
    const ids = (tIds ?? []).map((t) => t.listing_id);
    query = ids.length > 0
      ? query.or(`title.ilike.%${q}%,id.in.(${ids.join(",")})`)
      : query.ilike("title", `%${q}%`);
  }

  const { data: listings } = await query;

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-tomo-navy">TOMO</h1>
      </div>
      <form className="mb-3">
        <input name="q" defaultValue={q ?? ""} placeholder="검색 · 検索"
          className="w-full rounded-full border px-4 py-2 text-sm" />
        {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
      </form>
      <div className="mb-4 flex gap-2">
        {TABS.map(([v, l]) => (
          <Link key={v} href={v === "all" ? "/" : `/?tab=${v}`}
            className={`rounded-full px-4 py-1.5 text-sm font-bold ${tab === v ? "bg-tomo-navy text-white" : "border bg-white"}`}>
            {l}
          </Link>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(listings ?? []).map((l) => (
          <ListingCard key={l.id} listing={l as unknown as FeedListing} viewer={viewer} />
        ))}
      </div>
      {(listings ?? []).length === 0 && (
        <p className="mt-16 text-center text-sm text-gray-400">아직 상품이 없어요 · まだ商品がありません</p>
      )}
    </main>
  );
}
```

- [ ] **Step 4: BottomNav 액티브 수정** — `components/BottomNav.tsx`의 클래스 판정을 다음으로 교체:

```tsx
const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
```

(className에서 `path === i.href` 대신 `active` 사용)

- [ ] **Step 5: 빌드 + 커밋** — `git add -A && git commit -m "feat: home feed with tabs, search, converted prices"`

---

### Task 4: 상품 상세

**Files:**
- Create: `app/listings/[id]/page.tsx`, `components/OriginalToggle.tsx`

**Interfaces:**
- Consumes: `getViewer`, `formatWithConversion`
- Produces: `/listings/[id]` — 이미지, 번역 제목·설명(원문 토글), 환산가, 판매자 닉네임·신뢰온도, "채팅하기" 링크(`/chat?listing=[id]`, Plan 03에서 구현), 본인 상품이면 미표시

- [ ] **Step 1: 원문 토글 (클라이언트)** — `components/OriginalToggle.tsx`:

```tsx
"use client";
import { useState } from "react";

export default function OriginalToggle(props: {
  translatedTitle: string; translatedDesc: string;
  originalTitle: string; originalDesc: string; hasTranslation: boolean;
}) {
  const [showOriginal, setShowOriginal] = useState(!props.hasTranslation);
  const title = showOriginal ? props.originalTitle : props.translatedTitle;
  const desc = showOriginal ? props.originalDesc : props.translatedDesc;
  return (
    <div>
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{desc}</p>
      {props.hasTranslation ? (
        <button className="mt-2 text-xs font-bold text-tomo-navy underline"
          onClick={() => setShowOriginal(!showOriginal)}>
          {showOriginal ? "번역 보기 · 翻訳を見る" : "원문 보기 · 原文を見る"}
        </button>
      ) : (
        <p className="mt-2 text-xs text-gray-400">번역 준비 중 · 翻訳準備中</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 상세 페이지** — `app/listings/[id]/page.tsx`:

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { formatWithConversion } from "@/lib/currency";
import OriginalToggle from "@/components/OriginalToggle";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export default async function ListingDetail({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/onboarding");

  const { data: l } = await supabase.from("listings")
    .select("*, listing_translations(language, title, description), profiles!listings_seller_id_fkey(id, nickname, trust_temp, region, country)")
    .eq("id", params.id).maybeSingle();
  if (!l) notFound();

  const needsTranslation = l.source_language !== viewer.language;
  const t = l.listing_translations.find((x: { language: string }) => x.language === viewer.language);
  const foreign = l.country !== viewer.country;
  const seller = l.profiles;

  return (
    <main className="mx-auto max-w-md pb-24">
      <div className="grid grid-cols-1 gap-1">
        {(l.images as string[]).map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={src} alt="" className="aspect-square w-full object-cover" />
        ))}
      </div>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between rounded-card border bg-white p-3">
          <div>
            <p className="font-bold">{seller.nickname}</p>
            <p className="text-xs text-gray-400">{seller.region}</p>
          </div>
          <span className="rounded-full bg-tomo-coral px-3 py-1 text-sm font-bold text-white">
            ♥ {Number(seller.trust_temp).toFixed(1)}°
          </span>
        </div>
        <OriginalToggle
          translatedTitle={t?.title ?? l.title}
          translatedDesc={t?.description ?? l.description}
          originalTitle={l.title}
          originalDesc={l.description}
          hasTranslation={!needsTranslation || !!t}
        />
        <p className="text-xl font-bold text-tomo-navy">
          {formatWithConversion(l.price, l.currency, foreign ? viewer.rate : 1, viewer.currency)}
        </p>
        {foreign && (
          <p className="rounded-card bg-tomo-ivory p-3 text-xs text-gray-500">
            해외 상품 — {l.country === "JP" ? "나리타 센터" : "서울 센터"} 경유 배송 · 국제배송비 별도
          </p>
        )}
        {viewer.id !== seller.id && l.status === "active" && (
          <div className="flex gap-2">
            <Link href={`/chat?listing=${l.id}`}
              className="flex-1 rounded-full border border-tomo-navy py-3 text-center font-bold text-tomo-navy">
              채팅하기
            </Link>
            <button className="flex-1 rounded-full bg-tomo-coral py-3 font-bold text-white" disabled>
              안전결제 (준비 중)
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
```

(안전결제 버튼은 Plan 04에서 활성화 — disabled placeholder는 스펙 §3 MVP 흐름상 허용)

- [ ] **Step 3: 빌드 + 커밋** — `git add -A && git commit -m "feat: listing detail with original toggle"`

---

### Task 5: E2E 시드 + 통합 검증

**Files:**
- Create: `scripts/seed-demo.ts`, `tests/listings-api.test.ts`

**Interfaces:**
- Consumes: 전체
- Produces: 데모 데이터(서울 셀러 상품 2, 도쿄 셀러 상품 2 — tomo.test.alice/bob 계정), API 통합 테스트

- [ ] **Step 1: 통합 테스트 작성** — `tests/listings-api.test.ts` (라이브 Supabase 사용, 로그인 후 listings+translations 조회 규칙 검증):

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
let alice: SupabaseClient;
let aliceId: string;

beforeAll(async () => {
  alice = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await alice.auth.signInWithPassword({
    email: "tomo.test.alice@gmail.com", password: "test-pass-1234",
  });
  if (error) throw error;
  aliceId = data.user!.id;
});

describe("listings", () => {
  it("seller can insert own listing and translation", async () => {
    const { data: listing, error } = await alice.from("listings").insert({
      seller_id: aliceId, title: "테스트 상품", description: "설명", source_language: "ko",
      price: 10000, currency: "KRW", category: "etc", trade_method: "both",
      country: "KR", region: "서울 마포구", cross_border_enabled: true,
    }).select().single();
    expect(error).toBeNull();
    const { error: te } = await alice.from("listing_translations").insert({
      listing_id: listing!.id, language: "ja", title: "テスト商品", description: "説明",
    });
    expect(te).toBeNull();
  });

  it("seller cannot write translations for others' listings", async () => {
    const bob = createClient(url, anonKey, { auth: { persistSession: false } });
    await bob.auth.signInWithPassword({ email: "tomo.test.bob@gmail.com", password: "test-pass-1234" });
    const { data: mine } = await alice.from("listings").select("id").eq("seller_id", aliceId).limit(1).single();
    const { error } = await bob.from("listing_translations").insert({
      listing_id: mine!.id, language: "ja", title: "x", description: "x",
    });
    expect(error).not.toBeNull();
  });

  it("feed query returns translations inline", async () => {
    const { data } = await alice.from("listings")
      .select("id, title, listing_translations(language, title)")
      .eq("seller_id", aliceId).limit(1).single();
    expect(data!.listing_translations.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 실행 → 통과 확인** (0004 마이그레이션 적용 후여야 함)
- [ ] **Step 3: 데모 시드** — `scripts/seed-demo.ts`: alice(서울)·bob(도쿄) 계정으로 로그인해 각 2개 상품 등록 (이미지 없는 텍스트 상품, 번역은 반대 언어 수동 삽입). `npx tsx` 없으면 vitest 없이 `node --loader` 대신 간단히 테스트 러너로 실행하거나 supabase-js 스크립트를 `npx tsx scripts/seed-demo.ts`로 실행 (tsx 미설치 시 /tmp/build/tomo에 devDependency로 추가):

```ts
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const DEMO = [
  { email: "tomo.test.alice@gmail.com", items: [
    { title: "뉴진스 포카 일괄", description: "포토카드 5장 일괄 판매합니다", category: "kpop", price: 25000, currency: "KRW", country: "KR", region: "서울 마포구", lang: "ko", tTitle: "NewJeans トレカ まとめ売り", tDesc: "フォトカード5枚まとめて販売します", tLang: "ja" },
    { title: "필름카메라 니콘 FM2", description: "작동 완벽, 스크래치 약간", category: "camera", price: 350000, currency: "KRW", country: "KR", region: "서울 마포구", lang: "ko", tTitle: "フィルムカメラ Nikon FM2", tDesc: "動作完璧、小傷あり", tLang: "ja" },
  ]},
  { email: "tomo.test.bob@gmail.com", items: [
    { title: "ポケモンカード 旧裏 リザードン", description: "状態はプレイ用です", category: "game", price: 48000, currency: "JPY", country: "JP", region: "東京 新宿区", lang: "ja", tTitle: "포켓몬카드 구뒷면 리자몽", tDesc: "상태는 플레이용입니다", tLang: "ko" },
    { title: "無印良品 リュック 黒", description: "半年使用、美品", category: "fashion", price: 1800, currency: "JPY", country: "JP", region: "東京 新宿区", lang: "ja", tTitle: "무인양품 백팩 블랙", tDesc: "반년 사용, 상태 좋음", tLang: "ko" },
  ]},
];

async function main() {
  for (const u of DEMO) {
    const c = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: auth, error } = await c.auth.signInWithPassword({ email: u.email, password: "test-pass-1234" });
    if (error) throw error;
    for (const it of u.items) {
      const { data: existing } = await c.from("listings").select("id").eq("seller_id", auth.user!.id).eq("title", it.title).maybeSingle();
      if (existing) continue;
      const { data: l, error: le } = await c.from("listings").insert({
        seller_id: auth.user!.id, title: it.title, description: it.description,
        source_language: it.lang, price: it.price, currency: it.currency,
        category: it.category, trade_method: "both", cross_border_enabled: true,
        country: it.country, region: it.region,
      }).select("id").single();
      if (le) throw le;
      const { error: te } = await c.from("listing_translations").insert({
        listing_id: l!.id, language: it.tLang, title: it.tTitle, description: it.tDesc,
      });
      if (te) throw te;
      console.log("seeded:", it.title);
    }
  }
}
main();
```

- [ ] **Step 4: 시드 실행 + 홈 렌더 확인** — `next build && next start`로 `/` HTML에 시드 상품 노출 확인 (로그인 세션 필요하므로 curl 확인은 /login 리다이렉트까지, 상품 노출은 DB 조회로 대체 검증 가능)
- [ ] **Step 5: 전체 테스트 + 커밋** — `npx vitest run` 전부 PASS → `git add -A && git commit -m "feat: demo seed + listings integration tests"`

---

## Self-Review 결과

- 스펙 커버리지: 등록(§7.1)·피드/탭/환산가(§7.2)·검색(번역본 포함, §7.2)·상세/원문토글(§7.2)·번역 실패 허용(§9) 모두 태스크 존재. 채팅·결제는 Plan 03/04
- 플레이스홀더: 없음. "안전결제 (준비 중)" disabled 버튼은 Plan 04 전까지의 명시적 UI 상태
- 타입 일관성: `FeedListing`/`Viewer`/`Currency` 정의 후 소비 일치, 카테고리·거래방식 값 서버·클라이언트 동일 배열
