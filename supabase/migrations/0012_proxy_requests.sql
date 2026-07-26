-- 구매대행 신청 (Plan 05 Task 4)
-- 외부 마켓 상품을 대신 구매 → 견적 → 승인 → 결제 → 센터 경유 배송
create type proxy_status as enum (
  'requested','quoted','approved','paid','purchasing',
  'center_received','shipped_international','delivered','completed','cancelled');

create table proxy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  external_item_id uuid not null references external_items(id),
  status proxy_status not null default 'requested',
  note text not null default '',
  -- 견적 (어드민이 입력, JPY 기준)
  quote_item_price integer,
  quote_fee integer,
  quote_shipping integer,
  quote_total integer,
  quoted_at timestamptz,
  -- 진행
  center center_code,
  intl_tracking text,
  stripe_payment_intent_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on proxy_requests (user_id, created_at desc);
create index on proxy_requests (status);

create trigger proxy_requests_touch before update on proxy_requests
  for each row execute function touch_updated_at();

alter table proxy_requests enable row level security;
create policy "own proxy requests" on proxy_requests for select
  using (user_id = auth.uid());
create policy "admin reads proxy requests" on proxy_requests for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
-- 쓰기는 전부 함수 경유 (거래와 동일 원칙)
revoke insert, update, delete on proxy_requests from authenticated, anon;

-- 신청: 로그인 유저가 외부 상품에 대해 생성 (중복 진행 건 방지)
create or replace function request_proxy(p_external_item_id uuid, p_note text default '')
  returns proxy_requests language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_item external_items; v_r proxy_requests;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  select * into v_item from external_items where id = p_external_item_id;
  if v_item is null then raise exception 'item not found'; end if;
  if v_item.status = 'sold' then raise exception 'item sold out'; end if;
  -- 같은 상품에 진행 중인 신청이 있으면 그걸 반환 (멱등)
  select * into v_r from proxy_requests
    where user_id = v_uid and external_item_id = p_external_item_id
      and status not in ('cancelled','completed') limit 1;
  if found then return v_r; end if;
  insert into proxy_requests (user_id, external_item_id, note,
      center, quote_item_price)
    values (v_uid, p_external_item_id, coalesce(p_note,''),
      case when v_item.currency = 'JPY' then 'NARITA'::center_code else 'SEOUL'::center_code end,
      v_item.price)
    returning * into v_r;
  return v_r;
end $$;

-- 어드민 견적 발송: requested -> quoted
create or replace function quote_proxy(p_id uuid, p_item_price int, p_fee int, p_shipping int)
  returns proxy_requests language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_admin boolean; v_r proxy_requests;
begin
  select is_admin into v_admin from profiles where id = v_uid;
  if not coalesce(v_admin, false) then raise exception 'admin only'; end if;
  if p_item_price < 0 or p_fee < 0 or p_shipping < 0 then raise exception 'invalid quote'; end if;
  update proxy_requests set
    quote_item_price = p_item_price, quote_fee = p_fee, quote_shipping = p_shipping,
    quote_total = p_item_price + p_fee + p_shipping, quoted_at = now(), status = 'quoted'
    where id = p_id and status in ('requested','quoted')
    returning * into v_r;
  if not found then raise exception 'cannot quote in current state'; end if;
  return v_r;
end $$;

-- 상태 전이: 주체(고객/어드민)·경로 검증
create or replace function advance_proxy(p_id uuid, p_to proxy_status, p_tracking text default null)
  returns proxy_requests language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_admin boolean := false; v_r proxy_requests;
  v_from proxy_status; v_owner boolean; v_ok boolean := false;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  select * into v_r from proxy_requests where id = p_id;
  if v_r is null then raise exception 'not found'; end if;
  select is_admin into v_admin from profiles where id = v_uid;
  v_admin := coalesce(v_admin, false);
  v_owner := v_r.user_id = v_uid;
  if not v_owner and not v_admin then raise exception 'not authorized'; end if;
  v_from := v_r.status;

  -- 고객: 견적 승인, 수령 확인, 구매확정, 취소(결제 전)
  v_ok :=
       (v_owner and v_from = 'quoted'    and p_to = 'approved')
    or (v_owner and v_from = 'delivered' and p_to = 'completed')
    or (v_owner and v_from in ('requested','quoted','approved') and p_to = 'cancelled')
  -- 어드민: 결제확인→구매→센터입고→국제발송→배송완료, 취소
    or (v_admin and v_from = 'approved'             and p_to = 'paid')
    or (v_admin and v_from = 'paid'                 and p_to = 'purchasing')
    or (v_admin and v_from = 'purchasing'           and p_to = 'center_received')
    or (v_admin and v_from = 'center_received'      and p_to = 'shipped_international')
    or (v_admin and v_from = 'shipped_international' and p_to = 'delivered')
    or (v_admin and v_from <> 'completed'           and p_to = 'cancelled');

  if not v_ok then raise exception 'illegal proxy transition % -> %', v_from, p_to; end if;

  update proxy_requests set status = p_to,
    intl_tracking = case when p_to = 'shipped_international'
      then coalesce(p_tracking, intl_tracking) else intl_tracking end
    where id = p_id and status = v_from
    returning * into v_r;
  if not found then raise exception 'state changed concurrently'; end if;
  return v_r;
end $$;

revoke execute on function request_proxy(uuid, text) from public;
revoke execute on function quote_proxy(uuid, int, int, int) from public;
revoke execute on function advance_proxy(uuid, proxy_status, text) from public;
grant execute on function request_proxy(uuid, text) to authenticated;
grant execute on function quote_proxy(uuid, int, int, int) to authenticated;
grant execute on function advance_proxy(uuid, proxy_status, text) to authenticated;
