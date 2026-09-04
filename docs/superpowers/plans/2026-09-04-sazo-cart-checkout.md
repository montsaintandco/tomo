# 사줘식 장바구니·주문서·결제 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 외부마켓 상품을 장바구니에 담아 배송지·결제수단을 고르고 Stripe로 주문 시 1회 결제하는 SAZO식 흐름.

**Architecture:** `cart_items`(본인 RLS 직접 CRUD) → `create_proxy_order` RPC가 서버에서 금액 재계산·`proxy_orders`(결제 단위) + 항목별 `proxy_requests`(진행 단위) 생성 → Stripe Checkout(`payment_method_types`) → 웹훅 `mark_proxy_order_paid`. 기존 어드민 큐·`advance_proxy` 매트릭스는 그대로. 경매는 기존 견적 경로 유지.

**Tech Stack:** Next 16 App Router, React 19, Tailwind(DESIGN.md v2 토큰), Supabase(RLS + SECURITY DEFINER), Stripe Checkout, vitest.

스펙: `docs/superpowers/specs/2026-09-04-sazo-cart-checkout-design.md`

## Global Constraints

- 서버 컴포넌트 기본, 클라이언트는 `"use client"` 파일만. UI 문자열은 전부 `t(lang, key)` — 하드코딩 금지(어드민 화면 제외).
- `lib/i18n.ts` 사전: 모든 키에 ko·ja 둘 다, **ja가 ko와 달라야** 함(`tests/i18n.test.ts`가 검사).
- 디자인: 흰 페이지, `.card`/`.btn`/`.press`/`.tnum` 유틸, 라운드 `rounded-card`/`rounded-full`, 텍스트 11–17px, 가격 17px/800 `text-tomo-navy`, 안내 웰 `bg-tomo-navy/5`, 터치 타깃 44px.
- 돈 쓰기는 함수 경유만. 테이블 직접 insert/update/delete는 revoke.
- API 라우트는 미들웨어 밖 — 자체 `supabase.auth.getUser()` 인증. Stripe 키 없으면 503 `{error:"결제 준비 중"}`.
- 마이그레이션은 Supabase MCP(`apply_migration`, project `zftztnkczlblnkgaijzc`)로 시도, 프로젝트가 안 보이면 대시보드 SQL 에디터(전체가 한 트랜잭션).
- 테스트: `npm test`(라이브 Supabase, 계정 `tomo.test.alice/bob@gmail.com`, `test-pass-1234`). 현재 기준 통과 수를 먼저 기록.
- 커밋은 사용자가 지시할 때만(메모리 규칙). 각 Task 끝의 "Commit" 단계는 **스테이징만** 하고 커밋은 최종 지시 후 한 번에.

---

### Task 1: 마이그레이션 0018 + RLS 테스트

**Files:**
- Create: `supabase/migrations/0018_cart_orders.sql`
- Create: `tests/cart-rls.test.ts`

**Interfaces:**
- Produces: 테이블 `cart_items(user_id, external_item_id, note)`, `proxy_orders(...)`, `proxy_requests.order_id`, `profiles.ship_name/ship_phone/ship_postal/ship_address/ship_note`; 함수 `create_proxy_order(uuid[], text, text, text, text, text, text) returns proxy_orders`, `mark_proxy_order_paid(text, text) returns proxy_orders`, `cancel_proxy_order(uuid) returns proxy_orders`.

- [ ] **Step 1: 테스트 작성**

```ts
// tests/cart-rls.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let alice: SupabaseClient, bob: SupabaseClient;
let aliceId: string;
let itemId: string;

async function signIn(tag: string): Promise<[SupabaseClient, string]> {
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: `tomo.test.${tag}@gmail.com`, password: "test-pass-1234" });
  if (error) throw error;
  return [c, data.user!.id];
}

beforeAll(async () => {
  [alice, aliceId] = await signIn("alice");
  [bob] = await signIn("bob");
  // external_items는 admin/service_role만 쓴다 — 기존 시드된 아무 항목을 빌린다
  const { data } = await alice.from("external_items").select("id").limit(1).maybeSingle();
  if (!data) throw new Error("external_items가 비어 있음 — /global에서 상품 하나 열어 캐시를 만들고 재실행");
  itemId = data.id;
  await alice.from("cart_items").delete().eq("user_id", aliceId);
});

afterAll(async () => { await alice.from("cart_items").delete().eq("user_id", aliceId); });

describe("cart_items RLS", () => {
  it("owner can insert and read own row", async () => {
    const { error } = await alice.from("cart_items").insert({ user_id: aliceId, external_item_id: itemId, note: "M" });
    expect(error).toBeNull();
    const { data } = await alice.from("cart_items").select("note").eq("user_id", aliceId);
    expect(data?.map((r) => r.note)).toEqual(["M"]);
  });
  it("others see nothing and cannot insert for someone else", async () => {
    const { data } = await bob.from("cart_items").select("*").eq("user_id", aliceId);
    expect(data).toEqual([]);
    const { error } = await bob.from("cart_items").insert({ user_id: aliceId, external_item_id: itemId });
    expect(error).not.toBeNull();
  });
});

describe("proxy_orders", () => {
  it("cannot be inserted directly", async () => {
    const { error } = await alice.from("proxy_orders").insert({
      user_id: aliceId, currency: "KRW", subtotal: 1, intl_shipping: 0, service_fee: 0, total: 1, rate: 1,
      payment_method: "card", ship_name: "a", ship_phone: "0", ship_postal: "0", ship_address: "x",
    });
    expect(error).not.toBeNull();
  });
  it("create_proxy_order builds an order with per-item requests and saves address", async () => {
    const { data: o, error } = await alice.rpc("create_proxy_order", {
      p_item_ids: [itemId], p_method: "card",
      p_ship_name: "앨리스", p_ship_phone: "01000000000", p_ship_postal: "04000", p_ship_address: "서울 마포구 1", p_ship_note: "",
    });
    expect(error).toBeNull();
    expect(o.status).toBe("pending_payment");
    expect(o.total).toBe(o.subtotal + o.intl_shipping + o.service_fee);
    expect(o.service_fee).toBe(Math.floor(o.subtotal * 0.1));
    const { data: reqs } = await alice.from("proxy_requests").select("id, status").eq("order_id", o.id);
    expect(reqs?.length).toBe(1);
    expect(reqs?.[0].status).toBe("requested");
    const { data: p } = await alice.from("profiles").select("ship_name").eq("id", aliceId).single();
    expect(p?.ship_name).toBe("앨리스");
    // 정리: 대기 주문 취소 → 하위 요청도 cancelled
    const { data: c } = await alice.rpc("cancel_proxy_order", { p_id: o.id });
    expect(c.status).toBe("cancelled");
    const { data: after } = await alice.from("proxy_requests").select("status").eq("order_id", o.id);
    expect(after?.every((r) => r.status === "cancelled")).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/cart-rls.test.ts`
Expected: FAIL — `relation "cart_items" does not exist` 류.

- [ ] **Step 3: 마이그레이션 작성**

