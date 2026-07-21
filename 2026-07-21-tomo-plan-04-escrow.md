# TOMO Plan 04 — 에스크로 거래 (Stripe + 상태머신 + 센터 + 후기) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stripe 테스트 모드 에스크로 결제와 거래 상태머신을 구축한다. 구매자는 안전결제로 상품을 구매하고(스펙 §4), 국내/크로스보더 경로별 상태 전이(스펙 §6)를 진행하며, 크로스보더는 센터(서울/나리타) 입고 확인·국제 발송을 거친다(스펙 §5·§7). 거래 완료 시 상호 후기가 신뢰온도에 반영된다(스펙 §5·§6). 모든 상태 전이는 허용된 것만 DB에서 검증하고 잘못된 전이는 거부한다.

**Architecture:** `transactions`/`reviews`/`exchange_rates` 테이블과 `tx_status` enum·기본 SELECT RLS는 Plan 01에서 생성 완료. 이 플랜은 (1) 상태 전이·예약·수수료·신뢰온도를 담당하는 **SECURITY DEFINER 함수 + 트리거** 마이그레이션, (2) Stripe 결제 시작 API(PaymentIntent 생성 + 거래 레코드 생성 + 상품 예약), (3) Stripe **webhook**(서명 검증·멱등·`paid` 전이), (4) `/transactions/[id]` 거래 진행 화면(에스크로 타임라인·운송장·수령 확인), (5) `/admin/center` 센터 관리 화면(admin 롤 전용), (6) 후기 작성 UI + 프로필 하트 게이지를 추가한다.

핵심 보안 원칙(HANDOFF 주의사항): transactions는 SELECT RLS만 존재 — **구매자·판매자·센터발 상태 전이는 전부 `SECURITY DEFINER` DB 함수로만** 수행한다(직접 UPDATE 경로 없음). profiles.trust_temp는 0003에서 self-update 차단됨 — 후기→신뢰온도도 `SECURITY DEFINER` 함수로만 갱신한다. webhook은 미들웨어·RLS 밖에서 **service_role**로 동작하며 Stripe 서명으로 인증한다.

**Tech Stack:** 기존 스택 + `stripe` (서버 SDK). Stripe Checkout 또는 PaymentIntent + 테스트 카드. 신규 클라이언트 의존성 없음(결제 리다이렉트는 Stripe 호스티드 Checkout 사용으로 카드 입력 UI 자체 구현 회피).

## 필요한 키 (구현 착수 전 확보 필수)

- `STRIPE_SECRET_KEY` (test 모드, `sk_test_…`) — 결제 API·webhook
- `STRIPE_WEBHOOK_SECRET` (`whsec_…`) — webhook 서명 검증. `stripe listen` 또는 대시보드 엔드포인트에서 발급
- `SUPABASE_SERVICE_ROLE_KEY` — webhook이 RLS 밖에서 상태 전이 함수 호출 (대시보드 → Project Settings → API Keys)
- (기존) `ANTHROPIC_API_KEY`는 이 플랜과 무관

> 키 미확보 시: Task 1(마이그레이션)·Task 4~6(UI, RPC 호출)·Task 7(상태머신 단위·RLS 테스트)은 진행 가능. Task 2~3(Stripe 결제·webhook 실거래)과 Stripe 통합 테스트만 키 대기. 결제 API는 키 없으면 503 "결제 준비 중"으로 graceful degrade(스펙 §9 패턴 준용).

## Global Constraints

