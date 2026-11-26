-- 0035 결제 직전 재확인·주문 금액 (T4, docs/aaa/05-roadmap.md)
-- 1) create_proxy_order: 상품 신선도 기준 24시간 → 15분. 오류 코드 'stale item' 유지, 시그니처 유지.
--    /api/order 가 RPC 전에 마켓을 다시 읽어 fetched_at 을 갱신한다(lib/price-check.ts ORDER_FRESH_MS 와 같은 값).
--    재확인을 건너뛰고 RPC 를 직접 부르는 요청도 15분 넘은 가격으로는 주문하지 못한다.
-- 2) start_transaction: 국경 간 직거래 국제배송비를 화면 값(p_intl_shipping_fee) 대신 DB가 정한다.
--    대행과 같은 표 — 거래 통화(상품 통화)가 KRW면 8000, JPY면 900 (lib/fees.ts directShippingFee 와 같은 값).
--    인자는 시그니처 유지를 위해 남기고 음수 검사만 한다. 국경 간이 아니면 0.
-- 추가만 한다(create or replace, 같은 시그니처 → 기존 grant 유지). 본문은 0020·0021 정의를 그대로 옮기고 위 두 곳만 바꿨다.

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
  p_item_ids := (select array_agg(distinct x) from unnest(p_item_ids) x); -- 중복 ID 이중 청구 방지
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
    -- 0035: 24시간 → 15분. 결제 직전 재확인(/api/order)이 방금 갱신한 가격만 통과한다
    if v_item.status = 'sold' or v_item.fetched_at < now() - interval '15 minutes' then raise exception 'stale item'; end if;
    v_sub := v_sub + case when v_item.currency = v_cur then v_item.price else round(v_item.price * v_rate)::int end;
  end loop;
  v_ship := case when v_cur = 'KRW' then 8000 else 900 end;   -- 주문당 1회 (묶음). lib/fees.ts 상수와 동일
  v_fee := proxy_customs(v_sub, v_ship, v_cur);                -- 통관·관세 구간제

  insert into proxy_orders (user_id, currency, subtotal, intl_shipping, service_fee, total, rate, payment_method,
      ship_name, ship_phone, ship_postal, ship_address, ship_note)
    values (v_uid, v_cur, v_sub, v_ship, v_fee, v_sub + v_ship + v_fee, v_rate, p_method,
      trim(p_ship_name), trim(p_ship_phone), trim(p_ship_postal), trim(p_ship_address), coalesce(p_ship_note, ''))
    returning * into v_o;

  foreach v_id in array p_item_ids loop
    select note into v_note from cart_items where user_id = v_uid and external_item_id = v_id;
    select * into v_r from proxy_requests where user_id = v_uid and external_item_id = v_id
      and status = 'requested' and order_id is null limit 1;
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

create or replace function start_transaction(p_listing_id uuid, p_intl_shipping_fee int default 0, p_meetup boolean default false)
  returns transactions language plpgsql security definer set search_path = public as $$
declare
  v_l listings; v_uid uuid := auth.uid(); v_buyer_country country_code;
  v_cross boolean; v_center center_code; v_tx transactions;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  if coalesce(p_intl_shipping_fee, 0) < 0 then raise exception 'invalid shipping fee'; end if;
  perform release_stale_reservations();

  select * into v_l from listings where id = p_listing_id;
  if v_l is null then raise exception 'listing not found'; end if;
  if v_l.seller_id = v_uid then raise exception 'cannot buy own listing'; end if;
  if p_meetup and v_l.trade_method not in ('direct','both') then raise exception 'listing is shipping only'; end if;

  select country into v_buyer_country from profiles where id = v_uid;
  -- 만남 거래는 나라가 달라도 센터를 거치지 않는다
  v_cross := (not p_meetup) and v_l.cross_border_enabled and v_l.country <> v_buyer_country;
  v_center := case when v_cross then (case v_l.country when 'JP' then 'NARITA'::center_code else 'SEOUL'::center_code end) else null end;

  update listings set status = 'reserved', reserved_at = now()
    where id = p_listing_id and status = 'active';
  if not found then raise exception 'listing not available'; end if;

  insert into transactions (
    listing_id, buyer_id, seller_id, status, is_cross_border, center, meetup,
    item_price, intl_shipping_fee, platform_fee, currency)
  values (
    p_listing_id, v_uid, v_l.seller_id, 'pending_payment', v_cross, v_center, p_meetup,
    v_l.price,
    -- 0035: 화면 값 대신 서버 표(lib/fees.ts directShippingFee). 거래 통화 = 상품 통화
    case when v_cross then (case when v_l.currency = 'KRW' then 8000 else 900 end) else 0 end,
    floor(v_l.price * 0.10)::int, v_l.currency)
  returning * into v_tx;
  return v_tx;
end $$;

-- 시험(메인): begin; <이 파일>; <확인 쿼리>; rollback;
--   select prosrc like '%15 minutes%' from pg_proc where proname = 'create_proxy_order';   -- true
--   select prosrc like '%then 8000 else 900 end) else 0 end%' from pg_proc where proname = 'start_transaction'; -- true
--   select has_function_privilege('authenticated', 'start_transaction(uuid,int,boolean)', 'execute'); -- true
--   권한(grant) 조회 결과가 적용 전과 같아야 한다(create or replace 는 권한을 바꾸지 않는다)

-- 되돌리기(이 순서로 SQL 먼저, 그다음 코드 revert):
--   1) create_proxy_order: 0020_customs_tiers.sql 의 create_proxy_order 정의를 그대로 다시 실행한다(24시간 기준 복원).
--   2) start_transaction: 0021_travel_crosslist_trust.sql 의 start_transaction 정의(create or replace 부분만,
--      drop function 줄은 빼고)를 다시 실행한다(화면 값 p_intl_shipping_fee 사용 복원).
--   두 정의 모두 같은 시그니처라 grant 는 그대로 남는다.