```sql
-- supabase/migrations/0018_cart_orders.sql
-- 사줘식 장바구니 + 주문(결제 단위). 스펙 docs/superpowers/specs/2026-09-04-sazo-cart-checkout-design.md

-- 1. 장바구니: 돈 아님, 본인 RLS로 직접 CRUD
create table cart_items (
  user_id uuid not null references profiles(id) on delete cascade,
  external_item_id uuid not null references external_items(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, external_item_id)
);
alter table cart_items enable row level security;
create policy "own cart select" on cart_items for select using (user_id = auth.uid());
create policy "own cart insert" on cart_items for insert with check (user_id = auth.uid());
create policy "own cart delete" on cart_items for delete using (user_id = auth.uid());
grant select, insert, delete on cart_items to authenticated;

-- 2. 배송지 1개 (다음 주문 프리필). 0003이 컬럼 단위 grant라 새 컬럼도 grant
alter table profiles
  add column ship_name text, add column ship_phone text, add column ship_postal text,
  add column ship_address text, add column ship_note text;
grant update (ship_name, ship_phone, ship_postal, ship_address, ship_note) on profiles to authenticated;

-- 3. 주문 = 결제 단위
create type proxy_order_status as enum ('pending_payment','paid','cancelled');
create table proxy_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  status proxy_order_status not null default 'pending_payment',
  currency currency_code not null,
  subtotal integer not null check (subtotal >= 0),
  intl_shipping integer not null check (intl_shipping >= 0),
  service_fee integer not null check (service_fee >= 0),
  total integer not null check (total >= 0),
  rate numeric not null,
  payment_method text not null check (payment_method in ('card','kakao_pay','naver_pay')),
  stripe_session_id text unique,
  stripe_payment_intent_id text unique,
  ship_name text not null, ship_phone text not null, ship_postal text not null,
  ship_address text not null, ship_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on proxy_orders (user_id, created_at desc);
create trigger proxy_orders_touch before update on proxy_orders for each row execute function touch_updated_at();
alter table proxy_orders enable row level security;
create policy "own orders" on proxy_orders for select using (user_id = auth.uid());
create policy "admin reads orders" on proxy_orders for select using (is_admin_user());
revoke insert, update, delete on proxy_orders from authenticated, anon;

alter table proxy_requests add column order_id uuid references proxy_orders(id);
create index on proxy_requests (order_id);

-- 4. 주문 생성: 카트의 본인 항목만, 금액은 여기서 재계산 (lib/fees.ts proxyOrderTotal과 같은 규칙)
create or replace function create_proxy_order(
  p_item_ids uuid[], p_method text,
  p_ship_name text, p_ship_phone text, p_ship_postal text, p_ship_address text, p_ship_note text default ''
) returns proxy_orders language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_cur currency_code; v_rate numeric; v_o proxy_orders; v_item external_items;
  v_sub int := 0; v_ship int; v_fee int; v_id uuid; v_r proxy_requests; v_note text;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  if coalesce(array_length(p_item_ids, 1), 0) = 0 then raise exception 'empty order'; end if;
  if p_method not in ('card','kakao_pay','naver_pay') then raise exception 'invalid method'; end if;
  if length(trim(p_ship_name)) = 0 or length(trim(p_ship_phone)) = 0
     or length(trim(p_ship_postal)) = 0 or length(trim(p_ship_address)) = 0 then raise exception 'address required'; end if;

  select case when country = 'KR' then 'KRW' else 'JPY' end::currency_code into v_cur from profiles where id = v_uid;
  select rate into v_rate from exchange_rates where pair = case when v_cur = 'KRW' then 'JPY_KRW' else 'KRW_JPY' end;
  if v_rate is null then raise exception 'rate missing'; end if;

  -- 소계: 뷰어 통화로 환산한 상품가 합 (환산은 항목별 round — 클라이언트 표시와 일치)
  foreach v_id in array p_item_ids loop
    if not exists (select 1 from cart_items where user_id = v_uid and external_item_id = v_id) then raise exception 'not in cart'; end if;
    select * into v_item from external_items where id = v_id;
    if v_item.status = 'sold' or v_item.fetched_at < now() - interval '24 hours' then raise exception 'stale item'; end if;
    v_sub := v_sub + case when v_item.currency = v_cur then v_item.price else round(v_item.price * v_rate)::int end;
  end loop;
  v_ship := case when v_cur = 'KRW' then 8000 else 900 end;   -- 주문당 1회 (묶음). lib/fees.ts 상수와 동일
  v_fee := floor(v_sub * 0.10);

  insert into proxy_orders (user_id, currency, subtotal, intl_shipping, service_fee, total, rate, payment_method,
      ship_name, ship_phone, ship_postal, ship_address, ship_note)
    values (v_uid, v_cur, v_sub, v_ship, v_fee, v_sub + v_ship + v_fee, v_rate, p_method,
      trim(p_ship_name), trim(p_ship_phone), trim(p_ship_postal), trim(p_ship_address), coalesce(p_ship_note, ''))
    returning * into v_o;

  -- 항목별 진행 단위. 진행 중 동일 요청이 있으면 그걸 주문에 붙임 (request_proxy 멱등 규칙과 동일)
  foreach v_id in array p_item_ids loop
    select note into v_note from cart_items where user_id = v_uid and external_item_id = v_id;
    select * into v_r from proxy_requests where user_id = v_uid and external_item_id = v_id
      and status not in ('cancelled','completed') and order_id is null limit 1;
    if found then
      update proxy_requests set order_id = v_o.id where id = v_r.id;
    else
      select * into v_item from external_items where id = v_id;
      insert into proxy_requests (user_id, external_item_id, note, center, quote_item_price, order_id)
        values (v_uid, v_id, coalesce(v_note, ''),
          case when v_item.currency = 'JPY' then 'NARITA'::center_code else 'SEOUL'::center_code end,
          v_item.price, v_o.id);
    end if;
  end loop;

  update profiles set ship_name = trim(p_ship_name), ship_phone = trim(p_ship_phone), ship_postal = trim(p_ship_postal),
    ship_address = trim(p_ship_address), ship_note = coalesce(p_ship_note, '') where id = v_uid;
  return v_o;
end $$;

-- 5. 결제 확정 (웹훅, service_role만). 멱등: pending일 때만 전이
create or replace function mark_proxy_order_paid(p_session_id text, p_payment_intent_id text)
  returns proxy_orders language plpgsql security definer set search_path = public as $$
declare v_o proxy_orders;
begin
  update proxy_orders set status = 'paid', stripe_payment_intent_id = p_payment_intent_id
    where stripe_session_id = p_session_id and status = 'pending_payment' returning * into v_o;
  if not found then
    select * into v_o from proxy_orders where stripe_session_id = p_session_id;
    return v_o;
  end if;
  update proxy_requests set status = 'paid' where order_id = v_o.id and status = 'requested';
  delete from cart_items c using proxy_requests r
    where r.order_id = v_o.id and c.user_id = v_o.user_id and c.external_item_id = r.external_item_id;
  return v_o;
end $$;

-- 6. 고객 취소: 결제 전 주문만
create or replace function cancel_proxy_order(p_id uuid)
  returns proxy_orders language plpgsql security definer set search_path = public as $$
declare v_o proxy_orders;
begin
  update proxy_orders set status = 'cancelled'
    where id = p_id and user_id = auth.uid() and status = 'pending_payment' returning * into v_o;
  if not found then raise exception 'cannot cancel'; end if;
  update proxy_requests set status = 'cancelled' where order_id = p_id and status = 'requested';
  return v_o;
end $$;

revoke execute on function create_proxy_order(uuid[], text, text, text, text, text, text) from public;
revoke execute on function mark_proxy_order_paid(text, text) from public, authenticated, anon;
revoke execute on function cancel_proxy_order(uuid) from public;
grant execute on function create_proxy_order(uuid[], text, text, text, text, text, text) to authenticated;
grant execute on function cancel_proxy_order(uuid) to authenticated;
```

- [ ] **Step 4: DB 적용**

Supabase MCP: `list_projects` → `zftztnkczlblnkgaijzc` 보이면 `apply_migration(name: "0018_cart_orders", query: <파일 내용>)`. 안 보이면 사용자에게 대시보드 SQL 에디터 붙여넣기를 요청하고 대기.

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/cart-rls.test.ts`
Expected: 4 passed.

- [ ] **Step 6: 스테이징**

```bash
git add supabase/migrations/0018_cart_orders.sql tests/cart-rls.test.ts
```

---

### Task 2: `proxyOrderTotal` (lib/fees) + 단위 테스트

**Files:**
- Modify: `lib/fees.ts` (파일 끝에 추가)
- Modify: `tests/fees.test.ts` (describe 추가)

**Interfaces:**
- Produces: `proxyOrderTotal(items: {price:number; currency:"KRW"|"JPY"}[], viewer: "KRW"|"JPY", rate: number): ProxyOrderTotal` where `ProxyOrderTotal = { subtotal:number; intlShipping:number; serviceFee:number; total:number; currency:"KRW"|"JPY" }`.

- [ ] **Step 1: 테스트**

```ts
// tests/fees.test.ts 끝에 추가
import { proxyOrderTotal } from "../lib/fees";