- 통화는 원 통화(KRW/JPY)로 저장. Stripe 금액 단위: JPY는 zero-decimal(원값 그대로), KRW도 Stripe에서 zero-decimal 취급 — `item_price + intl_shipping_fee`를 그대로 전달(×100 금지). `lib/stripe.ts`에 단위 규칙 명시
- 플랫폼 수수료 = 상품가의 10%(스펙 §6). `platform_fee = floor(item_price * 0.10)`, `completed` 정산 시 차감(테스트 모드이므로 실제 송금은 로그/필드 기록으로 갈음)
- 국제배송비는 구매자가 결제 시 상품가와 함께 결제. 센터까지 국내 배송비는 판매자 부담(금액 계산에 미포함, 스펙 §6)
- 상태 전이는 `tx_status` enum 범위 내 **허용 전이표**로만. 경로 구분: 국내(`is_cross_border=false`)는 `paid→shipped→delivered→completed`, 크로스보더는 `paid→shipped_to_center→center_received→shipped_international→delivered→completed`
- 전이 주체 검증: 판매자만 발송 계열, 구매자만 `delivered→completed`(수령확인), 센터(admin)만 `center_received`·`shipped_international`, `paid`는 webhook만
- 결제 시작 시 상품 `reserved` + `reserved_at=now()`. 미결제 10분 경과 예약은 조회 시점에 해제(배치 없이 lazy expiry, 스펙 §6). 동시 결제는 조건부 UPDATE로 한 명만 성공
- `stripe_payment_intent_id` UNIQUE로 webhook 멱등(스펙 §9). webhook 재시도해도 상태 중복 전이 없음
- `/admin/center`·센터 전이 함수는 `profiles.is_admin` 확인. 미들웨어 밖 API는 자체 `getUser()` 인증(HANDOFF)
- Supabase project_id `zftztnkczlblnkgaijzc`. 저장소 = 마운트된 `tomo` 폴더, 빌드·npm·테스트는 `/tmp/build/tomo`에서 실행 후 rsync 역복사(node_modules는 그쪽에만 존재). `.git`은 마운트 폴더에만 존재 — 커밋은 마운트에서

---

### Task 1: 에스크로 마이그레이션 (전이 함수 + 예약 + 수수료 + 신뢰온도)

**Files:**
- Create: `supabase/migrations/0008_escrow.sql`

**Interfaces:**
- Produces: `updated_at` 자동 갱신 트리거 (P1 이월 처리)
- Produces: `start_transaction(p_listing_id uuid, p_intl_shipping_fee int)` → transaction row. 예약·수수료 계산·중복/경합 차단. `SECURITY DEFINER`
- Produces: `advance_transaction(p_tx_id uuid, p_to tx_status, p_tracking text default null)` — 허용 전이·주체·경로 검증 후 전이. `SECURITY DEFINER`
- Produces: `mark_paid(p_payment_intent_id text)` — webhook 전용, `pending_payment→paid` 멱등 전이 + listing `sold`. `SECURITY DEFINER`
- Produces: `submit_review(p_tx_id uuid, p_rating int, p_comment text)` — 후기 저장 + 상대 신뢰온도 반영. `SECURITY DEFINER`
- Produces: 예약 lazy-expiry 헬퍼 + transactions 직접 INSERT/UPDATE는 authenticated에 미부여(함수만 경유)

- [ ] **Step 1: 마이그레이션 작성** — `supabase/migrations/0008_escrow.sql`. 핵심 골격(구현 시 문법·엣지 검증):

