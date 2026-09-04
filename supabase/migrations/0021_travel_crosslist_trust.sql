-- 팩 1·2·3: 여행 일정(trips)·만남 거래(meetup 에스크로)·판매자 신뢰 지표(seller_stats)

-- ── 여행 일정 ──
create table trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  country country_code not null,          -- 방문 나라
  region text not null,                    -- 방문 지역 (REGIONS 값)
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index on trips (country, region, end_date);
alter table trips enable row level security;
-- 일정은 본인만 읽는다. 판매자는 개수만 (travelers_to)
create policy "own trips" on trips for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 이 지역에 앞으로 60일 안에 오는 여행자 수 (판매자 동기 부여용 공개 카운트)
create or replace function travelers_to(p_country country_code, p_region text) returns integer
  language sql stable security definer set search_path = public as
  $$ select count(distinct user_id)::integer from trips
     where country = p_country and region = p_region
       and end_date >= current_date and start_date <= current_date + 60 $$;
revoke all on function travelers_to(country_code, text) from public;
grant execute on function travelers_to(country_code, text) to anon, authenticated;

-- ── 만남 거래: 여행 직거래를 에스크로로 (결제 → 만나서 수령 확인 → 정산). 노쇼 방지 = 선결제 ──
alter table transactions add column meetup boolean not null default false;

drop function if exists start_transaction(uuid, int);
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
    v_l.price, case when v_cross then coalesce(p_intl_shipping_fee, 0) else 0 end,
    floor(v_l.price * 0.10)::int, v_l.currency)
  returning * into v_tx;
  return v_tx;
end $$;
revoke all on function start_transaction(uuid, int, boolean) from public;
grant execute on function start_transaction(uuid, int, boolean) to authenticated;

-- 상태 전이에 만남 경로 추가: paid → delivered(구매자, 만나서 받음) → completed(구매자)
create or replace function advance_transaction(p_tx_id uuid, p_to tx_status, p_tracking text default null)
  returns transactions language plpgsql security definer set search_path = public as $$
declare
  v_t transactions; v_uid uuid := auth.uid(); v_admin boolean := false;
  v_role text; v_from tx_status; v_ok boolean := false;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  select * into v_t from transactions where id = p_tx_id;
  if v_t is null then raise exception 'tx not found'; end if;
  select is_admin into v_admin from profiles where id = v_uid;
  v_role := case
    when v_uid = v_t.buyer_id then 'buyer'
    when v_uid = v_t.seller_id then 'seller'
    when v_admin then 'admin' else null end;
  if v_role is null then raise exception 'not authorized for this transaction'; end if;
  v_from := v_t.status;

  if v_t.meetup then
    v_ok :=
         (v_from = 'paid'      and p_to = 'delivered' and v_role = 'buyer')
      or (v_from = 'delivered' and p_to = 'completed' and v_role = 'buyer');
  elsif not v_t.is_cross_border then
    v_ok :=
         (v_from = 'paid'      and p_to = 'shipped'   and v_role = 'seller')
      or (v_from = 'shipped'   and p_to = 'delivered' and v_role = 'buyer')
      or (v_from = 'delivered' and p_to = 'completed' and v_role = 'buyer');
  else
    v_ok :=
         (v_from = 'paid'                  and p_to = 'shipped_to_center'     and v_role = 'seller')
      or (v_from = 'shipped_to_center'     and p_to = 'center_received'       and v_role = 'admin')
      or (v_from = 'center_received'       and p_to = 'shipped_international' and v_role = 'admin')
      or (v_from = 'shipped_international' and p_to = 'delivered'             and v_role = 'buyer')
      or (v_from = 'delivered'             and p_to = 'completed'             and v_role = 'buyer');
  end if;

  v_ok := v_ok
    or (v_from = 'pending_payment' and p_to = 'cancelled' and v_role in ('buyer','seller'))
    or (v_from = 'paid'            and p_to = 'disputed'  and v_role in ('buyer','seller'));
  if not v_ok then raise exception 'illegal transition % -> % by %', v_from, p_to, v_role; end if;

  update transactions set
    status = p_to,
    domestic_tracking = case when p_to in ('shipped','shipped_to_center') then coalesce(p_tracking, domestic_tracking) else domestic_tracking end,
    intl_tracking = case when p_to = 'shipped_international' then coalesce(p_tracking, intl_tracking) else intl_tracking end
    where id = p_tx_id and status = v_from
    returning * into v_t;
  if not found then raise exception 'state changed concurrently'; end if;

  if p_to = 'cancelled' then
    update listings set status = 'active', reserved_at = null where id = v_t.listing_id and status = 'reserved';
  end if;
  return v_t;
end $$;

-- ── 판매자 신뢰 지표: 거래 횟수·크로스보더 횟수·응답률(최근 90일, 상대가 먼저 말 건 대화 중 답한 비율) ──
create or replace function seller_stats(uid uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'deals', (select count(*) from transactions where seller_id = uid and status = 'completed'),
    'cross_deals', (select count(*) from transactions where seller_id = uid and status = 'completed' and (is_cross_border or meetup)),
    'response_rate', (
      select case when count(*) = 0 then null
        else round(100.0 * count(*) filter (where exists (select 1 from messages m where m.conversation_id = c.id and m.sender_id = uid)) / count(*))::integer end
      from conversations c
      where c.seller_id = uid and c.created_at > now() - interval '90 days'
        and exists (select 1 from messages m where m.conversation_id = c.id and m.sender_id <> uid))
  ) $$;
revoke all on function seller_stats(uuid) from public;
grant execute on function seller_stats(uuid) to anon, authenticated;