describe("proxy order total (SAZO식 카트 합산)", () => {
  it("sums converted items, charges intl shipping once, fee 10% floored", () => {
    const o = proxyOrderTotal([{ price: 1000, currency: "JPY" }, { price: 555, currency: "JPY" }], "KRW", 9.0);
    expect(o.subtotal).toBe(9000 + 4995);
    expect(o.intlShipping).toBe(8000);
    expect(o.serviceFee).toBe(1399); // floor(13995*0.1)
    expect(o.total).toBe(13995 + 8000 + 1399);
    expect(o.currency).toBe("KRW");
  });
  it("same-currency items are not converted; JPY viewer uses JPY shipping", () => {
    const o = proxyOrderTotal([{ price: 3000, currency: "JPY" }], "JPY", 0.11);
    expect(o.subtotal).toBe(3000);
    expect(o.intlShipping).toBe(900);
  });
  it("empty cart is all zeros", () => {
    expect(proxyOrderTotal([], "KRW", 9).total).toBe(0);
  });
});
```

`import` 문은 파일 상단 기존 import 옆으로 옮긴다(ESLint `import/first`).

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/fees.test.ts`
Expected: FAIL — `proxyOrderTotal is not a function`.

- [ ] **Step 3: 구현**

```ts
// lib/fees.ts 끝에 추가
import { convertPrice } from "./currency";

export type ProxyOrderTotal = { subtotal: number; intlShipping: number; serviceFee: number; total: number; currency: "KRW" | "JPY" };

// 카트 합산 — DB create_proxy_order와 같은 규칙: 항목별 환산 round 합 → 배송비 주문당 1회 → 수수료 10% 내림
export function proxyOrderTotal(
  items: { price: number; currency: "KRW" | "JPY" }[], viewer: "KRW" | "JPY", rate: number,
): ProxyOrderTotal {
  const subtotal = items.reduce((s, i) => s + (i.currency === viewer ? i.price : convertPrice(i.price, i.currency, rate)), 0);
  if (items.length === 0) return { subtotal: 0, intlShipping: 0, serviceFee: 0, total: 0, currency: viewer };
  const intlShipping = viewer === "JPY" ? PROXY_SHIPPING_ESTIMATE_JPY : PROXY_SHIPPING_ESTIMATE_KRW;
  const serviceFee = Math.floor(subtotal * PROXY_SERVICE_RATE);
  return { subtotal, intlShipping, serviceFee, total: subtotal + intlShipping + serviceFee, currency: viewer };
}
```

`import` 는 파일 상단으로.

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/fees.test.ts`
Expected: 모두 PASS.

- [ ] **Step 5: 스테이징** `git add lib/fees.ts tests/fees.test.ts`

---

### Task 3: i18n 키

**Files:**
- Modify: `lib/i18n.ts` — `"ext.step2"` 수정, 사전 끝(`} as const` 직전)에 아래 키 추가

**Interfaces:**
- Produces: 아래 키 전부(이후 Task가 그대로 사용).

- [ ] **Step 1: 키 추가**

```ts
  // ── 장바구니·주문 (SAZO식) ──
  "nav.cart": ["장바구니", "カート"],
  "cart.title": ["장바구니", "カート"],
  "cart.selectAll": ["전체 선택 ({n}/{total})", "すべて選択（{n}/{total}）"],
  "cart.remove": ["삭제", "削除"],
  "cart.removeOne": ["장바구니에서 빼기", "カートから削除"],
  "cart.changed": ["상품 정보가 변경되었어요 · 결제에서 제외", "商品情報が変わりました・決済から除外"],
  "cart.empty": ["장바구니가 비어 있어요", "カートは空です"],
  "cart.emptyCta": ["해외직구 둘러보기", "海外購入を見る"],
  "cart.add": ["장바구니", "カート"],
  "cart.added": ["담김 · 카트 보기", "追加済み・カートを見る"],
  "cart.adding": ["담는 중…", "追加中…"],
  "cart.buyNow": ["바로 구매", "今すぐ購入"],
  "cart.addFail": ["담기 실패", "追加できませんでした"],
  "cart.count": ["장바구니 {n}개", "カート {n}点"],
  "order.summary": ["주문 개요", "注文概要"],
  "order.subtotal": ["상품 소계", "商品小計"],
  "order.intlShipping": ["국제 배송비", "国際配送費"],
  "order.serviceFee": ["통관·대행 수수료 (10%)", "通関・代行手数料（10%）"],
  "order.total": ["전체 금액", "合計金額"],
  "order.noExtra": ["받으실 때 추가 청구는 없어요", "お受け取り時の追加請求はありません"],
  "order.checkout": ["결제하기", "決済する"],
  "order.title": ["주문하기", "注文する"],
  "order.items": ["주문 상품 {n}건", "注文商品 {n}件"],
  "order.address": ["배송지", "お届け先"],
  "order.name": ["받는 분", "受取人"],
  "order.phone": ["연락처", "電話番号"],
  "order.postal": ["우편번호", "郵便番号"],
  "order.addressLine": ["주소", "住所"],
  "order.shipNote": ["배송 요청사항 (선택)", "配送リクエスト（任意）"],
  "order.shipInfo": ["배송 안내", "配送案内"],
  "order.shipEta": ["예상 10~15일 · 판매처 발송 → 센터 검수 → 국제배송", "目安10〜15日・販売元発送 → センター検品 → 国際配送"],
  "order.customs": ["통관 안내", "通関案内"],
  "order.payMethod": ["결제 수단", "お支払い方法"],
  "order.payHint": ["TOMO 안전결제(에스크로) 적용 · 카드 정보는 Stripe에서 암호화 처리돼요", "TOMO安心決済（エスクロー）適用・カード情報はStripeで暗号化処理されます"],
  "pay.card": ["카드결제", "カード決済"],
  "pay.kakao_pay": ["카카오페이", "カカオペイ"],
  "pay.naver_pay": ["네이버페이", "ネイバーペイ"],
  "order.agree": ["결제하기를 누르면 이용약관·개인정보처리방침에 동의한 것으로 봅니다. 판매처 주문 완료 후에는 취소가 불가능해요.", "決済するを押すと利用規約・プライバシーポリシーに同意したものとみなします。販売元への注文完了後はキャンセルできません。"],
  "order.pending": ["결제 준비 중이에요", "決済の準備中です"],
  "order.fail": ["주문 실패", "注文に失敗しました"],
  "order.paying": ["결제 연결 중…", "決済に接続中…"],
  "order.receipt": ["주문 내역", "注文詳細"],
  "order.status.pending_payment": ["결제 대기", "決済待ち"],
  "order.status.paid": ["결제 완료", "決済完了"],
  "order.status.cancelled": ["취소됨", "キャンセル済み"],
  "order.payAgain": ["다시 결제", "再度決済"],
  "order.cancel": ["주문 취소", "注文をキャンセル"],
  "order.cancelConfirm": ["이 주문을 취소할까요?", "この注文をキャンセルしますか？"],
  "order.itemsTitle": ["상품별 진행", "商品ごとの進行"],
  "order.stripeName": ["TOMO 구매대행 {n}건", "TOMO購入代行 {n}件"],
  "my.orders": ["대행 주문", "代行注文"],
```

그리고 기존 키 수정:
```ts
  "ext.step2": ["결제 — 주문 시 1회, 2차 결제 없음", "決済 ― 注文時に1回のみ、追加請求なし"],
