-- 통관·관세 구간제 (사줘 역산): 면세 한도 이하 = 소계 10%, 초과 = 관세·부가세(CIF) + 소계 5%.
-- proxy_orders.service_fee 컬럼은 이름 그대로 두고 의미만 "통관·관세"로 (lib/fees.ts customsCharge와 동일 규칙)
comment on column proxy_orders.service_fee is '통관·관세 (면세 한도 이하 10%, 초과 시 관세·부가세 + 5%) — lib/fees.ts customsCharge';

create or replace function proxy_customs(p_subtotal int, p_ship int, p_cur currency_code) returns int
  language sql immutable as $$
  select case
    when p_subtotal <= 0 then 0
    when p_cur = 'KRW' and p_subtotal <= 200000 then floor(p_subtotal * 0.10)::int
    when p_cur = 'JPY' and p_subtotal <= 10000 then floor(p_subtotal * 0.10)::int
    when p_cur = 'KRW' then
      floor((p_subtotal + p_ship) * 0.08)::int
      + floor(((p_subtotal + p_ship) + floor((p_subtotal + p_ship) * 0.08)) * 0.10)::int
      + floor(p_subtotal * 0.05)::int
    else floor((p_subtotal + p_ship) * 0.10)::int + floor(p_subtotal * 0.05)::int
  end
$$;

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
    if v_item.status = 'sold' or v_item.fetched_at < now() - interval '24 hours' then raise exception 'stale item'; end if;
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