```sql
-- updated_at 트리거 (P1 이월)
create or replace function touch_updated_at() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger transactions_touch before update on transactions
  for each row execute function touch_updated_at();

-- 함수만 거래를 쓰도록: 직접 INSERT/UPDATE 권한 회수 (SELECT RLS는 유지)
revoke insert, update on transactions from authenticated, anon;

-- 예약 lazy-expiry: 10분 지난 pending 예약 해제 (호출 시점 정리)
create or replace function release_stale_reservations() returns void
  language sql security definer as $$
  update listings set status='active', reserved_at=null
  where status='reserved' and reserved_at < now() - interval '10 minutes'
    and not exists (select 1 from transactions t
      where t.listing_id = listings.id and t.status <> 'pending_payment'
        and t.status <> 'cancelled');
$$;

-- 결제 시작: 예약 선점(조건부 update로 경합 차단) + 거래 생성 + 수수료 계산
create or replace function start_transaction(p_listing_id uuid, p_intl_shipping_fee int default 0)
  returns transactions language plpgsql security definer as $$
declare v_l listings; v_uid uuid := auth.uid(); v_tx transactions;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  perform release_stale_reservations();
  select * into v_l from listings where id = p_listing_id;
  if v_l is null then raise exception 'listing not found'; end if;
  if v_l.seller_id = v_uid then raise exception 'cannot buy own listing'; end if;
  if p_intl_shipping_fee < 0 then raise exception 'invalid shipping fee'; end if;
  -- 크로스보더 판정: 구매자 국가 <> 상품 국가 & 상품이 크로스보더 허용
  -- (센터: 상품이 일본이면 NARITA 경유, 한국이면 SEOUL — 판매자 자국 센터 입고)
  -- 조건부 예약 선점: active만 reserved로. 실패 시 이미 예약/판매됨
  update listings set status='reserved', reserved_at=now()
    where id = p_listing_id and status='active';
  if not found then raise exception 'listing not available'; end if;
  insert into transactions (listing_id, buyer_id, seller_id, is_cross_border, center,
      item_price, intl_shipping_fee, platform_fee, currency, status)
    values (p_listing_id, v_uid, v_l.seller_id,
      /* is_cross_border */ (v_l.cross_border_enabled and v_l.country <> (select country from profiles where id=v_uid)),
      /* center */ case when v_l.cross_border_enabled and v_l.country <> (select country from profiles where id=v_uid)
        then (case v_l.country when 'JP' then 'NARITA'::center_code else 'SEOUL'::center_code end) else null end,
      v_l.price, coalesce(p_intl_shipping_fee,0), floor(v_l.price * 0.10),
      v_l.currency, 'pending_payment')
    returning * into v_tx;
  return v_tx;
end $$;

-- 허용 전이표 검증 + 주체·경로 검증
create or replace function advance_transaction(p_tx_id uuid, p_to tx_status, p_tracking text default null)
  returns transactions language plpgsql security definer as $$
declare v_t transactions; v_uid uuid := auth.uid(); v_admin bool;
begin
  select * into v_t from transactions where id = p_tx_id;
  if v_t is null then raise exception 'tx not found'; end if;
  select is_admin into v_admin from profiles where id = v_uid;
  -- 주체별 허용 전이 (from -> to)
  -- 판매자: paid->shipped(국내), paid->shipped_to_center(크로스보더)
  -- 센터(admin): shipped_to_center->center_received, center_received->shipped_international
  -- 배송완료: shipped->delivered(국내), shipped_international->delivered(크로스보더) — 판매자/센터 표기
  -- 구매자: delivered->completed(수령확인)
  -- 잘못된 (from,to,주체,경로) 조합은 전부 예외
  -- ... (구현 시 CASE 매트릭스로 명시. completed 시 정산 필드/로그)
  update transactions set status = p_to,
    domestic_tracking = case when p_to='shipped' then coalesce(p_tracking,domestic_tracking) else domestic_tracking end,
    intl_tracking = case when p_to='shipped_international' then coalesce(p_tracking,intl_tracking) else intl_tracking end
    where id = p_tx_id and status = v_t.status  -- 낙관적 잠금
    returning * into v_t;
  if not found then raise exception 'state changed concurrently'; end if;
  return v_t;
end $$;

-- webhook 전용 결제확정 (멱등)
create or replace function mark_paid(p_payment_intent_id text)
  returns void language plpgsql security definer as $$
begin
  update transactions set status='paid'
    where stripe_payment_intent_id = p_payment_intent_id and status='pending_payment';
  update listings l set status='sold'
    from transactions t where t.listing_id=l.id
      and t.stripe_payment_intent_id=p_payment_intent_id and t.status='paid';
end $$;

-- 후기 + 신뢰온도 (긍정 +0.1~0.5, 부정 -0.5; completed 거래·당사자만)
create or replace function submit_review(p_tx_id uuid, p_rating int, p_comment text default '')
  returns reviews language plpgsql security definer as $$
declare v_t transactions; v_uid uuid := auth.uid(); v_target uuid; v_delta numeric; v_r reviews;
begin
  select * into v_t from transactions where id=p_tx_id;
  if v_t is null or v_uid not in (v_t.buyer_id, v_t.seller_id) then raise exception 'not a party'; end if;
  if v_t.status <> 'completed' then raise exception 'tx not completed'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'invalid rating'; end if;
  v_target := case when v_uid = v_t.buyer_id then v_t.seller_id else v_t.buyer_id end;
  v_delta := case p_rating when 5 then 0.5 when 4 then 0.3 when 3 then 0.1 else -0.5 end;
  insert into reviews (transaction_id, reviewer_id, rating, comment)
    values (p_tx_id, v_uid, p_rating, coalesce(p_comment,'')) returning * into v_r; -- unique(tx,reviewer) 중복 차단
  update profiles set trust_temp = greatest(0, least(99, trust_temp + v_delta)) where id = v_target;
  return v_r;
end $$;

grant execute on function start_transaction(uuid,int), advance_transaction(uuid,tx_status,text),
  submit_review(uuid,int,text) to authenticated;
-- mark_paid, release_stale_reservations 는 authenticated에 grant 안 함 (service_role/함수 내부 전용)
```

