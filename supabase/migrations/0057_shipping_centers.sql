-- 0057 배송 센터 개편 (docs/aaa/17-shipping-centers.md, Ren 2026-11-27 「1 10프로 업해서 적용, 나머지 센터 추천대로 ㄱ」)
-- 1) 한국→일본 국제배송비 = CarryToJ 해상특송 ACE 원가 × 가산율(1.10), 10원 단위 올림, 무게 구간표.
--    원가·가산율은 운영자만 읽는다(RLS). 고객·판매자는 최종 금액만 함수로 받는다(intl_ship_fee_krw·intl_ship_bands·listing_quote).
--    판매자가 고른 「포장 후 무게」(listings.ship_weight_kg)가 기준. 한국 상품 국제 택배는 무게가 있어야 결제된다(없으면 'ship weight required').
--    일본→한국(JPY 900 정액, 재팬비즈)·해외 마켓 대행 정액은 바꾸지 않는다.
-- 2) 통관 예치금: 한국→일본 직거래에서 상품가가 ¥16,666 이상(환율 KRW_JPY)이면 상품가의 10%(10원 올림)를 결제에 포함.
--    판매자 정산·수수료 계산에는 넣지 않는다. 실제 세금 입력 → 남는 금액은 부분 환불(refunds 대기열), 모자라면 운영 부담 기록.
-- 3) 센터 접수 단계(tx_center_steps): 국제 직거래가 결제되면 한 줄. 한국 센터 = CarryToJ 배송대행 신청, 일본 센터 = 재팬비즈 입고 예정 등록.
--    운영자가 번호·메모를 넣으면 끝. 일본 센터는 그 번호가 판매자 발송 주소 끝에 붙는다(tx_center_ref). 메모는 운영자만 읽는다.
-- 4) 실측 무게가 신고 구간보다 무거우면 차액을 판매자 정산에서 뺀다(transactions.ship_overage, 거래 완료 때 sale 행에서 차감).
-- FK 규칙(0051): 표 쌍마다 FK 하나. tx_center_steps→transactions 1개. 처리자 칸(done_by·updated_by)은 FK 없이 uuid.

