# 사줘(SAZO)식 장바구니·주문서·결제 — 설계 (2026-09-04)

외부마켓(메루카리·야후·당근·중고나라) 상품을 장바구니에 담아 **주문 시 1회 결제**하는 흐름. 기존 "대행 신청 → 어드민 견적 → 승인 → 어드민 수동 결제확인" 경로는 경매(입찰 대행)에만 남긴다.

참고 원본: sazo.kr 상세(`장바구니 담기`+`바로 구매하기`), `/cart`(체크·삭제·정보변경 제외·주문 개요), 주문서(주문 상품·배송지·배송/통관 안내·결제수단 타일·약관 문구·주문 개요 sticky).

## 1. 범위

포함
- `cart_items` 카트, `/cart` 화면, GNB 카트 아이콘+배지
- `/order` 주문서(배송지·결제수단), Stripe Checkout 연결, 웹훅으로 결제 확정
- `/order/[id]` 영수증, 마이페이지 "대행" 섹션에 주문 단위 표시
- 외부상품 상세 하단바 2버튼(장바구니 / 바로 구매)

제외(YAGNI)
- 쿠폰, 카트 하단 관심상품, 휴대폰결제, 다중 배송지, 국내 상품(`listings`) 카트. 국내 상품은 판매자별 에스크로 1건 구조라 카트 불가.
- 카카오페이·네이버페이는 Stripe 한국 계정에서만 활성. 계정이 다르면 Stripe가 카드만 노출 — 코드는 요청만 하고 실패 처리 안 함(Stripe가 미지원 타입은 세션 생성 오류 → 카드로 재시도 1회).

## 2. 데이터 (마이그레이션 `0018_cart_orders.sql`)

```sql
-- 카트: 돈 아님. 본인 RLS로 직접 CRUD.
create table cart_items (
  user_id uuid not null references profiles(id),
  external_item_id uuid not null references external_items(id),
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, external_item_id)
);
-- RLS: user_id = auth.uid() 로 select/insert/delete (update 없음)

-- 주문 = 결제 단위. 쓰기는 함수·service_role만.
create type proxy_order_status as enum ('pending_payment','paid','cancelled');
create table proxy_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  status proxy_order_status not null default 'pending_payment',
  currency currency_code not null,             -- 뷰어 통화(결제 통화)
  subtotal integer not null, intl_shipping integer not null,
  service_fee integer not null, total integer not null,
  rate numeric not null,                        -- 생성 시점 환율 (JPY_KRW 또는 KRW_JPY)
  payment_method text not null,                 -- card | kakao_pay | naver_pay
  stripe_session_id text unique, stripe_payment_intent_id text unique,
  ship_name text not null, ship_phone text not null, ship_postal text not null,
  ship_address text not null, ship_note text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- RLS: 본인 select, 어드민 select. insert/update/delete revoke.

alter table proxy_requests add column order_id uuid references proxy_orders(id);
alter table profiles add column ship_name text, ship_phone text, ship_postal text, ship_address text, ship_note text;
-- 본인 update 정책은 기존 profiles 정책 재사용(컬럼 추가만)
```

함수 (SECURITY DEFINER, authenticated만)
- `create_proxy_order(p_item_ids uuid[], p_method text, p_ship_name, p_ship_phone, p_ship_postal, p_ship_address, p_ship_note) returns proxy_orders`
  - 카트에 있는 본인 항목만 허용. `external_items.status='sold'` 또는 `fetched_at < now()-24h` 항목은 예외(`stale item`) — 클라이언트가 먼저 제외하므로 방어용.
  - 금액은 DB에서 재계산: 뷰어 통화로 환산한 상품가 합 = `subtotal`, `service_fee = floor(subtotal*0.10)`, `intl_shipping` = 통화별 정액(KRW 8000 / JPY 900, `lib/fees.ts`와 동일 상수) **주문당 1회**. `total = subtotal + intl_shipping + service_fee`.
  - 항목마다 `proxy_requests` 생성(status `requested`, `order_id`, note=카트 note, `quote_item_price`=상품 원가). 진행 중 동일 상품 요청이 있으면 그걸 order에 붙임(기존 멱등 규칙 유지).
  - 배송지를 `profiles.ship_*`에도 저장(다음 주문 프리필).