```

- [ ] **Step 2: 검증** `npx vitest run tests/i18n.test.ts` → PASS(ja≠ko, 빈 값 없음).
- [ ] **Step 3: 스테이징** `git add lib/i18n.ts`

---

### Task 4: `/api/cart` + `CartButtons` + 상세 하단바 교체

**Files:**
- Create: `app/api/cart/route.ts`
- Create: `components/CartButtons.tsx`
- Modify: `app/global/[source]/[id]/page.tsx:285-320` (하단바 분기)

**Interfaces:**
- Consumes: `/api/proxy`의 upsert 패턴, `ProxyRequestButton` props 형태.
- Produces: `POST /api/cart` body `{source, sourceId, title, price, currency, url, images, sellerName}` → `201 {itemId, count}`; `CartButtons` props = `ProxyRequestButton`과 동일 상품 props + `lang`.

- [ ] **Step 1: API**

```ts
// app/api/cart/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { SOURCE_LABEL, type MarketSource } from "@/lib/market/types";

export const runtime = "nodejs";

// 장바구니 담기: 외부 상품 스냅샷 upsert(service_role) → cart_items insert(본인 RLS). 미들웨어 밖 — 자체 인증
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { source, sourceId, title, price, currency, url, images, sellerName } = body;
  if (!SOURCE_LABEL[source as MarketSource] || typeof sourceId !== "string" || !sourceId)
    return NextResponse.json({ error: "invalid source" }, { status: 400 });
  if (typeof title !== "string" || !title || typeof url !== "string")
    return NextResponse.json({ error: "invalid item" }, { status: 400 });
  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) return NextResponse.json({ error: "invalid price" }, { status: 400 });
  if (currency !== "JPY" && currency !== "KRW") return NextResponse.json({ error: "invalid currency" }, { status: 400 });

  let itemId: string;
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin.from("external_items").upsert({
      source, source_id: sourceId, url, title, price: Math.round(p), currency,
      images: Array.isArray(images) ? images.slice(0, 8) : [],
      seller_name: typeof sellerName === "string" ? sellerName : "",
      status: "active", fetched_at: new Date().toISOString(),
    }, { onConflict: "source,source_id" }).select("id").single();
    if (error) throw error;
    itemId = data.id;
  } catch {
    return NextResponse.json({ error: "장바구니 준비 중이에요 (서버 설정 필요)" }, { status: 503 });
  }

  const { error } = await supabase.from("cart_items").upsert({ user_id: auth.user.id, external_item_id: itemId }, { onConflict: "user_id,external_item_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { count } = await supabase.from("cart_items").select("*", { count: "exact", head: true }).eq("user_id", auth.user.id);
  return NextResponse.json({ itemId, count: count ?? 0 }, { status: 201 });
}
```

- [ ] **Step 2: CartButtons**

```tsx
// components/CartButtons.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";

type Item = { source: string; sourceId: string; title: string; price: number; currency: "KRW" | "JPY"; url: string; images: string[]; sellerName: string };

// SAZO식 2버튼: 장바구니(아웃라인) + 바로 구매(코랄). 둘 다 /api/cart로 담고, 바로 구매는 주문서로 이동
export default function CartButtons({ lang = "ko", ...item }: Item & { lang?: Lang }) {
  const [state, setState] = useState<"idle" | "adding" | "added">("idle");
  const [error, setError] = useState("");
  const router = useRouter();

  async function add(): Promise<string | null> {
    setError("");
    const res = await fetch("/api/cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error || t(lang, "cart.addFail")); return null; }
    window.dispatchEvent(new CustomEvent("tomo:cart", { detail: json.count })); // GNB 배지 즉시 갱신
    return json.itemId as string;
  }

  async function onAdd() { setState("adding"); const id = await add(); setState(id ? "added" : "idle"); }
  async function onBuy() { setState("adding"); const id = await add(); if (id) router.push(`/order?items=${id}`); else setState("idle"); }

  return (
    <div className="flex-1">
      <div className="flex gap-2">
        {state === "added" ? (
          <Link href="/cart" className="press flex flex-1 items-center justify-center rounded-full border-[1.5px] border-tomo-navy/15 bg-white py-3 text-sm font-bold text-tomo-navy">
            {t(lang, "cart.added")}
          </Link>
        ) : (
          <button type="button" onClick={onAdd} disabled={state === "adding"}
            className="btn flex flex-1 items-center justify-center gap-1.5 border-[1.5px] border-tomo-navy/15 bg-white py-3 text-sm text-ink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
              <path d="M3.5 4.5h2l2.2 10.5h10.6l1.9-7.5H7" /><circle cx="9.5" cy="19" r="1.3" /><circle cx="17" cy="19" r="1.3" />
            </svg>
            {state === "adding" ? t(lang, "cart.adding") : t(lang, "cart.add")}
          </button>
        )}
        <button type="button" onClick={onBuy} disabled={state === "adding"} className="btn flex-[1.4] bg-tomo-coral-deep py-3 text-sm text-white">
          {t(lang, "cart.buyNow")}
        </button>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-tomo-rose">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: 상세 하단바 분기 교체**

`app/global/[source]/[id]/page.tsx`에서 `import ProxyRequestButton` 아래에 `import CartButtons from "@/components/CartButtons";` 추가. 로그인 사용자 분기(`) : ( <ProxyRequestButton …/> )`)를:

```tsx
                ) : item.auction ? (
                  <ProxyRequestButton lang={lang} auction totalLabel={totalLabel}
                    source={source} sourceId={params.id}
                    title={item.title} price={item.price} currency={item.currency}
                    url={item.url} images={images} sellerName={item.sellerName} />
                ) : (
                  <CartButtons lang={lang} source={source} sourceId={params.id}
                    title={item.title} price={item.price} currency={item.currency}
                    url={item.url} images={images} sellerName={item.sellerName} />
                )}
```

- [ ] **Step 4: 검증**

`npx tsc --noEmit` → 오류 0. 브라우저(preview `dev`): `/global`에서 메루카리 상품 열기 → 하단에 `장바구니 | 바로 구매` 두 버튼. 장바구니 클릭 → "담김 · 카트 보기". 야후 경매 상품은 기존 "입찰 대행 신청" 유지.

- [ ] **Step 5: 스테이징** `git add app/api/cart/route.ts components/CartButtons.tsx "app/global/[source]/[id]/page.tsx"`

---

### Task 5: GNB 카트 아이콘 + 배지

**Files:**
- Modify: `app/layout.tsx:30-35, 52`
- Modify: `components/SiteHeader.tsx`

**Interfaces:**
- Consumes: `tomo:cart` CustomEvent(detail = count) from `CartButtons`.
- Produces: `SiteHeader` prop `cartCount?: number`.

- [ ] **Step 1: layout에서 카운트**

`unread` 계산 블록 옆에:
```ts
  let cartCount = 0;
  // ... 기존 try 안, auth.user 있을 때:
  if (auth.user) {
    const { data } = await supabase.rpc("unread_count"); unread = Number(data ?? 0);
    const { count } = await supabase.from("cart_items").select("*", { count: "exact", head: true }); cartCount = count ?? 0;
  }
```
그리고 `<SiteHeader lang={lang} unread={unread} cartCount={cartCount} />`.

- [ ] **Step 2: SiteHeader**

props에 `cartCount = 0` 추가. 이벤트로 즉시 갱신:
```tsx
  const [count, setCount] = useState(cartCount);
  useEffect(() => { setCount(cartCount); }, [cartCount]);
  useEffect(() => {
    const on = (e: Event) => setCount(Number((e as CustomEvent).detail ?? 0));
    window.addEventListener("tomo:cart", on); return () => window.removeEventListener("tomo:cart", on);
  }, []);
```
(`import { useEffect, useState } from "react"`.) `<LangToggle …/>` 바로 뒤, 모바일 아이콘 nav 앞에:
```tsx
          <Link href="/cart" aria-label={t(lang, "cart.count", { n: count })} aria-current={isActive("/cart") ? "page" : undefined}
            className={`press relative flex h-11 w-10 items-center justify-center rounded-full ${isActive("/cart") ? "text-tomo-navy" : "text-ink-soft"}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]" aria-hidden>
              <path d="M3.5 4.5h2l2.2 10.5h10.6l1.9-7.5H7" /><circle cx="9.5" cy="19" r="1.3" /><circle cx="17" cy="19" r="1.3" />
            </svg>
            {count > 0 && (
              <span className="tnum absolute -right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-tomo-coral-deep px-1 text-[11px] font-bold text-white">{count > 9 ? "9+" : count}</span>
            )}
          </Link>
```

- [ ] **Step 3: 검증** `npx tsc --noEmit`; 브라우저에서 담기 후 새로고침 없이 배지 숫자 증가 확인.
- [ ] **Step 4: 스테이징** `git add app/layout.tsx components/SiteHeader.tsx`

---

### Task 6: `OrderSummary` + `/cart`

**Files:**
- Create: `components/OrderSummary.tsx`
- Create: `components/CartList.tsx`
- Create: `app/cart/page.tsx`

**Interfaces:**
- Consumes: `proxyOrderTotal`, `formatPrice`, `getViewer`.
- Produces: `OrderSummary({ lang, totals: ProxyOrderTotal, cta?: {label, href?, onClick?, disabled?} })`; `CartRow = { id: string; title: string; source: MarketSource; price: number; currency: Currency; image: string | null; stale: boolean }`.

- [ ] **Step 1: OrderSummary (카트·주문서·영수증 공용)**

```tsx
// components/OrderSummary.tsx
import Link from "next/link";
import { t, type Lang } from "@/lib/i18n";
import { formatPrice } from "@/lib/currency";
import type { ProxyOrderTotal } from "@/lib/fees";

export default function OrderSummary({ lang, totals, cta }: {
  lang: Lang; totals: ProxyOrderTotal;
  cta?: { label: string; href?: string; onClick?: () => void; disabled?: boolean; busy?: boolean };
}) {
  const f = (n: number) => formatPrice(n, totals.currency);
  const Line = ({ k, v }: { k: string; v: string }) => (
    <div className="flex justify-between gap-3 text-[13px]"><span className="text-ink-soft">{k}</span><span className="tnum text-ink">{v}</span></div>
  );
  return (
    <section aria-label={t(lang, "order.summary")} className="card flex flex-col gap-1.5 p-4">
      <h2 className="mb-1 text-[15px] font-extrabold text-ink">{t(lang, "order.summary")}</h2>
      <Line k={t(lang, "order.subtotal")} v={f(totals.subtotal)} />
      <Line k={t(lang, "order.intlShipping")} v={f(totals.intlShipping)} />
      <Line k={t(lang, "order.serviceFee")} v={f(totals.serviceFee)} />
      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-tomo-navy/10 pt-2.5">
        <span className="text-[13px] font-bold text-ink">{t(lang, "order.total")}</span>
        <span className="tnum text-[17px] font-extrabold text-tomo-navy">{f(totals.total)}</span>
      </div>
      <p className="text-right text-[11px] text-ink-soft">{t(lang, "order.noExtra")}</p>
      {cta && (cta.href ? (
        <Link href={cta.href} aria-disabled={cta.disabled} className={`btn mt-2 block bg-tomo-coral-deep py-3 text-center text-sm text-white ${cta.disabled ? "pointer-events-none opacity-45" : ""}`}>{cta.label}</Link>
      ) : (
        <button type="button" onClick={cta.onClick} disabled={cta.disabled || cta.busy} className="btn mt-2 w-full bg-tomo-coral-deep py-3 text-sm text-white">{cta.label}</button>
      ))}
    </section>
  );
}
```

- [ ] **Step 2: CartList (클라이언트: 체크·삭제·합계)**

```tsx
// components/CartList.tsx
"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang } from "@/lib/i18n";
import { formatPrice, convertPrice, type Currency } from "@/lib/currency";
import { proxyOrderTotal } from "@/lib/fees";
import type { MarketSource } from "@/lib/market/types";
import OrderSummary from "@/components/OrderSummary";
import { TomoSymbol } from "@/components/Brand";

export type CartRow = { id: string; title: string; source: MarketSource; price: number; currency: Currency; image: string | null; stale: boolean };

export default function CartList({ lang, rows, viewerCurrency, rate }: { lang: Lang; rows: CartRow[]; viewerCurrency: Currency; rate: number }) {
  const selectable = rows.filter((r) => !r.stale);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selectable.map((r) => r.id)));
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const picked = selectable.filter((r) => checked.has(r.id));
  const totals = useMemo(() => proxyOrderTotal(picked, viewerCurrency, rate), [picked, viewerCurrency, rate]);
  const allOn = picked.length === selectable.length && selectable.length > 0;

  async function remove(ids: string[]) {
    setBusy(true);
    const supabase = createBrowserSupabase();
    await supabase.from("cart_items").delete().in("external_item_id", ids);
    const { count } = await supabase.from("cart_items").select("*", { count: "exact", head: true });
    window.dispatchEvent(new CustomEvent("tomo:cart", { detail: count ?? 0 }));
    setBusy(false); router.refresh();
  }
  const toggle = (id: string) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="md:grid md:grid-cols-[1fr_320px] md:items-start md:gap-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="flex min-h-11 items-center gap-2 text-[13px] font-bold text-ink">
            <input type="checkbox" className="h-4 w-4 accent-tomo-coral-deep" checked={allOn}
              onChange={(e) => setChecked(e.target.checked ? new Set(selectable.map((r) => r.id)) : new Set())} />
            {t(lang, "cart.selectAll", { n: picked.length, total: rows.length })}
          </label>
          <button type="button" onClick={() => remove([...checked])} disabled={busy || checked.size === 0}
            className="press rounded-full border-[1.5px] border-tomo-navy/15 px-3 py-1.5 text-[12px] font-bold text-ink-soft disabled:opacity-45">{t(lang, "cart.remove")}</button>
        </div>
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id} className={`card flex items-center gap-3 p-3 ${r.stale ? "opacity-70" : ""}`}>
              <input type="checkbox" className="h-4 w-4 shrink-0 accent-tomo-coral-deep" checked={checked.has(r.id)} disabled={r.stale}
                onChange={() => toggle(r.id)} aria-label={r.title} />
              <Link href={`/global/${r.source}/`} className="h-14 w-14 shrink-0 overflow-hidden rounded-thumb bg-tomo-navy/5">
                {r.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.image} alt="" className="h-full w-full object-cover" />
                ) : <div className="flex h-full w-full items-center justify-center"><TomoSymbol className="h-6 w-9 opacity-60" /></div>}
              </Link>
              <div className="min-w-0 flex-1">
                {r.stale && <p className="mb-0.5 text-[11px] font-bold text-tomo-coral-deep">{t(lang, "cart.changed")}</p>}
                <p className="line-clamp-2 text-[13px] text-ink">{r.title}</p>
                <p className="mt-0.5 text-[12px] text-ink-soft">{t(lang, `source.${r.source}`)} · <span className="tnum font-bold text-ink">
                  {formatPrice(r.currency === viewerCurrency ? r.price : convertPrice(r.price, r.currency, rate), viewerCurrency)}</span></p>
              </div>
              <button type="button" onClick={() => remove([r.id])} disabled={busy} aria-label={t(lang, "cart.removeOne")}
                className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {/* 주문 개요: 모바일 하단 고정, md+ 우측 sticky */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-tomo-navy/5 bg-white p-3 standalone:bottom-16 md:static md:border-0 md:bg-transparent md:p-0 md:sticky md:top-24">
        <OrderSummary lang={lang} totals={totals}
          cta={{ label: t(lang, "order.checkout"), href: `/order?items=${picked.map((r) => r.id).join(",")}`, disabled: picked.length === 0 }} />
      </div>
    </div>
  );
}
```

썸네일 링크는 `external_items.source_id`가 필요 → `CartRow`에 `sourceId: string` 추가하고 `href={`/global/${r.source}/${r.sourceId}`}`로 고친다(아래 page에서 채움).

- [ ] **Step 3: /cart 페이지**

```tsx
// app/cart/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { t } from "@/lib/i18n";
import CartList, { type CartRow } from "@/components/CartList";
import type { MarketSource } from "@/lib/market/types";
import type { Currency } from "@/lib/currency";

