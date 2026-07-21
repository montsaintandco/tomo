# TOMO Plan 01 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js + Supabase 기반 프로젝트 스캐폴드, 전체 DB 스키마 + RLS, 이메일 인증 + 온보딩(국가/지역/언어), TOMO 디자인 토큰을 구축한다.

**Architecture:** Next.js 14 App Router 앱이 Supabase(Postgres/Auth/RLS)를 백엔드로 사용. 스키마는 SQL 마이그레이션으로 관리하고, 모든 테이블에 RLS를 켠 뒤 정책을 명시. 서버 전용 로직은 Route Handler에 둔다.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, @supabase/supabase-js, @supabase/ssr, Vitest

**스펙:** `outputs/2026-07-17-tomo-design-spec.md` (같은 폴더)

## Global Constraints

- 언어 값은 `'ko' | 'ja'`, 국가는 `'KR' | 'JP'`, 통화는 `'KRW' | 'JPY'` — 스펙 §5와 동일한 문자열만 사용
- 신뢰온도 기본값 `36.5` (스펙 §5)
- 플랫폼 수수료 10% (스펙 §6) — 이 플랜에서는 컬럼만 정의, 계산은 Plan 04
- 모든 테이블 RLS 활성화 (스펙 §9)
- 색상 토큰: 토모 블루 `#9CC5EC`, 토모 핑크 `#F2AFAF`, 하트 코랄 `#E2807F`, 아이보리 `#FBF9F4` (스펙 §2)
- Supabase 프로젝트는 이미 프로비저닝되어 있고 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 환경변수가 `.env.local`에 있다고 가정 (없으면 Task 0 참고)

---

### Task 0: Supabase 프로젝트 준비 (환경변수가 없을 때만)

**Files:**
- Create: `tomo/.env.local`

- [ ] **Step 1: Supabase 프로젝트 생성** — Supabase MCP `create_project` 또는 대시보드에서 `tomo` 프로젝트 생성
- [ ] **Step 2: 키 확인** — `get_project_url`, `get_publishable_keys`로 URL과 anon key, 대시보드에서 service role key 확보
- [ ] **Step 3: `.env.local` 작성**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

---

### Task 1: 프로젝트 스캐폴드

**Files:**
- Create: `tomo/` (create-next-app), `tomo/vitest.config.ts`, `tomo/lib/supabase/client.ts`, `tomo/lib/supabase/server.ts`

**Interfaces:**
- Produces: `createBrowserSupabase(): SupabaseClient` (client.ts), `createServerSupabase(): Promise<SupabaseClient>` (server.ts, cookie 기반), 이후 모든 플랜이 이 두 함수를 사용

- [ ] **Step 1: 앱 생성**

```bash
npx create-next-app@14 tomo --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm
cd tomo && git init && git add -A && git commit -m "chore: scaffold next.js app"
```

- [ ] **Step 2: 의존성 설치**

```bash
npm i @supabase/supabase-js @supabase/ssr
npm i -D vitest @vitest/coverage-v8 dotenv
```

- [ ] **Step 3: vitest 설정** — `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"], testTimeout: 20000 },
});
```

`package.json` scripts에 추가: `"test": "vitest run"`

- [ ] **Step 4: Supabase 클라이언트 헬퍼** — `lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

`lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) =>
          list.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );
}
```

- [ ] **Step 5: 빌드 확인 후 커밋**

```bash
npm run build
```
Expected: 빌드 성공 (경고 무시 가능)

```bash
git add -A && git commit -m "feat: supabase clients + vitest setup"
```

---

### Task 2: DB 스키마 마이그레이션

**Files:**
- Create: `tomo/supabase/migrations/0001_schema.sql`

**Interfaces:**
- Produces: 테이블 `profiles, listings, listing_translations, conversations, messages, transactions, exchange_rates, reviews` 및 enum들 — 이후 모든 플랜의 기반. 컬럼명은 아래 SQL이 유일한 진실 공급원.

- [ ] **Step 1: 마이그레이션 SQL 작성** — `supabase/migrations/0001_schema.sql`:

```sql
create type country_code as enum ('KR','JP');
create type currency_code as enum ('KRW','JPY');
create type listing_status as enum ('active','reserved','sold');
create type trade_method as enum ('direct','shipping','both');
create type center_code as enum ('SEOUL','NARITA');
create type tx_status as enum (
  'pending_payment','paid','shipped','shipped_to_center','center_received',
  'shipped_international','delivered','completed','cancelled','disputed');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  country country_code not null,
  region text not null,
  language text not null check (language in ('ko','ja')),
  trust_temp numeric(4,1) not null default 36.5,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references profiles(id),
  title text not null,
  description text not null,
  source_language text not null check (source_language in ('ko','ja')),
  price integer not null check (price > 0),
  currency currency_code not null,
  category text not null,
  status listing_status not null default 'active',
  trade_method trade_method not null,
  cross_border_enabled boolean not null default false,
  country country_code not null,
  region text not null,
  images text[] not null default '{}',
  reserved_at timestamptz,
  created_at timestamptz not null default now()
);
create index on listings (country, status, created_at desc);
create index on listings (cross_border_enabled, status);