- `mark_proxy_order_paid(p_session_id text, p_payment_intent_id text)` — service_role 전용(웹훅). `pending_payment→paid`, 하위 requests `requested→paid`, 해당 `cart_items` 삭제. `stripe_payment_intent_id` UNIQUE로 재시도 안전.
- `advance_proxy` 매트릭스 변경 없음(`paid` 이후는 기존 어드민 경로). 고객 취소는 `pending_payment` 주문만: `cancel_proxy_order(p_id)` → 주문 cancelled + 하위 requests cancelled.

## 3. API / 서버

- `POST /api/cart` `{source, sourceId, title, price, currency, url, images, sellerName, note}` → 기존 `/api/proxy`와 같은 `external_items` upsert(service_role) 후 `cart_items` insert. 응답 `{count}`. `DELETE /api/cart?itemId=` 는 불필요 — 클라이언트가 Supabase로 직접 delete(RLS).
- `POST /api/order` `{itemIds[], method, ship:{name,phone,postal,address,note}}` → `create_proxy_order` RPC → Stripe Checkout 세션(`mode: payment`, `payment_method_types: [method]`, `line_items` 1건 "TOMO 구매대행 N건", `metadata.proxy_order_id`, success `/order/[id]`, cancel `/cart`) → 세션 id를 `proxy_orders.stripe_session_id`에 기록(service_role) → `{url}`. Stripe 키 없으면 503 `결제 준비 중`(주문은 생성 안 함 — RPC 호출 전에 키 체크).
- `/api/stripe/webhook`: `checkout.session.completed`에서 `metadata.proxy_order_id` 있으면 `mark_proxy_order_paid`. 기존 `transaction_id` 분기 유지.
- `lib/fees.ts`: `proxyOrderTotal(items: {price, currency}[], viewerCurrency, rate)` 추가 — DB 함수와 같은 규칙, 카트·주문서 표시용. 단위 테스트 1개.
- `lib/listings.ts getViewer`에 `cartCount` 추가(`cart_items` count, layout 1회) — GNB 배지.

## 4. 화면 (DESIGN.md v2 토큰, `t(lang,key)` 사전)

### 외부상품 상세 하단바 (`app/global/[source]/[id]/page.tsx`)
- 경매 아님·상대국 상품: `[장바구니]`(아웃라인, 아이콘) + `[바로 구매]`(코랄, flex-[2]). 새 `CartButtons` 클라이언트 컴포넌트가 `ProxyRequestButton` 자리를 대체. 장바구니 → POST /api/cart → 버튼이 "담김 · 카트 보기" 링크로 바뀜(토스트 없음). 바로 구매 → POST /api/cart → `router.push('/order?items=<id>')`.
- 경매: 기존 `ProxyRequestButton`(입찰 대행, 견적 경로) 그대로.
- 게스트: 두 버튼 모두 `/login?next=` 링크.

### `/cart` (`app/cart/page.tsx` 서버 + `CartList` 클라이언트)
- 상단: 전체 선택 (n/N) · 삭제. 항목: 썸네일 56px·제목(번역 우선)·소스 라벨·뷰어 통화 가격·체크박스·X.
- 정보 변경: `external_items.status='sold'` 또는 `fetched_at` 24h 초과 → 항목에 노란 배지 "상품 정보가 변경되었어요", 체크 불가(자동 제외). 별도 모달 없음(SAZO 모달 대신 사전 제외).
- 주문 개요 카드: 상품 소계 / 국제 배송비 / 통관·대행 수수료(10%) / 전체 금액(17px/800 navy) / "받으실 때 추가 청구 없음" / `[결제하기]`(선택 0건이면 disabled). 모바일 하단 고정(`standalone:` 탭바 위), md+ 우측 sticky.
- 빈 상태: 두 언어 병기 + "/global 둘러보기".
- 라우트 보호: 게스트 → `/login?next=/cart`.