export const metadata: Metadata = { title: "장바구니 · TOMO" };

export default async function CartPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/cart");
  const lang = viewer.language;

  const { data } = await supabase.from("cart_items")
    .select("external_item_id, created_at, external_items(source, source_id, title, title_translated, price, currency, images, status, fetched_at)")
    .order("created_at", { ascending: false });
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const rows: CartRow[] = (data ?? []).flatMap((c) => {
    const it = c.external_items as unknown as { source: MarketSource; source_id: string; title: string; title_translated: string | null; price: number; currency: Currency; images: string[]; status: string; fetched_at: string } | null;
    if (!it) return [];
    return [{ id: c.external_item_id, sourceId: it.source_id, title: it.title_translated || it.title, source: it.source, price: it.price, currency: it.currency,
      image: it.images[0] ?? null, stale: it.status === "sold" || new Date(it.fetched_at).getTime() < dayAgo }];
  });

  return (
    <main className="mx-auto max-w-md p-4 pb-64 standalone:pb-72 md:max-w-5xl md:px-6 md:pb-16 md:pt-8">
      <h1 className="mb-3 text-[17px] font-extrabold text-ink md:text-xl">{t(lang, "cart.title")}</h1>
      {rows.length === 0 ? (
        <div className="rounded-card bg-tomo-navy/5 p-8 text-center">
          <p className="text-sm font-bold text-ink-soft">{t(lang, "cart.empty")}</p>
          <Link href="/global" className="btn mt-4 inline-block bg-tomo-navy px-5 py-2.5 text-sm text-white">{t(lang, "cart.emptyCta")}</Link>
        </div>
      ) : (
        <CartList lang={lang} rows={rows} viewerCurrency={viewer.currency} rate={viewer.rate} />
      )}
    </main>
  );
}
```

- [ ] **Step 4: 검증** `npx tsc --noEmit`; 브라우저 `/cart`: 항목·체크·삭제·합계 반영, 모바일(375px) 하단 고정 개요, md에서 우측 sticky. 전부 해제 시 결제하기 비활성.
- [ ] **Step 5: 스테이징** `git add components/OrderSummary.tsx components/CartList.tsx app/cart/page.tsx`

---

### Task 7: `/api/order` + `/order` 주문서

**Files:**
- Create: `app/api/order/route.ts`
- Create: `components/OrderForm.tsx`
- Create: `app/order/page.tsx`

**Interfaces:**
- Consumes: RPC `create_proxy_order`, `getStripe`, `OrderSummary`, `proxyOrderTotal`.
- Produces: `POST /api/order` body `{ itemIds: string[], method: "card"|"kakao_pay"|"naver_pay", ship: {name, phone, postal, address, note}, orderId?: string }` → `{url}` | 503. `orderId`가 오면 기존 `pending_payment` 주문의 세션만 재생성(영수증 "다시 결제"용).

- [ ] **Step 1: API**

```ts
// app/api/order/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