- [ ] **Step 2: 적용** — MCP `apply_migration` (name: `escrow`)
- [ ] **Step 3: 검증** — MCP `execute_sql`로 함수 4개 존재(`pg_proc`), transactions에 authenticated INSERT/UPDATE 권한 없음(`information_schema.role_table_grants`), 트리거 존재 확인
- [ ] **Step 4: 커밋** — `git add -A && git commit -m "feat: escrow migration - transition fns, reservation, fee, trust temp"`

---

### Task 2: Stripe 유틸 + 결제 시작 API

**Files:**
- Create: `lib/stripe.ts`, `app/api/checkout/route.ts`
- Modify: `package.json` (stripe 추가)

**Interfaces:**
- Produces: `getStripe(): Stripe | null` — `STRIPE_SECRET_KEY` 없으면 null (graceful)
- Produces: `POST /api/checkout` — body `{listingId, intlShippingFee?}` → `{url}` (Stripe Checkout 세션 URL) 또는 503. 자체 인증, `start_transaction` RPC로 거래·예약 생성 후 PaymentIntent/Checkout 세션 생성·`stripe_payment_intent_id` 기록

- [ ] **Step 1: stripe 설치** — `/tmp/build/tomo`에서 `npm install stripe`, package.json/lock rsync 역복사
- [ ] **Step 2: `lib/stripe.ts`** — 서버 전용 싱글턴, 금액 단위 규칙 주석(KRW/JPY zero-decimal, ×100 금지), `getStripe()` 키 없으면 null
- [ ] **Step 3: `app/api/checkout/route.ts`** — 자체 `getUser()` 401 → `getStripe()` 없으면 503 "결제 준비 중" → `supabase.rpc('start_transaction', {...})` (실패 메시지 400) → Stripe Checkout 세션 생성(`mode:'payment'`, line_items = 상품가+국제배송비, `metadata.transaction_id`, success/cancel URL `/transactions/[id]`) → 세션의 `payment_intent`를 거래에 `update`(함수 밖 update 불가하므로 `mark_pi` 소형 RPC 또는 start_transaction이 PI 자리표시 후 세션 생성 순서 조정) → `{url}`. **주의:** transactions UPDATE 권한이 없으므로 `stripe_payment_intent_id` 기록도 `SECURITY DEFINER` 함수(`attach_payment_intent(tx_id, pi_id)`, 당사자·pending만)로. Task 1에 이 함수 추가 또는 여기서 마이그레이션 보강
- [ ] **Step 4: 빌드 + 미인증 401 / 무키 503 확인** — curl로 검증
- [ ] **Step 5: 커밋** — `git commit -m "feat: stripe util + checkout API"`