create table listing_translations (
  listing_id uuid not null references listings(id) on delete cascade,
  language text not null check (language in ('ko','ja')),
  title text not null,
  description text not null,
  primary key (listing_id, language)
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id),
  buyer_id uuid not null references profiles(id),
  seller_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (listing_id, buyer_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text not null,
  body_translated text,
  created_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id),
  buyer_id uuid not null references profiles(id),
  seller_id uuid not null references profiles(id),
  status tx_status not null default 'pending_payment',
  is_cross_border boolean not null,
  center center_code,
  stripe_payment_intent_id text unique,
  domestic_tracking text,
  intl_tracking text,
  item_price integer not null,
  intl_shipping_fee integer not null default 0,
  platform_fee integer not null default 0,
  currency currency_code not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint center_required_for_cross_border
    check (not is_cross_border or center is not null)
);
create index on transactions (buyer_id), on transactions (seller_id);

create table exchange_rates (
  pair text primary key,
  rate numeric not null,
  updated_at timestamptz not null default now()
);
insert into exchange_rates (pair, rate) values ('JPY_KRW', 9.0), ('KRW_JPY', 0.111);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id),
  reviewer_id uuid not null references profiles(id),
  rating integer not null check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  unique (transaction_id, reviewer_id)
);
```

주의: `create index on transactions (buyer_id), on transactions (seller_id);`는 유효한 SQL이 아니므로 두 문장으로 나눠 작성:

```sql
create index on transactions (buyer_id);
create index on transactions (seller_id);
```

- [ ] **Step 2: 마이그레이션 적용** — Supabase MCP `apply_migration` (name: `schema`) 또는 `supabase db push`
- [ ] **Step 3: 검증** — `execute_sql`:

```sql
select table_name from information_schema.tables
where table_schema='public' order by table_name;
```
Expected: 8개 테이블 전부 나열

- [ ] **Step 4: 커밋**

```bash
git add supabase/ && git commit -m "feat: initial db schema"
```

---

### Task 3: RLS 정책 + 접근 차단 테스트

**Files:**
- Create: `tomo/supabase/migrations/0002_rls.sql`, `tomo/tests/rls.test.ts`

**Interfaces:**
- Consumes: Task 2 스키마
- Produces: RLS 정책. 규칙 — 쓰기 금지 테이블(`transactions`, `listing_translations`, `exchange_rates`)은 service role 전용

- [ ] **Step 1: RLS 마이그레이션 작성** — `supabase/migrations/0002_rls.sql`:

```sql
alter table profiles enable row level security;
alter table listings enable row level security;
alter table listing_translations enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table transactions enable row level security;
alter table exchange_rates enable row level security;
alter table reviews enable row level security;

create policy "profiles are public" on profiles for select using (true);
create policy "insert own profile" on profiles for insert with check (id = auth.uid());
create policy "update own profile" on profiles for update using (id = auth.uid());

create policy "listings are public" on listings for select using (true);
create policy "insert own listing" on listings for insert with check (seller_id = auth.uid());
create policy "update own listing" on listings for update using (seller_id = auth.uid());

create policy "translations are public" on listing_translations for select using (true);

create policy "participants read conversations" on conversations for select
  using (auth.uid() in (buyer_id, seller_id));