type Method = "card" | "kakao_pay" | "naver_pay";
const METHODS: Method[] = ["card", "kakao_pay", "naver_pay"];

// 주문 생성 → Stripe Checkout. 키 없으면 주문 만들기 전에 503 (스펙 §3). 미들웨어 밖 — 자체 인증
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "결제 준비 중" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const method: Method = METHODS.includes(body.method) ? body.method : "card";

  let order: { id: string; total: number; currency: string; payment_method: string; status: string };
  if (typeof body.orderId === "string") {
    const { data } = await supabase.from("proxy_orders").select("id, total, currency, payment_method, status").eq("id", body.orderId).maybeSingle();
    if (!data || data.status !== "pending_payment") return NextResponse.json({ error: "order not payable" }, { status: 400 });
    order = data;
  } else {
    const ship = body.ship ?? {};
    if (!Array.isArray(body.itemIds) || body.itemIds.length === 0) return NextResponse.json({ error: "empty order" }, { status: 400 });
    const { data, error } = await supabase.rpc("create_proxy_order", {
      p_item_ids: body.itemIds, p_method: method,
      p_ship_name: String(ship.name ?? ""), p_ship_phone: String(ship.phone ?? ""), p_ship_postal: String(ship.postal ?? ""),
      p_ship_address: String(ship.address ?? ""), p_ship_note: String(ship.note ?? "").slice(0, 300),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    order = data;
  }

  const { count } = await supabase.from("proxy_requests").select("*", { count: "exact", head: true }).eq("order_id", order.id);
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const create = (types: Method[]) => stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: types,
    line_items: [{ quantity: 1, price_data: {
      currency: order.currency.toLowerCase(), unit_amount: order.total, // KRW/JPY zero-decimal
      product_data: { name: `TOMO 구매대행 ${count ?? 1}건` },
    } }],
    metadata: { proxy_order_id: order.id },
    success_url: `${origin}/order/${order.id}`,
    cancel_url: `${origin}/order/${order.id}`,
  });
  let session;
  try { session = await create([order.payment_method as Method]); }
  catch { session = await create(["card"]); } // 한국 결제수단 미활성 계정이면 카드로 1회 재시도

  // 세션 id 기록은 service_role (proxy_orders update는 revoke)
  await createAdminSupabase().from("proxy_orders").update({ stripe_session_id: session.id }).eq("id", order.id);
  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 2: OrderForm**

```tsx
// components/OrderForm.tsx
"use client";
import { useState } from "react";
import { t, type Lang } from "@/lib/i18n";
import type { ProxyOrderTotal } from "@/lib/fees";
import OrderSummary from "@/components/OrderSummary";
import type { CartRow } from "@/components/CartList";
import { formatPrice, convertPrice } from "@/lib/currency";

type Ship = { name: string; phone: string; postal: string; address: string; note: string };
const METHODS_KRW = ["card", "kakao_pay", "naver_pay"] as const;
const METHODS_JPY = ["card"] as const;

export default function OrderForm({ lang, rows, totals, rate, initialShip }: {
  lang: Lang; rows: CartRow[]; totals: ProxyOrderTotal; rate: number; initialShip: Ship;
}) {
  const [ship, setShip] = useState<Ship>(initialShip);
  const [method, setMethod] = useState<string>("card");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const methods = totals.currency === "KRW" ? METHODS_KRW : METHODS_JPY;
  const set = (k: keyof Ship) => (e: React.ChangeEvent<HTMLInputElement>) => setShip((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(""); setError("");
    const res = await fetch("/api/order", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: rows.map((r) => r.id), method, ship }) });
    const json = await res.json().catch(() => ({}));
    if (res.status === 503) { setMsg(t(lang, "order.pending")); setBusy(false); return; }
    if (!res.ok) { setError(json.error || t(lang, "order.fail")); setBusy(false); return; }
    window.location.href = json.url;
  }

  const Field = ({ k, label, type = "text", required = true }: { k: keyof Ship; label: string; type?: string; required?: boolean }) => (
    <label className="block text-[12px] font-bold text-ink">{label}
      <input type={type} value={ship[k]} onChange={set(k)} required={required} autoComplete={k === "name" ? "name" : k === "phone" ? "tel" : k === "postal" ? "postal-code" : "street-address"}
        className="mt-1 w-full rounded-full bg-white px-4 py-2.5 text-base font-normal shadow-soft placeholder:text-ink-soft" />
    </label>
  );

  return (
    <form id="order-form" onSubmit={submit} className="md:grid md:grid-cols-[1fr_320px] md:items-start md:gap-6">
      <div className="flex flex-col gap-4">
        {/* 주문 상품 (접이식) */}
        <section className="card p-4">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-11 w-full items-center justify-between text-[15px] font-extrabold text-ink">
            {t(lang, "order.items", { n: rows.length })}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {open && (
            <ul className="mt-2 flex flex-col gap-2">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 text-[13px]">
                  {r.image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.image} alt="" className="h-10 w-10 rounded-thumb object-cover" />}
                  <span className="line-clamp-1 flex-1 text-ink">{r.title}</span>
                  <span className="tnum font-bold text-ink">{formatPrice(r.currency === totals.currency ? r.price : convertPrice(r.price, r.currency, rate), totals.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-[15px] font-extrabold text-ink">{t(lang, "order.address")}</h2>
          <Field k="name" label={t(lang, "order.name")} />
          <Field k="phone" label={t(lang, "order.phone")} type="tel" />
          <Field k="postal" label={t(lang, "order.postal")} />
          <Field k="address" label={t(lang, "order.addressLine")} />
          <Field k="note" label={t(lang, "order.shipNote")} required={false} />
        </section>

        <section className="rounded-card bg-tomo-navy/5 p-4 text-[12px] text-ink-soft">
          <p className="font-bold text-ink">{t(lang, "order.shipInfo")}</p>
          <p className="mt-1">{t(lang, "order.shipEta")}</p>
          <p className="mt-3 font-bold text-ink">{t(lang, "order.customs")}</p>
          <p className="mt-1">{t(lang, "ext.customsNote")}</p>
        </section>

        <fieldset className="card p-4">
          <legend className="sr-only">{t(lang, "order.payMethod")}</legend>
          <h2 className="text-[15px] font-extrabold text-ink">{t(lang, "order.payMethod")}</h2>
          <p className="mt-1 text-[12px] text-ink-soft">{t(lang, "order.payHint")}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {methods.map((m) => (
              <label key={m} className={`flex min-h-14 cursor-pointer items-center justify-center rounded-card border-[1.5px] text-[13px] font-bold ${
                method === m ? "border-tomo-coral-deep bg-tomo-coral-deep/5 text-tomo-coral-deep" : "border-tomo-navy/15 text-ink"}`}>
                <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} className="sr-only" />
                {t(lang, `pay.${m}`)}
              </label>
            ))}
          </div>
        </fieldset>

        {msg && <p className="text-center text-xs text-ink-soft">{msg}</p>}
        {error && <p role="alert" className="text-center text-xs text-tomo-rose">{error}</p>}
        <p className="text-[11px] text-ink-soft">{t(lang, "order.agree")}</p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-tomo-navy/5 bg-white p-3 standalone:bottom-16 md:static md:border-0 md:bg-transparent md:p-0 md:sticky md:top-24">
        <OrderSummary lang={lang} totals={totals} cta={{ label: busy ? t(lang, "order.paying") : t(lang, "order.checkout"), busy, onClick: () => (document.getElementById("order-form") as HTMLFormElement)?.requestSubmit() }} />
      </div>
    </form>
  );
}
```