> 설계 메모: Checkout 세션은 생성 시 PaymentIntent id가 확정되므로 순서는 (1) `start_transaction` → tx.id, (2) Checkout 세션 생성(metadata에 tx.id), (3) `attach_payment_intent(tx.id, session.payment_intent)`. webhook은 PI id로 `mark_paid`.

---

### Task 3: Stripe Webhook (서명 검증 + 멱등 결제확정)

**Files:**
- Create: `app/api/stripe/webhook/route.ts`, `lib/supabase/admin.ts`

**Interfaces:**
- Produces: `createAdminSupabase()` — `SUPABASE_SERVICE_ROLE_KEY`로 RLS 밖 클라이언트(서버 전용, 키 없으면 throw)
- Produces: `POST /api/stripe/webhook` — raw body + `stripe-signature` 검증 → `checkout.session.completed`/`payment_intent.succeeded`에서 PI id 추출 → `mark_paid` RPC(멱등). 서명 실패 400, 그 외 200

- [ ] **Step 1: `lib/supabase/admin.ts`** — service_role 클라이언트 팩토리 (auth persist 없음)
- [ ] **Step 2: webhook 라우트** — `export const runtime='nodejs'`, `await req.text()`로 raw body, `stripe.webhooks.constructEvent(body, sig, whsec)`; 키/시크릿 없으면 503. `mark_paid`는 admin 클라이언트로 호출(webhook은 세션 없음). 처리 성공 200(재시도해도 멱등)
- [ ] **Step 3: 로컬 검증** — `stripe listen --forward-to localhost:3000/api/stripe/webhook`로 test 이벤트 → 거래 `paid`·listing `sold` 확인 (키 확보 후)
- [ ] **Step 4: 커밋** — `git commit -m "feat: stripe webhook with idempotent payment confirmation"`

---

### Task 4: 거래 진행 화면 `/transactions/[id]` + 구매 진입

**Files:**
- Create: `app/transactions/[id]/page.tsx`, `components/EscrowTimeline.tsx`, `components/TxActions.tsx`
- Modify: `app/listings/[id]/page.tsx` (안전결제 버튼 → `/api/checkout` 호출), `components/BottomNav.tsx`(선택: 거래 탭)

**Interfaces:**
- Consumes: `getViewer`, `displayTitle`, `formatWithConversion`, `advance_transaction` RPC, `POST /api/checkout`
- Produces: `/transactions/[id]` — 에스크로 타임라인(경로별 단계 하이라이트), 금액 내역(상품가+국제배송비+수수료), 상대/상품 카드, 상태·주체별 액션 버튼(판매자 발송+운송장, 센터 단계는 안내만, 구매자 수령확인, 완료 후 후기 진입). RLS로 당사자만 열람(비당사자 notFound)
- Produces: 상세 페이지 "안전결제" 버튼(구매자용, 판매자 본인 상품엔 미표시)

- [ ] **Step 1: `EscrowTimeline`** — `is_cross_border`별 단계 배열, 현재 status 이전=완료/현재=강조/이후=흐림. 말풍선/하트 모티프 톤
- [ ] **Step 2: `TxActions`** (client) — 현재 status·viewer 역할(구매자/판매자/admin)에 맞는 버튼만 렌더, `supabase.rpc('advance_transaction', {...})` 호출 후 `router.refresh()`. 운송장 입력 필드 포함
- [ ] **Step 3: 페이지(server)** — 거래 조회(임베드 to-one 캐스팅은 Plan 03과 동일 처리), `notFound()` 가드, 타임라인+내역+액션 조립
- [ ] **Step 4: 상세 결제 버튼** — 구매자에게 안전결제 버튼(`/api/checkout`→`{url}` 리다이렉트). 크로스보더면 국제배송비 안내
- [ ] **Step 5: 빌드 + 커밋** — `git commit -m "feat: transaction progress page + checkout entry"`

---

### Task 5: 센터 관리 화면 `/admin/center`