create policy "buyer starts conversation" on conversations for insert
  with check (buyer_id = auth.uid());

create policy "participants read messages" on messages for select
  using (exists (select 1 from conversations c
    where c.id = conversation_id and auth.uid() in (c.buyer_id, c.seller_id)));
create policy "participants send messages" on messages for insert
  with check (sender_id = auth.uid() and exists (select 1 from conversations c
    where c.id = conversation_id and auth.uid() in (c.buyer_id, c.seller_id)));

create policy "parties read transactions" on transactions for select
  using (auth.uid() in (buyer_id, seller_id));

create policy "rates are public" on exchange_rates for select using (true);

create policy "reviews are public" on reviews for select using (true);
create policy "reviewer writes own review" on reviews for insert
  with check (reviewer_id = auth.uid() and exists (select 1 from transactions t
    where t.id = transaction_id and auth.uid() in (t.buyer_id, t.seller_id)));
```

(insert/update 정책이 없는 테이블은 anon/authenticated의 쓰기가 전부 거부됨 — `transactions`, `listing_translations`, `exchange_rates`는 service role만 쓴다)

- [ ] **Step 2: 적용** — `apply_migration` (name: `rls`)
- [ ] **Step 3: 실패하는 테스트 작성** — `tests/rls.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, serviceKey);
let alice: SupabaseClient; // KR user
let bob: SupabaseClient;   // JP user
let aliceId: string, bobId: string;

async function signUp(email: string): Promise<[SupabaseClient, string]> {
  const c = createClient(url, anonKey);
  const { data, error } = await c.auth.signUp({ email, password: "test-pass-1234" });
  if (error) throw error;
  return [c, data.user!.id];
}

beforeAll(async () => {
  [alice, aliceId] = await signUp(`alice+${Date.now()}@test.tomo`);
  [bob, bobId] = await signUp(`bob+${Date.now()}@test.tomo`);
  await alice.from("profiles").insert({ id: aliceId, nickname: "alice", country: "KR", region: "서울 마포구", language: "ko" });
  await bob.from("profiles").insert({ id: bobId, nickname: "bob", country: "JP", region: "東京 新宿区", language: "ja" });
});

