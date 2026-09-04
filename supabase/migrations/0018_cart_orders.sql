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
  v_fee := floor(v_sub * 0.10);

  insert into proxy_orders (user_id, currency, subtotal, intl_shipping, service_fee, total, rate, payment_method,
      ship_name, ship_phone, ship_postal, ship_address, ship_note)
    values (v_uid, v_cur, v_sub, v_ship, v_fee, v_sub + v_ship + v_fee, v_rate, p_method,
      trim(p_ship_name), trim(p_ship_phone), trim(p_ship_postal), trim(p_ship_address), coalesce(p_ship_note, ''))
    returning * into v_o;

  -- 항목별 진행 단위. 진행 중 동일 요청이 있으면 그걸 주문에 붙임 (request_proxy 멱등 규칙과 동일)
  foreach v_id in array p_item_ids loop
    select note into v_note from cart_items where user_id = v_uid and external_item_id = v_id;
    -- 견적 진행 중(quoted/approved) 요청은 새 요청으로 분리 (paid 전이는 requested만 대상)
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