- [ ] **Step 3: /order 페이지**

```tsx
// app/order/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { t } from "@/lib/i18n";
import { proxyOrderTotal } from "@/lib/fees";
import OrderForm from "@/components/OrderForm";
import type { CartRow } from "@/components/CartList";
import type { MarketSource } from "@/lib/market/types";
import type { Currency } from "@/lib/currency";

export const metadata: Metadata = { title: "주문하기 · TOMO" };

export default async function OrderPage(props: { searchParams: Promise<{ items?: string }> }) {
  const { items = "" } = await props.searchParams;
  const ids = items.split(",").filter(Boolean);
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/order?items=${items}`)}`);
  if (ids.length === 0) redirect("/cart");
  const lang = viewer.language;

  const [{ data }, { data: prof }] = await Promise.all([
    supabase.from("cart_items").select("external_item_id, external_items(source, source_id, title, title_translated, price, currency, images, status, fetched_at)").in("external_item_id", ids),
    supabase.from("profiles").select("ship_name, ship_phone, ship_postal, ship_address, ship_note").eq("id", viewer.id).single(),
  ]);
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const rows: CartRow[] = (data ?? []).flatMap((c) => {
    const it = c.external_items as unknown as { source: MarketSource; source_id: string; title: string; title_translated: string | null; price: number; currency: Currency; images: string[]; status: string; fetched_at: string } | null;
    if (!it || it.status === "sold" || new Date(it.fetched_at).getTime() < dayAgo) return [];
    return [{ id: c.external_item_id, sourceId: it.source_id, title: it.title_translated || it.title, source: it.source, price: it.price, currency: it.currency, image: it.images[0] ?? null, stale: false }];
  });
  if (rows.length === 0) redirect("/cart");
  const totals = proxyOrderTotal(rows, viewer.currency, viewer.rate);

  return (
    <main className="mx-auto max-w-md p-4 pb-64 standalone:pb-72 md:max-w-5xl md:px-6 md:pb-16 md:pt-8">
      <h1 className="mb-3 text-[17px] font-extrabold text-ink md:text-xl">{t(lang, "order.title")}</h1>
      <OrderForm lang={lang} rows={rows} totals={totals} rate={viewer.rate}
        initialShip={{ name: prof?.ship_name ?? "", phone: prof?.ship_phone ?? "", postal: prof?.ship_postal ?? "", address: prof?.ship_address ?? "", note: prof?.ship_note ?? "" }} />
    </main>
  );
}
```

- [ ] **Step 4: 검증** `npx tsc --noEmit`; 브라우저 `/cart` → 결제하기 → `/order?items=…`: 배송지 프리필(첫 번엔 빈칸), 결제수단 3타일(JP 계정 bob은 카드만), 결제하기 → Stripe 키 없는 로컬에선 "결제 준비 중" 문구. 필수 필드 비우면 네이티브 required 경고.
- [ ] **Step 5: 스테이징** `git add app/api/order/route.ts components/OrderForm.tsx app/order/page.tsx`

---

### Task 8: 웹훅 + `/order/[id]` 영수증 + 마이페이지

**Files:**
- Modify: `app/api/stripe/webhook/route.ts:24-35`
- Create: `app/order/[id]/page.tsx`
- Create: `components/OrderActions.tsx`
- Modify: `app/mypage/page.tsx` (대행 섹션)

**Interfaces:**
- Consumes: RPC `mark_proxy_order_paid(p_session_id, p_payment_intent_id)`, `cancel_proxy_order(p_id)`, `POST /api/order {orderId}`.

- [ ] **Step 1: 웹훅 분기 추가**

`checkout.session.completed` 블록의 타입에 `id: string; metadata?: { transaction_id?: string; proxy_order_id?: string }` 추가, 기존 `if (txId && pi)` 뒤에:
```ts
    const orderId = s.metadata?.proxy_order_id;
    if (orderId && pi) {
      await createAdminSupabase().rpc("mark_proxy_order_paid", { p_session_id: s.id, p_payment_intent_id: pi });
    }
```

- [ ] **Step 2: OrderActions (다시 결제 / 취소)**

```tsx
// components/OrderActions.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang } from "@/lib/i18n";

export default function OrderActions({ id, lang }: { id: string; lang: Lang }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();

  async function payAgain() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: id }) });
    const json = await res.json().catch(() => ({}));
    if (res.status === 503) { setMsg(t(lang, "order.pending")); setBusy(false); return; }
    if (!res.ok) { setMsg(json.error || t(lang, "order.fail")); setBusy(false); return; }
    window.location.href = json.url;
  }
  async function cancel() {
    if (!confirm(t(lang, "order.cancelConfirm"))) return;
    setBusy(true);
    const { error } = await createBrowserSupabase().rpc("cancel_proxy_order", { p_id: id });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    router.refresh();
  }
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={payAgain} disabled={busy} className="btn w-full bg-tomo-coral-deep py-3 text-sm text-white">{t(lang, "order.payAgain")}</button>
      <button type="button" onClick={cancel} disabled={busy} className="btn w-full border-[1.5px] border-tomo-navy/15 bg-white py-3 text-sm text-ink-soft">{t(lang, "order.cancel")}</button>
      {msg && <p className="text-center text-xs text-ink-soft">{msg}</p>}
    </div>
  );
}
```

- [ ] **Step 3: 영수증 페이지**