describe("RLS", () => {
  it("blocks updating another user's profile", async () => {
    const { data } = await bob.from("profiles").update({ nickname: "hacked" }).eq("id", aliceId).select();
    expect(data).toEqual([]); // RLS: 0 rows affected
  });

  it("blocks inserting a listing as someone else", async () => {
    const { error } = await bob.from("listings").insert({
      seller_id: aliceId, title: "x", description: "x", source_language: "ja",
      price: 100, currency: "JPY", category: "etc", trade_method: "shipping",
      country: "JP", region: "東京 新宿区",
    });
    expect(error).not.toBeNull();
  });

  it("blocks non-participants from reading conversations", async () => {
    const { data: listing } = await admin.from("listings").insert({
      seller_id: aliceId, title: "cam", description: "d", source_language: "ko",
      price: 1000, currency: "KRW", category: "etc", trade_method: "shipping",
      country: "KR", region: "서울 마포구",
    }).select().single();
    const { data: conv } = await admin.from("conversations").insert({
      listing_id: listing!.id, buyer_id: bobId, seller_id: aliceId,
    }).select().single();
    const outsider = createClient(url, anonKey);
    const { data } = await outsider.from("conversations").select().eq("id", conv!.id);
    expect(data).toEqual([]);
  });

  it("blocks direct writes to transactions from clients", async () => {
    const { error } = await alice.from("transactions").insert({
      listing_id: crypto.randomUUID(), buyer_id: aliceId, seller_id: bobId,
      is_cross_border: false, item_price: 1000, currency: "KRW",
    });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 4: 테스트 실행**

```bash
npx vitest run tests/rls.test.ts
```
Expected: PASS 4건. (참고: Supabase 이메일 확인이 켜져 있으면 signUp 세션이 없어 실패 — 대시보드 Auth 설정에서 "Confirm email" 비활성화 후 재실행)

- [ ] **Step 5: 커밋**

```bash
git add supabase/ tests/ && git commit -m "feat: rls policies + access tests"
```

---

### Task 4: 인증 + 온보딩

**Files:**
- Create: `tomo/app/(auth)/login/page.tsx`, `tomo/app/onboarding/page.tsx`, `tomo/middleware.ts`, `tomo/lib/regions.ts`

**Interfaces:**
- Consumes: Task 1 `createBrowserSupabase`, Task 2 `profiles`
- Produces: 로그인/가입 화면, 프로필 없는 사용자를 `/onboarding`으로 보내는 미들웨어, `REGIONS: Record<'KR'|'JP', string[]>` (lib/regions.ts)

- [ ] **Step 1: 지역 데이터** — `lib/regions.ts`:

```ts
export const REGIONS: Record<"KR" | "JP", string[]> = {
  KR: ["서울 강남구","서울 마포구","서울 송파구","부산 해운대구","인천 연수구","대구 수성구","대전 유성구","경기 성남시","경기 수원시","제주 제주시"],
  JP: ["東京 新宿区","東京 渋谷区","東京 世田谷区","大阪 中央区","大阪 北区","京都 中京区","名古屋 中区","福岡 博多区","札幌 中央区","横浜 西区"],
};
```

- [ ] **Step 2: 로그인/가입 페이지** — `app/(auth)/login/page.tsx`: 이메일+비밀번호 폼, `signInWithPassword` 실패 시 `signUp` 시도, 성공하면 `router.push("/onboarding")`. 클라이언트 컴포넌트(`"use client"`)로 작성하고 `createBrowserSupabase()` 사용. 에러는 폼 아래 텍스트로 표시.

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createBrowserSupabase();
    let { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) ({ error } = await supabase.auth.signUp({ email, password }));
    if (error) return setError(error.message);
    router.push("/onboarding");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-center text-2xl font-bold text-tomo-navy">TOMO</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input className="rounded-full border px-4 py-3" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="rounded-full border px-4 py-3" type="password" placeholder="비밀번호 / パスワード" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <button className="rounded-full bg-tomo-blue py-3 font-bold text-white">시작하기 · はじめる</button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 3: 온보딩 페이지** — `app/onboarding/page.tsx`: 닉네임, 국가(KR/JP 토글), 국가에 따른 `REGIONS` 셀렉트, 언어(ko/ja) 선택 → `profiles` insert 후 `/`로 이동. 이미 프로필 있으면 즉시 `/`로 redirect.

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { REGIONS } from "@/lib/regions";

export default function OnboardingPage() {
  const [nickname, setNickname] = useState("");
  const [country, setCountry] = useState<"KR" | "JP">("KR");
  const [region, setRegion] = useState(REGIONS.KR[0]);
  const [language, setLanguage] = useState<"ko" | "ja">("ko");
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createBrowserSupabase();

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return router.replace("/login");
      const { data: p } = await supabase.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
      if (p) router.replace("/");
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { data } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").insert({
      id: data.user!.id, nickname, country, region, language,
    });
    if (error) return setError(error.message);
    router.push("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-bold">프로필 만들기 · プロフィール作成</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input className="rounded-full border px-4 py-3" placeholder="닉네임 · ニックネーム" value={nickname} onChange={(e) => setNickname(e.target.value)} required maxLength={20} />
        <div className="flex gap-2">
          {(["KR", "JP"] as const).map((c) => (
            <button type="button" key={c}
              className={`flex-1 rounded-full py-3 font-bold ${country === c ? (c === "KR" ? "bg-tomo-blue text-white" : "bg-tomo-pink text-white") : "border"}`}
              onClick={() => { setCountry(c); setRegion(REGIONS[c][0]); setLanguage(c === "KR" ? "ko" : "ja"); }}>
              {c === "KR" ? "한국" : "日本"}
            </button>
          ))}
        </div>
        <select className="rounded-full border px-4 py-3" value={region} onChange={(e) => setRegion(e.target.value)}>
          {REGIONS[country].map((r) => <option key={r}>{r}</option>)}
        </select>
        <select className="rounded-full border px-4 py-3" value={language} onChange={(e) => setLanguage(e.target.value as "ko" | "ja")}>
          <option value="ko">한국어</option>
          <option value="ja">日本語</option>
        </select>
        <button className="rounded-full bg-tomo-coral py-3 font-bold text-white">완료 · 完了</button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 4: 미들웨어** — `middleware.ts`: 세션 없으면 `/login`으로. `@supabase/ssr`의 `createServerClient`로 세션 갱신.

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    }
  );
  const { data } = await supabase.auth.getUser();
  const isPublic = req.nextUrl.pathname.startsWith("/login");
  if (!data.user && !isPublic) return NextResponse.redirect(new URL("/login", req.url));
  return res;
}

export const config = { matcher: ["/((?!_next|favicon|.*\\..*).*)"] };
```

- [ ] **Step 5: 수동 검증** — `npm run dev` 후: 비로그인 `/` 접근 → `/login` 리다이렉트, 가입 → 온보딩 → 프로필 저장 → `/` 이동, Supabase 대시보드에서 `profiles` 행 확인
- [ ] **Step 6: 커밋**

```bash
git add -A && git commit -m "feat: auth + onboarding"
```

---

### Task 5: TOMO 디자인 토큰 + 기본 레이아웃

**Files:**
- Modify: `tomo/tailwind.config.ts`, `tomo/app/layout.tsx`, `tomo/app/globals.css`
- Create: `tomo/components/BottomNav.tsx`, `tomo/app/page.tsx` (플레이스홀더 홈)

**Interfaces:**
- Produces: Tailwind 색상 `tomo-blue #9CC5EC`, `tomo-pink #F2AFAF`, `tomo-coral #E2807F`, `tomo-ivory #FBF9F4`, `tomo-navy #0C447C` / 하단 네비 `<BottomNav />` (홈·등록·채팅·프로필) — Plan 02~04의 모든 화면이 사용

- [ ] **Step 1: Tailwind 토큰** — `tailwind.config.ts`의 `theme.extend`:

```ts
colors: {
  "tomo-blue": "#9CC5EC",
  "tomo-pink": "#F2AFAF",
  "tomo-coral": "#E2807F",
  "tomo-ivory": "#FBF9F4",
  "tomo-navy": "#0C447C",
},
borderRadius: { card: "16px" },
```

- [ ] **Step 2: 폰트** — `app/layout.tsx`에서 Google Fonts로 M PLUS Rounded 1c 로드, `globals.css`에 Cafe24 써라운드 CDN `@font-face` 추가, body에 `bg-tomo-ivory` 적용:

```css
@font-face {
  font-family: "Cafe24Ssurround";
  src: url("https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_2105@1.0/Cafe24Ssurround.woff") format("woff");
  font-weight: 700;
  font-display: swap;
}
```

layout body className: `bg-tomo-ivory font-sans` + `<BottomNav />` 포함

- [ ] **Step 3: 하단 네비** — `components/BottomNav.tsx`:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "홈" },
  { href: "/sell", label: "판매" },
  { href: "/chat", label: "채팅" },
  { href: "/profile/me", label: "마이" },
] as const;