-- ── 1) 요율 ────────────────────────────────────────────────────────────────
create table public.intl_ship_rates (
  route text not null default 'KR_JP' check (route = 'KR_JP'),
  max_kg numeric(5,2) not null check (max_kg > 0 and max_kg <= 100),
  cost_krw int not null check (cost_krw > 0 and cost_krw <= 10000000),
  primary key (route, max_kg)
);
create table public.intl_ship_settings (
  route text primary key check (route = 'KR_JP'),
  markup numeric(5,3) not null check (markup >= 1 and markup <= 2),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.intl_ship_rates enable row level security;
alter table public.intl_ship_settings enable row level security;
revoke all on public.intl_ship_rates, public.intl_ship_settings from anon, authenticated;
grant select on public.intl_ship_rates, public.intl_ship_settings to authenticated;
create policy "ship rates: admin read" on public.intl_ship_rates for select to authenticated using (is_admin_user());
create policy "ship settings: admin read" on public.intl_ship_settings for select to authenticated using (is_admin_user());

insert into public.intl_ship_settings (route, markup) values ('KR_JP', 1.100);
insert into public.intl_ship_rates (max_kg, cost_krw) values
  (0.10, 5520), (0.25, 6560), (0.50, 7140), (0.75, 7940), (1.00, 8410), (1.50, 9100), (2.00, 10590), (2.50, 11860),
  (3.00, 12100), (3.50, 12440), (4.00, 13700), (4.50, 14280), (5.00, 15660), (5.50, 16470), (6.00, 19350), (6.50, 20390),
  (7.00, 21310), (7.50, 22230), (8.00, 23150), (8.50, 24190), (9.00, 25220), (9.50, 25800), (10.00, 26840), (10.50, 27990),
  (11.00, 29140), (11.50, 30290), (12.00, 31440), (12.50, 32600), (13.00, 33750), (13.50, 34900), (14.00, 36050),
  (14.50, 37200), (15.00, 38360), (15.50, 39510), (16.00, 40660), (16.50, 41810), (17.00, 42960);

-- 최종 금액(원) = ceil(원가 × 가산율 / 10) × 10. 무게가 없거나 표 최대보다 무거우면 null
create function public.intl_ship_fee_krw(p_kg numeric) returns int
language sql stable security definer set search_path = public as $$
  select (ceil(r.cost_krw * s.markup / 10) * 10)::int
  from intl_ship_rates r join intl_ship_settings s on s.route = r.route
  where r.route = 'KR_JP' and p_kg > 0 and r.max_kg >= p_kg
  order by r.max_kg limit 1
$$;
-- 판매 폼용 구간 목록(최종 금액만)
create function public.intl_ship_bands() returns table (max_kg numeric, fee_krw int)
language sql stable security definer set search_path = public as $$
  select r.max_kg, (ceil(r.cost_krw * s.markup / 10) * 10)::int
  from intl_ship_rates r join intl_ship_settings s on s.route = r.route
  where r.route = 'KR_JP' order by r.max_kg
$$;
-- 통관 예치금 기준가(원): 상품가 × KRW_JPY ≥ ¥16,666 인 가장 작은 원화 금액. 환율이 없으면 null
create function public.customs_min_krw() returns int
language sql stable security definer set search_path = public as $$
  select ceil(16666 / rate)::int from exchange_rates where pair = 'KRW_JPY' and rate > 0
$$;
-- 통관 예치금(거래 통화). 한국→일본(KR 상품·원화)만. 환율이 없으면 결제를 막는다(예치금 누락 방지)
create function public.direct_customs_deposit(p_country country_code, p_currency currency_code, p_price int) returns int
language plpgsql stable security definer set search_path = public as $$
declare v_min int;
begin
  if p_country is distinct from 'KR' or p_currency is distinct from 'KRW' or coalesce(p_price, 0) <= 0 then return 0; end if;
  v_min := customs_min_krw();
  if v_min is null then raise exception 'rate missing'; end if;
  if p_price < v_min then return 0; end if;
  return (ceil(p_price * 0.10 / 10) * 10)::int;
end $$;
-- 국경 간 직거래 국제배송비(거래 통화). 한국 상품 = 무게 구간표(무게 없으면 null), 일본 상품 = 기존 정액(0035)
create function public.direct_intl_fee(p_country country_code, p_currency currency_code, p_kg numeric) returns int
language sql stable security definer set search_path = public as $$
  select case when p_country = 'KR' then (case when p_currency = 'KRW' then intl_ship_fee_krw(p_kg) end)
              else (case when p_currency = 'KRW' then 8000 else 900 end) end
$$;
-- 운영자 요율 수정(원가 upsert·삭제, 가산율). 고객 화면에는 최종 금액만 나간다
create function public.admin_set_ship_rate(p_max_kg numeric, p_cost_krw int) returns void
language plpgsql security definer set search_path = public as $$
declare v_old int;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if p_max_kg is null or p_max_kg <= 0 or p_max_kg > 100 then raise exception 'invalid weight'; end if;
  select cost_krw into v_old from intl_ship_rates where route = 'KR_JP' and max_kg = p_max_kg;
  if p_cost_krw is null then
    delete from intl_ship_rates where route = 'KR_JP' and max_kg = p_max_kg;
  else
    if p_cost_krw <= 0 or p_cost_krw > 10000000 then raise exception 'invalid cost'; end if;
    insert into intl_ship_rates (route, max_kg, cost_krw) values ('KR_JP', p_max_kg, p_cost_krw)
      on conflict (route, max_kg) do update set cost_krw = excluded.cost_krw;
  end if;
  perform log_admin_action('ship_rate', 'ship_rate', 'KR_JP:' || p_max_kg::text, jsonb_build_object('before', v_old, 'after', p_cost_krw));
end $$;
create function public.admin_set_ship_markup(p_markup numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_old numeric;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if p_markup is null or p_markup < 1 or p_markup > 2 then raise exception 'markup must be 1.000~2.000'; end if;
  select markup into v_old from intl_ship_settings where route = 'KR_JP';
  update intl_ship_settings set markup = p_markup, updated_at = now(), updated_by = auth.uid() where route = 'KR_JP';
  perform log_admin_action('ship_markup', 'ship_rate', 'KR_JP', jsonb_build_object('before', v_old, 'after', p_markup));
end $$;

-- ── 상품 무게 ──────────────────────────────────────────────────────────────
alter table public.listings add column ship_weight_kg numeric(5,2) check (ship_weight_kg is null or (ship_weight_kg > 0 and ship_weight_kg <= 100));
grant insert (ship_weight_kg), update (ship_weight_kg) on public.listings to authenticated;
-- 한국 상품을 국제 택배로 새로 열 때(등록·국제 거래 켜기·택배 켜기·무게 지우기) 무게 필수. 값이 그대로인 갱신(함수의 상태 변경 등)은 막지 않는다
create function public.listing_require_weight() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.country = 'KR' and new.cross_border_enabled and new.trade_method <> 'direct' and new.ship_weight_kg is null
     and (tg_op = 'INSERT' or old.ship_weight_kg is not null or not old.cross_border_enabled or old.trade_method = 'direct') then
    raise exception 'ship weight required';
  end if;
  return new;
end $$;
create trigger listings_require_weight before insert or update of cross_border_enabled, ship_weight_kg, trade_method
  on public.listings for each row execute function public.listing_require_weight();

-- 상세·경매 패널 표시용 견적. 값은 결제 함수가 쓰는 것과 같은 함수에서 나온다
create function public.listing_quote(p_listing uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'intl_fee', direct_intl_fee(l.country, l.currency, l.ship_weight_kg),
    'customs_min', case when l.country = 'KR' and l.currency = 'KRW' then customs_min_krw() end,
    'weight_kg', l.ship_weight_kg)
  from listings l where l.id = p_listing
$$;

-- ── 거래 칸 ────────────────────────────────────────────────────────────────
alter table public.transactions
  add column customs_deposit int not null default 0 check (customs_deposit >= 0),
  add column customs_actual int check (customs_actual is null or customs_actual >= 0),
  add column customs_shortfall int not null default 0 check (customs_shortfall >= 0),
  add column customs_settled_at timestamptz,
  add column ship_weight_kg numeric(5,2),
  add column measured_weight_kg numeric(5,2),
  add column ship_overage int not null default 0 check (ship_overage >= 0);

-- 결제 합계 = 상품가 + 국제배송비(국경 간) + 통관 예치금. 화면·결제·환불이 같은 규칙을 쓴다
create function public.tx_charge_base(t transactions) returns int
language sql immutable as $$
  select t.item_price + case when t.is_cross_border then t.intl_shipping_fee else 0 end + t.customs_deposit
$$;

-- ── 결제 함수(0035·0046 start_transaction, 0047 start_auction_transaction) ──
create or replace function public.start_transaction(p_listing_id uuid, p_intl_shipping_fee integer default 0, p_meetup boolean default false)
returns transactions language plpgsql security definer set search_path to 'public' as $function$
declare
  v_l listings; v_uid uuid := auth.uid(); v_buyer_country country_code;
  v_cross boolean; v_center center_code; v_tx transactions; v_fee int := 0; v_dep int := 0;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  if coalesce(p_intl_shipping_fee, 0) < 0 then raise exception 'invalid shipping fee'; end if;
  perform release_stale_reservations();

  select * into v_l from listings where id = p_listing_id;
  if v_l is null then raise exception 'listing not found'; end if;
  if v_l.sale_type = 'auction' then raise exception 'auction listing'; end if;   -- 0046
  if v_l.seller_id = v_uid then raise exception 'cannot buy own listing'; end if;
  if p_meetup and v_l.trade_method not in ('direct','both') then raise exception 'listing is shipping only'; end if;

  select country into v_buyer_country from profiles where id = v_uid;
  v_cross := (not p_meetup) and v_l.cross_border_enabled and v_l.country <> v_buyer_country;
  v_center := case when v_cross then (case v_l.country when 'JP' then 'NARITA'::center_code else 'SEOUL'::center_code end) else null end;
  if v_cross then
    -- 0057: 화면 값 대신 서버 표. 한국 상품 = 무게 구간표(무게 없으면 결제 안 됨), 일본 상품 = 정액
    v_fee := direct_intl_fee(v_l.country, v_l.currency, v_l.ship_weight_kg);
    if v_fee is null then raise exception 'ship weight required'; end if;
    v_dep := direct_customs_deposit(v_l.country, v_l.currency, v_l.price);
  end if;

  update listings set status = 'reserved', reserved_at = now()
    where id = p_listing_id and status = 'active' and sale_type = 'fixed';
  if not found then raise exception 'listing not available'; end if;

  insert into transactions (
    listing_id, buyer_id, seller_id, status, is_cross_border, center, meetup,
    item_price, intl_shipping_fee, platform_fee, currency, customs_deposit, ship_weight_kg)
  values (
    p_listing_id, v_uid, v_l.seller_id, 'pending_payment', v_cross, v_center, p_meetup,
    v_l.price, v_fee, floor(v_l.price * 0.10)::int, v_l.currency, v_dep,
    case when v_cross and v_l.country = 'KR' then v_l.ship_weight_kg end)
  returning * into v_tx;
  return v_tx;
end $function$;

create or replace function public.start_auction_transaction(p_auction uuid)
returns transactions language plpgsql security definer set search_path to 'public' as $function$
declare v_uid uuid := auth.uid(); v_a auctions; v_l listings; v_tx transactions; v_country country_code;
  v_cross boolean; v_center center_code; v_fee int := 0; v_dep int := 0;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  perform release_stale_reservations();
  select * into v_a from auctions where id = p_auction for update;   -- 같은 낙찰의 거래 열기를 한 줄로
  if v_a.id is null then raise exception 'auction not found'; end if;
  if v_a.winner_id is distinct from v_uid then raise exception 'not winner'; end if;
  if v_a.status <> 'awaiting_payment' then raise exception 'auction not payable'; end if;
  -- 이미 열린 결제 대기 거래가 있으면 그것을 돌려준다(결제창 재사용은 /api/checkout 규칙)
  select * into v_tx from transactions
    where listing_id = v_a.listing_id and buyer_id = v_uid and status = 'pending_payment' and created_at >= v_a.closed_at
    order by created_at desc limit 1;
  if found then return v_tx; end if;
  if clock_timestamp() >= v_a.pay_due_at then raise exception 'payment window closed'; end if;
  if exists (select 1 from transactions where listing_id = v_a.listing_id and status not in ('cancelled', 'completed')) then
    raise exception 'listing not available';
  end if;
  select * into v_l from listings where id = v_a.listing_id for update;
  if v_l.status <> 'reserved' then raise exception 'listing not available'; end if;

  select country into v_country from profiles where id = v_uid;
  v_cross := v_l.cross_border_enabled and v_l.country <> v_country;
  v_center := case when v_cross then (case v_l.country when 'JP' then 'NARITA'::center_code else 'SEOUL'::center_code end) else null end;
  if v_cross then   -- 0057: start_transaction 과 같은 표
    v_fee := direct_intl_fee(v_l.country, v_a.currency, v_l.ship_weight_kg);
    if v_fee is null then raise exception 'ship weight required'; end if;
    v_dep := direct_customs_deposit(v_l.country, v_a.currency, v_a.final_price);
  end if;
  insert into transactions (listing_id, buyer_id, seller_id, status, is_cross_border, center, meetup,
      item_price, intl_shipping_fee, platform_fee, currency, customs_deposit, ship_weight_kg)
    values (v_a.listing_id, v_uid, v_a.seller_id, 'pending_payment', v_cross, v_center, false,
      v_a.final_price, v_fee, floor(v_a.final_price * 0.10)::int, v_a.currency, v_dep,
      case when v_cross and v_l.country = 'KR' then v_l.ship_weight_kg end)
    returning * into v_tx;

  perform set_config('tomo.auction', '1', true);
  update listings set reserved_at = now() where id = v_a.listing_id;
  update auctions set tx_id = v_tx.id where id = p_auction;
  perform set_config('tomo.auction', '', true);
  return v_tx;
end $function$;

-- ── 판매 정산: 실측 초과 배송비는 판매자 몫에서 뺀다(통관 예치금은 처음부터 안 들어간다) ──
create or replace function public.credit_sale_on_complete()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_amount int := new.item_price - new.platform_fee - coalesce(new.ship_overage, 0);
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
     and new.stripe_payment_intent_id is not null and v_amount > 0 then
    insert into seller_ledger (user_id, currency, amount, kind, transaction_id, memo)
      values (new.seller_id, new.currency, v_amount, 'sale', new.id,
        case when coalesce(new.ship_overage, 0) > 0 then '실측 무게 초과 배송비 ' || new.ship_overage || ' 차감' else '' end)
      on conflict (transaction_id) where kind = 'sale' do nothing;
  end if;
  return new;
end $function$;

-- ── 환불: 한 거래에 전액 환불 1건 + 통관 정산 부분 환불 1건 ──
drop index if exists public.refunds_tx_once;
create unique index refunds_tx_once on public.refunds (transaction_id) where kind = 'tx' and is_full;
create unique index refunds_tx_customs_once on public.refunds (transaction_id) where kind = 'tx' and not is_full;

-- 전액 환불 금액 = 결제 합계(예치금 포함) − 이미 잡힌 환불(무효 제외). Stripe 쪽은 남은 잔액을 돌려준다(lib/refunds.ts)
create function public.tx_refundable(t transactions) returns int
language sql stable security definer set search_path = public as $$
  select greatest(tx_charge_base(t) - coalesce((select sum(amount) from refunds f
    where f.kind = 'tx' and f.transaction_id = t.id and f.status::text <> 'void'), 0), 0)::int
$$;

create or replace function public.admin_cancel_transaction(p_tx_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_t transactions; v_from tx_status; v_refund uuid; v_amount int; v_listing text;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'reason required'; end if;
  select * into v_t from transactions where id = p_tx_id for update;
  if v_t.id is null then raise exception 'tx not found'; end if;
  v_from := v_t.status;
  if v_from not in ('paid','shipped_to_center','center_received') then
    raise exception 'cannot cancel in state %', v_from;
  end if;
  update transactions set status = 'cancelled', cancel_reason = left(trim(p_reason), 1000)
    where id = p_tx_id and status = v_from returning * into v_t;
  if not found then raise exception 'state changed concurrently'; end if;
  v_listing := listing_after_tx_cancel(v_t.listing_id, v_t.id, v_from);
  v_amount := tx_refundable(v_t);   -- 0057: 통관 예치금 포함
  if v_t.stripe_payment_intent_id is not null and v_amount > 0 then
    insert into refunds (kind, transaction_id, user_id, payment_key, amount, currency, is_full, reason, created_by)
      values ('tx', v_t.id, v_t.buyer_id, v_t.stripe_payment_intent_id, v_amount, v_t.currency, true,
        left(trim(p_reason), 1000), auth.uid())
      on conflict do nothing
      returning id into v_refund;
  end if;
  perform log_admin_action('tx_cancel', 'transaction', v_t.id::text,
    jsonb_build_object('from', v_from, 'reason', left(trim(p_reason), 300), 'refund_id', v_refund, 'amount', v_amount,
      'currency', v_t.currency, 'listing', v_listing));
  return jsonb_build_object('refund', v_refund, 'amount', case when v_refund is null then 0 else v_amount end,
    'currency', v_t.currency, 'listing', v_listing);
end $function$;

create or replace function public.resolve_dispute(p_tx_id uuid, p_to tx_status, p_note text)
returns transactions language plpgsql security definer set search_path to 'public' as $function$
declare v_t transactions; v_refund uuid; v_listing text; v_amount int;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if p_to not in ('completed','cancelled') then raise exception 'resolution must be completed or cancelled'; end if;
  update transactions set status = p_to, dispute_resolution = left(coalesce(p_note, ''), 1000)
    where id = p_tx_id and status = 'disputed' returning * into v_t;
  if v_t.id is null then raise exception 'not in dispute'; end if;
  if p_to = 'cancelled' then
    -- 직전 상태를 모르면(0041 이전 분쟁) 보류 쪽으로 본다
    v_listing := listing_after_tx_cancel(v_t.listing_id, v_t.id, coalesce(v_t.disputed_from, 'delivered'));
    v_amount := tx_refundable(v_t);   -- 0057: 통관 예치금 포함, 통관 정산 환불분 제외
    if v_t.stripe_payment_intent_id is not null and v_amount > 0 then
      insert into refunds (kind, transaction_id, user_id, payment_key, amount, currency, is_full, reason, created_by)
        values ('tx', v_t.id, v_t.buyer_id, v_t.stripe_payment_intent_id, v_amount,
          v_t.currency, true, coalesce(nullif(trim(p_note), ''), '분쟁 환불'), auth.uid())
        on conflict do nothing
        returning id into v_refund;
    end if;
  end if;
  perform log_admin_action('dispute_' || p_to::text, 'transaction', v_t.id::text,
    jsonb_strip_nulls(jsonb_build_object('note', left(coalesce(p_note, ''), 300), 'refund_id', v_refund,
      'from', v_t.disputed_from, 'listing', v_listing)));
  return v_t;
end $function$;

-- ── 2) 통관 예치금 정산 ─────────────────────────────────────────────────────
-- 실제 관부가세(거래 통화)를 넣는다. 남으면 부분 환불 행(대기열 → 화면이 바로 실행), 모자라면 운영 부담으로 기록(추가 청구 없음)
create function public.admin_settle_customs(p_tx uuid, p_actual int, p_memo text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_t transactions; v_diff int; v_refund uuid; v_short int;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if p_actual is null or p_actual < 0 or p_actual > 100000000 then raise exception 'invalid amount'; end if;
  select * into v_t from transactions where id = p_tx for update;
  if v_t.id is null then raise exception 'tx not found'; end if;
  if v_t.customs_deposit <= 0 then raise exception 'no customs deposit'; end if;
  if v_t.customs_settled_at is not null then raise exception 'customs already settled'; end if;
  if v_t.status::text not in ('shipped_international', 'delivered', 'completed', 'disputed') then
    raise exception 'customs settle needs shipped_international or later (now %)', v_t.status;
  end if;
  if v_t.stripe_payment_intent_id is null then raise exception 'not paid'; end if;
  v_diff := v_t.customs_deposit - p_actual;
  v_short := greatest(-v_diff, 0);
  if v_diff > 0 then
    insert into refunds (kind, transaction_id, user_id, payment_key, amount, currency, is_full, reason, created_by)
      values ('tx', v_t.id, v_t.buyer_id, v_t.stripe_payment_intent_id, v_diff, v_t.currency, false,
        left('통관 예치금 정산(실제 세금 ' || p_actual || ')' || coalesce(nullif(' · ' || btrim(p_memo), ' · '), ''), 1000), auth.uid())
      returning id into v_refund;
  end if;
  update transactions set customs_actual = p_actual, customs_shortfall = v_short, customs_settled_at = now() where id = p_tx;
  perform log_admin_action('customs_settle', 'transaction', p_tx::text, jsonb_build_object('deposit', v_t.customs_deposit,
    'actual', p_actual, 'refund', greatest(v_diff, 0), 'refund_id', v_refund, 'ops_shortfall', v_short, 'memo', left(coalesce(p_memo, ''), 300)));
  return jsonb_build_object('refund', v_refund, 'refund_amount', greatest(v_diff, 0), 'shortfall', v_short, 'currency', v_t.currency);
end $$;

-- ── 4) 실측 무게(한국 센터) ─────────────────────────────────────────────────
-- 센터 입고 뒤 실측 무게(실무게·부피무게 중 큰 값)를 넣는다. 신고 구간 금액보다 비싸면 차액을 판매자 정산에서 뺀다(판매자 몫 상한)
create function public.admin_set_measured_weight(p_tx uuid, p_kg numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_t transactions; v_fee int; v_over int;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  select * into v_t from transactions where id = p_tx for update;
  if v_t.id is null then raise exception 'tx not found'; end if;
  if not v_t.is_cross_border or v_t.meetup or v_t.center is distinct from 'SEOUL' then raise exception 'not a KR center transaction'; end if;
  if v_t.status::text not in ('shipped_to_center', 'center_received') then raise exception 'measure needs center stage (now %)', v_t.status; end if;
  v_fee := intl_ship_fee_krw(p_kg);
  if v_fee is null then raise exception 'weight out of range'; end if;
  v_over := least(greatest(v_fee - v_t.intl_shipping_fee, 0), greatest(v_t.item_price - v_t.platform_fee, 0));
  update transactions set measured_weight_kg = p_kg, ship_overage = v_over where id = p_tx;
  if v_over > 0 and v_over is distinct from v_t.ship_overage then
    perform notify(v_t.seller_id, 'tx_ship_overage', 'tx', v_t.id::text,
      jsonb_build_object('code', v_t.code, 'amount', v_over, 'currency', v_t.currency, 'kg', p_kg, 'declared_kg', v_t.ship_weight_kg));
  end if;
  perform log_admin_action('measured_weight', 'transaction', p_tx::text, jsonb_build_object('declared_kg', v_t.ship_weight_kg,
    'measured_kg', p_kg, 'fee', v_fee, 'charged', v_t.intl_shipping_fee, 'overage', v_over, 'before', v_t.ship_overage));
  return jsonb_build_object('fee', v_fee, 'overage', v_over, 'currency', v_t.currency);
end $$;

-- ── 3) 센터 접수 단계 ───────────────────────────────────────────────────────
create table public.tx_center_steps (
  tx_id uuid primary key references public.transactions(id) on delete cascade,
  center center_code not null,
  due_at timestamptz not null default now(),       -- 결제 확정 시각
  ref text check (ref is null or char_length(ref) between 1 and 60),
  memo text not null default '' check (char_length(memo) <= 500),
  done_at timestamptz,
  done_by uuid,
  reminded_at timestamptz,
  constraint tx_center_steps_done check ((done_at is null) = (ref is null))
);
create index tx_center_steps_open_idx on public.tx_center_steps (center, due_at) where done_at is null;
alter table public.tx_center_steps enable row level security;
revoke all on public.tx_center_steps from anon, authenticated;
grant select on public.tx_center_steps to authenticated;
create policy "center steps: admin read" on public.tx_center_steps for select to authenticated using (is_admin_user());

-- 판매자 발송 주소 끝에 붙일 번호(일본 센터 = 재팬비즈 입고 예정 번호). 그 거래의 판매자·운영자만
create function public.tx_center_ref(p_tx uuid) returns text
language sql stable security definer set search_path = public as $$
  select s.ref from tx_center_steps s join transactions t on t.id = s.tx_id
  where s.tx_id = p_tx and s.center = 'NARITA' and (auth.uid() = t.seller_id or is_admin_user())
$$;

alter table public.ops_outbox drop constraint ops_outbox_type_check;
alter table public.ops_outbox add constraint ops_outbox_type_check check (type = any (array['order.paid', 'order.cancel_requested',
  'dispute.opened', 'ticket.opened', 'refund.pending', 'payout.requested', 'report.opened', 'errors.spike', 'cron.failed',
  'auction.ended', 'auction.unpaid', 'auction.cancelled', 'auction.flagged', 'bid.requested', 'bid.hold', 'bid.won', 'bid.missed',
  'bid.capture_failed', 'bid.auth_expiring', 'bid.to_place_due', 'bid.worker_down', 'bid.to_buy_due',
  'center.step_due', 'center.step_overdue']::text[]));

-- 국제 직거래 결제 확정 → 단계 한 줄 + 운영 알림
create function public.tx_center_step_on_paid() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status = 'pending_payment' and new.is_cross_border and not new.meetup and new.center is not null then
    insert into tx_center_steps (tx_id, center) values (new.id, new.center) on conflict (tx_id) do nothing;
    perform ops_emit('center.step_due', 'center.step_due:' || new.id, new.code, new.item_price, new.currency::text,
      '/admin/center', 'transaction', new.id::text);
  end if;
  return null;
end $$;
create trigger transactions_center_step after update of status on public.transactions
  for each row execute function public.tx_center_step_on_paid();

-- 운영자가 번호를 넣으면 끝. 고쳐 넣기도 같은 함수(기록 남김). 일본 센터는 처음 넣을 때 판매자에게 주소 알림
create function public.admin_set_center_step(p_tx uuid, p_ref text, p_memo text default '') returns tx_center_steps
language plpgsql security definer set search_path = public as $$
declare v_ref text := btrim(coalesce(p_ref, '')); v_s tx_center_steps; v_old tx_center_steps; v_t transactions;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if v_ref = '' or char_length(v_ref) > 60 or v_ref !~ '^[A-Za-z0-9._#/-]+$' then raise exception 'invalid ref'; end if;
  select * into v_t from transactions where id = p_tx;
  if v_t.id is null then raise exception 'tx not found'; end if;
  select * into v_old from tx_center_steps where tx_id = p_tx for update;
  if v_old.tx_id is null then raise exception 'no center step'; end if;
  if v_t.status::text in ('cancelled', 'pending_payment') then raise exception 'tx not active (%)', v_t.status; end if;
  update tx_center_steps set ref = v_ref, memo = left(btrim(coalesce(p_memo, '')), 500),
      done_at = coalesce(done_at, now()), done_by = auth.uid()
    where tx_id = p_tx returning * into v_s;
  if v_s.center = 'NARITA' and v_old.ref is distinct from v_ref then
    perform notify(v_t.seller_id, 'tx_center_addr_ready', 'tx', p_tx::text, jsonb_build_object('code', v_t.code));
  end if;
  perform log_admin_action('center_step', 'transaction', p_tx::text,
    jsonb_build_object('center', v_s.center, 'before', v_old.ref, 'after', v_ref));
  return v_s;
end $$;

-- 재알림: 결제 확정 뒤 6시간 지나도 번호가 없으면 한 번
create function public.cron_center_steps() returns int
language plpgsql security definer set search_path = public as $$
declare v_n int := 0; r record;
begin
  for r in select s.tx_id, t.code, t.item_price, t.currency from tx_center_steps s join transactions t on t.id = s.tx_id
      where s.done_at is null and s.reminded_at is null and s.due_at < now() - interval '6 hours'
        and t.status::text not in ('cancelled', 'pending_payment')
      for update of s skip locked loop
    perform ops_emit('center.step_overdue', 'center.step_overdue:' || r.tx_id, r.code, r.item_price, r.currency::text,
      '/admin/center', 'transaction', r.tx_id::text);
    update tx_center_steps set reminded_at = now() where tx_id = r.tx_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- 결제 완료된 국제 직거래 중 단계가 없는 것(적용 시점 0건 확인)도 채운다
insert into public.tx_center_steps (tx_id, center, due_at)
  select id, center, updated_at from public.transactions
  where is_cross_border and not meetup and center is not null and status::text in ('paid', 'shipped_to_center', 'center_received')
  on conflict do nothing;

-- ── 권한 ───────────────────────────────────────────────────────────────────
revoke all on function public.intl_ship_fee_krw(numeric), public.intl_ship_bands(), public.customs_min_krw(),
  public.direct_customs_deposit(country_code, currency_code, int), public.direct_intl_fee(country_code, currency_code, numeric),
  public.listing_quote(uuid), public.tx_center_ref(uuid) from public;
grant execute on function public.intl_ship_fee_krw(numeric), public.intl_ship_bands(), public.customs_min_krw(),
  public.direct_customs_deposit(country_code, currency_code, int), public.direct_intl_fee(country_code, currency_code, numeric),
  public.listing_quote(uuid) to anon, authenticated, service_role;
grant execute on function public.tx_center_ref(uuid) to authenticated, service_role;
revoke all on function public.admin_set_ship_rate(numeric, int), public.admin_set_ship_markup(numeric),
  public.admin_settle_customs(uuid, int, text), public.admin_set_measured_weight(uuid, numeric),
  public.admin_set_center_step(uuid, text, text), public.cron_center_steps(), public.tx_refundable(transactions) from public, anon;
grant execute on function public.admin_set_ship_rate(numeric, int), public.admin_set_ship_markup(numeric),
  public.admin_settle_customs(uuid, int, text), public.admin_set_measured_weight(uuid, numeric),
  public.admin_set_center_step(uuid, text, text) to authenticated, service_role;
grant execute on function public.cron_center_steps(), public.tx_refundable(transactions) to service_role;

select cron.schedule('tomo_center_steps', '7 * * * *', 'select public.cron_center_steps()');

-- 되돌리기: docs/aaa/17-rollback-0057.sql (적용 전 함수 정의 원문 + 표·칸 삭제). 기록이 있으면 먼저 뽑아 둔다.