**Files:**
- Create: `app/admin/center/page.tsx`, `components/CenterQueue.tsx`
- (선택) Modify: `middleware.ts` 없음(자체 가드), `lib/listings.ts` 재사용

**Interfaces:**
- Consumes: `getViewer`(is_admin), `advance_transaction` RPC(센터 전이)
- Produces: `/admin/center` — admin 아니면 redirect. 센터별(SEOUL/NARITA) 탭, `shipped_to_center`(입고 대기)·`center_received`(국제발송 대기) 거래 목록, "입고 확인"→`center_received`, "국제 발송"→`shipped_international`(+운송장) 버튼

- [ ] **Step 1: admin 가드** — `getViewer`에 `is_admin` 포함(필요 시 `lib/listings.ts` getViewer 확장) 또는 페이지에서 profiles 조회. 비admin `redirect('/')`
- [ ] **Step 2: `CenterQueue`** (client) — 센터 탭 + 목록 + 전이 버튼(`advance_transaction`)
- [ ] **Step 3: 페이지(server)** — 센터 경유 거래 조회(admin이므로 RLS 확장 필요: transactions SELECT는 당사자 한정 → **admin SELECT 정책 추가** 또는 admin 클라이언트 조회. RLS에 `admin reads center transactions` 정책 추가가 정석 → Task 1/별도 소형 마이그레이션 `0009_admin_center_rls.sql`)
- [ ] **Step 4: admin 테스트 계정 지정** — 시드/ SQL로 한 계정 `is_admin=true` (E2E용). 문서화
- [ ] **Step 5: 빌드 + 커밋** — `git commit -m "feat: admin center management screen"`

> RLS 메모: 센터 admin은 거래 당사자가 아니므로 현재 "parties read transactions" 정책으론 못 봄. `create policy "admin reads transactions" on transactions for select using (exists(select 1 from profiles p where p.id=auth.uid() and p.is_admin))` 추가. 센터 전이 함수는 이미 admin 검증하므로 select만 열어주면 됨.

---

### Task 6: 후기 UI + 신뢰온도 하트 게이지 + 프로필

**Files:**
- Create: `app/profile/[id]/page.tsx`, `components/ReviewForm.tsx`, `components/HeartGauge.tsx`
- Modify: `app/transactions/[id]/page.tsx`(완료 시 후기 진입)

**Interfaces:**
- Consumes: `submit_review` RPC, reviews(공개 SELECT), profiles.trust_temp
- Produces: `/profile/[id]` — 하트 게이지(trust_temp 시각화), 판매 상품, 받은 후기 목록
- Produces: `<ReviewForm txId>` — 별점+한줄, `submit_review` 호출(완료 거래·미작성만)
- Produces: `<HeartGauge temp>` — 36.5 기준 하트 채움 시각화(브랜드 §2)

- [ ] **Step 1: `HeartGauge`** — trust_temp → 하트 채움 비율, 코랄/핑크 톤
- [ ] **Step 2: `ReviewForm`** (client) — 별점 선택 + 코멘트, `supabase.rpc('submit_review')`, 성공 시 refresh. 이미 작성 시 숨김
- [ ] **Step 3: 프로필 페이지(server)** — 프로필 + 하트 게이지 + 상품 그리드 + 후기 목록
- [ ] **Step 4: 거래완료 후기 진입** — `/transactions/[id]`가 `completed`면 ReviewForm 노출
- [ ] **Step 5: 빌드 + 커밋** — `git commit -m "feat: reviews + trust temperature + profile page"`

---

### Task 7: 테스트 (상태머신 단위 + RLS 통합 + Stripe 통합 + E2E)

**Files:**
- Create: `tests/escrow.test.ts`, `tests/fees.test.ts`

**Interfaces:**
- Consumes: 전체. alice(ko/KR)·bob(ja/JP) 계정, admin 테스트 계정, bob 시드 상품