```tsx
// app/order/[id]/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { t, type I18nKey } from "@/lib/i18n";
import type { Currency } from "@/lib/currency";
import type { MarketSource } from "@/lib/market/types";
import OrderSummary from "@/components/OrderSummary";
import OrderActions from "@/components/OrderActions";

export default async function OrderReceiptPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect(`/login?next=/order/${id}`);
  const lang = viewer.language;

  const [{ data: o }, { data: reqs }] = await Promise.all([
    supabase.from("proxy_orders").select("*").eq("id", id).maybeSingle(),
    supabase.from("proxy_requests").select("id, status, external_items(source, title, title_translated, images)").eq("order_id", id),
  ]);
  if (!o) notFound();
  const statusKey = `order.status.${o.status}` as I18nKey;

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-2xl md:px-6 md:pb-16 md:pt-8">
      <h1 className="mb-1 text-[17px] font-extrabold text-ink md:text-xl">{t(lang, "order.receipt")}</h1>
      <p className={`mb-4 text-[13px] font-bold ${o.status === "paid" ? "text-tomo-navy" : "text-tomo-coral-deep"}`}>{t(lang, statusKey)}</p>

      <div className="mb-4"><OrderSummary lang={lang} totals={{ subtotal: o.subtotal, intlShipping: o.intl_shipping, serviceFee: o.service_fee, total: o.total, currency: o.currency as Currency }} /></div>

      <section className="card mb-4 p-4 text-[13px]">
        <h2 className="mb-1 font-extrabold text-ink">{t(lang, "order.address")}</h2>
        <p className="text-ink">{o.ship_name} · <span className="tnum">{o.ship_phone}</span></p>
        <p className="text-ink-soft">(<span className="tnum">{o.ship_postal}</span>) {o.ship_address}</p>
        {o.ship_note && <p className="mt-1 text-ink-soft">{o.ship_note}</p>}
      </section>

      <section className="mb-4">
        <h2 className="mb-2 text-[15px] font-extrabold text-ink">{t(lang, "order.itemsTitle")}</h2>
        <ul className="flex flex-col gap-2">
          {(reqs ?? []).map((r) => {
            const it = r.external_items as unknown as { source: MarketSource; title: string; title_translated: string | null; images: string[] } | null;
            return (
              <li key={r.id}>
                <Link href={`/proxy/${r.id}`} className="card flex items-center gap-3 p-3">
                  {it?.images?.[0] && /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.images[0]} alt="" className="h-11 w-11 rounded-thumb object-cover" />}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-[13px] text-ink">{it?.title_translated || it?.title}</p>
                    <p className="text-[12px] text-ink-soft">{it ? t(lang, `source.${it.source}`) : ""} · {t(lang, `pstatus.${r.status}` as I18nKey)}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {o.status === "pending_payment" && <OrderActions id={o.id} lang={lang} />}
    </main>
  );
}
```

- [ ] **Step 4: 마이페이지 — 주문 단위 행**

`app/mypage/page.tsx`의 `proxy_requests` select에 `order_id` 추가. 대행 섹션 렌더를: `order_id`가 있는 요청은 `order_id`별로 첫 항목만 `Row`로 그리고 `href={`/order/${p.order_id}`}`, `right`는 해당 주문 건수 `t(lang, "order.items", { n })`; `order_id` 없는(경매) 요청은 기존 그대로. 섹션 제목은 유지(`my.proxy`).

```tsx
          {(() => {
            const seen = new Set<string>();
            return (proxies ?? []).filter((p) => !p.order_id || (!seen.has(p.order_id) && seen.add(p.order_id))).map((p) => {
              const it = p.external_items as unknown as { source: string; title: string; title_translated: string | null; images: string[] } | null;
              const n = p.order_id ? (proxies ?? []).filter((q) => q.order_id === p.order_id).length : 0;
              return (
                <Row key={p.id} href={p.order_id ? `/order/${p.order_id}` : `/proxy/${p.id}`} image={it?.images?.[0]}
                  title={it?.title_translated || it?.title || t(lang, "my.item")}
                  sub={`${it ? t(lang, `source.${it.source as MarketSource}`) : ""} · ${PROXY_STATUS[p.status] ? t(lang, PROXY_STATUS[p.status]) : p.status}`}
                  right={p.order_id ? t(lang, "order.items", { n }) : p.quote_total ? formatPrice(p.quote_total, "JPY") : t(lang, "proxy.quoteWait")} />
              );
            });
          })()}
```

- [ ] **Step 5: 검증** `npx tsc --noEmit && npm run lint`; 브라우저: 주문 생성(키 없어 결제는 안 됨) 후 대시보드 SQL로 `select id from proxy_orders order by created_at desc limit 1` → `/order/<id>` 영수증 "결제 대기" + 다시 결제/취소 버튼 → 취소 → "취소됨", 마이페이지 대행 섹션에 주문 행.
- [ ] **Step 6: 스테이징** `git add app/api/stripe/webhook/route.ts "app/order/[id]/page.tsx" components/OrderActions.tsx app/mypage/page.tsx`

---

### Task 9: 전체 검증 + HANDOFF

**Files:**
- Modify: `HANDOFF.md` (2026-09-04 섹션에 항목 추가, 시작 프롬프트의 "마이그레이션 0016까지"→"0018까지", vitest 수 갱신)

- [ ] **Step 1:** `npm test` → 기존 + 새 테스트 전부 PASS(수 기록). JWT 시계 오차로 1~2개 튀면 재실행.
- [ ] **Step 2:** `npm run build` → 성공(`.env.local` 필요).
- [ ] **Step 3:** HANDOFF 추가 문단:

```md
- **사줘식 장바구니·주문·결제(2026-09-04)**: 외부상품 상세 하단 `장바구니 | 바로 구매`(경매는 기존 입찰 대행). `/cart`(체크·삭제·24h 지난/품절 캐시 자동 제외, 주문 개요 하단 고정/우측 sticky) → `/order?items=`(배송지 프로필 저장·프리필, 결제수단 타일 카드/카카오페이/네이버페이 — JPY는 카드만) → `POST /api/order` → `create_proxy_order`(금액 DB 재계산, 국제배송비 주문당 1회, 수수료 10%) → Stripe Checkout(`payment_method_types`, 미활성이면 카드로 재시도) → 웹훅 `mark_proxy_order_paid`(주문·하위 요청 `paid`, 카트 비움). `/order/[id]` 영수증(다시 결제/취소). 마이그레이션 **0018** 적용. GNB 카트 아이콘+배지(`tomo:cart` 이벤트로 즉시 갱신). 카카오/네이버페이는 Stripe 한국 계정에서만 활성. 스펙 `docs/superpowers/specs/2026-09-04-sazo-cart-checkout-design.md`.
```

- [ ] **Step 4: 스테이징** `git add HANDOFF.md docs/superpowers/specs/2026-09-04-sazo-cart-checkout-design.md docs/superpowers/plans/2026-09-04-sazo-cart-checkout.md` — 커밋은 사용자 지시 후 1회.

---

## Self-review

- 스펙 커버: §2 데이터(T1) · §3 API/fees/cartCount(T2·T4·T5·T7·T8) · §4 상세바(T4)·/cart(T6)·/order(T7)·영수증(T8)·마이페이지(T8)·GNB(T5) · §5 i18n(T3, `ext.step2` 수정 포함) · §6 엣지(RPC stale 예외·재시도 멱등·환율 고정 T1, 카드 재시도 T7) · §7 테스트(T1·T2). 스펙 §3 "getViewer에 cartCount"는 layout 카운트로 대체(같은 효과, 파일 하나 덜 건드림).
- 타입 일관성: `CartRow`에 `sourceId` 포함(T6 Step 2 주석 반영해 최종 타입은 `{ id, sourceId, title, source, price, currency, image, stale }`). `ProxyOrderTotal` 필드명 `subtotal/intlShipping/serviceFee/total/currency` 전 Task 동일. RPC 인자명 `p_item_ids/p_method/p_ship_*` T1·T7 동일.
- 플레이스홀더 없음.