export default function BottomNav() {
  const path = usePathname();
  if (path.startsWith("/login") || path.startsWith("/onboarding")) return null;
  return (
    <nav className="fixed bottom-0 left-0 right-0 mx-auto flex max-w-md justify-around rounded-t-card border-t bg-white py-3">
      {items.map((i) => (
        <Link key={i.href} href={i.href}
          className={`text-sm font-bold ${path === i.href ? "text-tomo-navy" : "text-gray-400"}`}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: 플레이스홀더 홈** — `app/page.tsx`를 "피드는 Plan 02에서" 문구와 TOMO 워드마크만 있는 서버 컴포넌트로 교체
- [ ] **Step 5: 검증 & 커밋** — `npm run build` 성공 확인 후:

```bash
git add -A && git commit -m "feat: tomo design tokens + layout"
```

---

## Self-Review 결과

- 스펙 커버리지: Plan 01 범위(스캐폴드/스키마/RLS/인증·온보딩/디자인 토큰) 전부 태스크 존재. 스펙의 나머지(§상품·채팅·거래)는 Plan 02~04에서
- 플레이스홀더: 없음 — 모든 코드 스텝에 실제 코드 포함
- 타입 일관성: enum 문자열(`KR/JP`, `ko/ja`, `KRW/JPY`, `SEOUL/NARITA`), `createBrowserSupabase`/`createServerSupabase`, Tailwind 토큰명이 태스크 간 일치