### `/order` (`app/order/page.tsx` + `OrderForm` 클라이언트)
- `?items=a,b` 없으면 카트의 체크 상태를 못 알기 때문에 `/cart`에서 `결제하기`가 `/order?items=…`로 이동.
- 섹션 순서(SAZO 동일): 주문 상품(접이식, 기본 접힘 N건) → 배송지(이름·전화·우편번호·주소·요청사항, 프로필 `ship_*` 프리필, 네이티브 input, 라벨 표시) → 배송 안내(예상 10~15일, 센터 경유 문구) → 통관 안내(기존 `ext.customsNote`) → 결제 수단 타일(radio 그룹: 카드 / 카카오페이 / 네이버페이. JPY 뷰어는 카드만) + "TOMO 안전결제(에스크로) 적용" 문구 → `[결제하기]` + "결제하기를 누르면 이용약관·개인정보처리방침에 동의한 것으로 봅니다. 판매처 주문 완료 후 취소는 불가합니다." → 주문 개요(카트와 같은 컴포넌트 `OrderSummary`).
- 제출 → POST /api/order → `window.location = url`. 503 → 카드 아래 "결제 준비 중" 문구(기존 관행).

### `/order/[id]` 영수증
- 주문 개요 + 상태(결제 대기/완료/취소) + 배송지 + 상품별 행(→ `/proxy/[id]`). `pending_payment`면 `[다시 결제]`(세션 재생성)와 `[주문 취소]`.

### 마이페이지
- 기존 "대행" 섹션 행: `order_id` 있는 요청은 주문 단위로 묶어 `/order/[id]` 링크, 없는 요청(경매)은 기존대로.

### GNB
- `SiteHeader` 아이콘 열에 카트(장바구니 SVG) + 개수 배지(채팅 배지와 같은 스타일). 하단 탭바는 5개 한도 유지 — 추가 안 함.

## 5. i18n
`cart.*`, `order.*`, `pay.*` 키 ko/ja 추가. 기존 `ext.confirmNote`("견적 승인 전엔 결제되지 않아요")는 경매 다이얼로그 전용으로 유지. `ext.step2`는 "결제 — 주문 시 1회, 2차 결제 없음"으로 수정.

## 6. 오류·엣지
- 카트에 담기 전 동일 상품 진행 중 요청 존재 → 담기는 허용, 주문 시 RPC가 기존 요청을 주문에 연결.
- 결제 후 상품 품절 → 어드민이 해당 요청만 `cancelled`(기존 권한). 환불은 Stripe 대시보드 수동(기존 미구현 항목과 동일).
- 웹훅 재전송 → `stripe_payment_intent_id` UNIQUE + 상태 조건으로 멱등.
- 환율은 주문 생성 시점 `exchange_rates` 값을 `proxy_orders.rate`에 고정.

## 7. 테스트
- `tests/fees.test.ts`: `proxyOrderTotal` 2건 이상 합산·배송비 1회·수수료 내림.
- `tests/cart-rls.test.ts`: 타인 카트 조회 0건, `proxy_orders` 직접 insert 거부.
- i18n 완전성은 기존 테스트.

## 8. 파일
신규: `supabase/migrations/0018_cart_orders.sql`, `app/cart/page.tsx`, `app/order/page.tsx`, `app/order/[id]/page.tsx`, `app/api/cart/route.ts`, `app/api/order/route.ts`, `components/CartButtons.tsx`, `components/CartList.tsx`, `components/OrderForm.tsx`, `components/OrderSummary.tsx`, `tests/cart-rls.test.ts`
수정: `app/global/[source]/[id]/page.tsx`, `app/api/stripe/webhook/route.ts`, `app/mypage/page.tsx`, `components/SiteHeader.tsx`, `lib/fees.ts`, `lib/listings.ts`, `lib/i18n.ts`, `tests/fees.test.ts`, `HANDOFF.md`