- [ ] **Step 1: 수수료·환산 단위 테스트** — `tests/fees.test.ts`: `platform_fee=floor(price*0.1)` 경계값, 환율 환산(기존 currency 유틸과 정합)
- [ ] **Step 2: 상태머신 + RLS 통합** — `tests/escrow.test.ts` (실 DB, anon key + RPC):
  - `start_transaction`: 타인 상품 예약+거래 생성, listing `reserved` 확인
  - 본인 상품 결제 거부, 이미 예약된 상품 재결제 거부(경합)
  - `advance_transaction` 정상 경로: (국내) paid→shipped→delivered→completed / (크로스보더) paid→shipped_to_center→center_received→shipped_international→delivered→completed
  - **불법 전이 거부**: 국내 상품에 `shipped_to_center`, 크로스보더에 `shipped`, 역방향 전이, 건너뛰기 전이
  - **주체 위반 거부**: 구매자가 shipped, 판매자가 completed(수령확인), 비admin이 center_received
  - transactions 직접 UPDATE 시도 거부(권한 회수 확인)
  - `submit_review`: completed 거래만, 당사자만, 상대 trust_temp 변화 확인, 중복 후기 거부
  - anon은 거래·후기 함수 호출 불가
  - (주: mark_paid는 service_role 전용 — 통합 테스트에선 service_role 키로 별도 검증하거나 스킵. 상태머신 전이는 SQL로 paid 세팅 후 검증)
- [ ] **Step 3: Stripe 통합** (키 확보 시) — 테스트 카드 결제 → webhook → `paid`·listing `sold` 확인. 멱등: 동일 이벤트 2회 → 상태 1회만
- [ ] **Step 4: 전체 실행** — `npx vitest run` — 기존 20개 + 신규 전부 PASS, 2회 연속 멱등. 테스트 잔류(거래/후기)는 find-or-reuse 또는 실행당 누적 허용, 필요 시 SECURITY DEFINER cleanup 함수
- [ ] **Step 5: 수동 E2E**(스펙 §10) — JP 셀러(bob) 등록 → KR 구매자(alice) 검색·채팅·안전결제(테스트 카드) → `/admin/center`에서 입고·국제발송 → alice 수령확인 → 완료·정산 → 상호 후기·신뢰온도 반영 확인
- [ ] **Step 6: 커밋 + 레저·HANDOFF 갱신** — progress.md에 P4 기록, HANDOFF 로드맵·완료 항목·키 상태 갱신, `git commit -m "feat: escrow tests + docs"`

---

## Self-Review 체크리스트 (작성자용 — 구현 착수 전 확인)

- 스펙 커버리지: 에스크로 결제(§3.4)·상태머신 국내/크로스보더(§6)·센터 물류(§5·§7)·센터 관리 화면(§3.6)·신뢰온도+후기(§5·§7)·수수료 10%(§6)·webhook 멱등(§9)·admin RLS(§9) 모두 태스크 존재. 페이지 `/transactions/[id]`·`/admin/center`·`/profile/[id]`(§8) 포함
- 보안: 모든 상태 전이 SECURITY DEFINER 함수 경유(직접 UPDATE 권한 회수), 주체·경로·허용전이 3중 검증, 낙관적 잠금으로 경합 차단, trust_temp는 함수로만, webhook 서명검증+PI unique 멱등, admin 전이·조회 is_admin 검증
- 이월/제외: 분쟁(disputed) 자동화·수령 자동확인 배치·로컬 PG는 MVP 제외(§3). 정산은 테스트 모드 필드/로그 기록. 실제 Stripe Connect 송금 미구현
- 블로커: Task 2~3·Stripe 통합 테스트는 STRIPE/service_role 키 대기. 나머지(1,4,5,6,7 단위·RLS)는 선행 가능
- 배포 이월(P1~P3 누적): Vercel 배포 + 폰트 복원(Cafe24 써라운드/M PLUS Rounded), 피드 쿼리 에러 표시, 고아 이미지 정리, a11y 라벨, 메시지 페이지네이션, 조회 시 번역 재시도
