-- Plan 04 Task 1: 에스크로 상태머신 + 예약 + 수수료 + 신뢰온도
-- 모든 거래 쓰기는 SECURITY DEFINER 함수만 경유(직접 INSERT/UPDATE 권한 회수).
-- 함수는 search_path 고정으로 하이재킹 방지.

-- updated_at 자동 갱신 트리거 (P1 이월)
create or replace function touch_updated_at() returns trigger
  language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists transactions_touch on transactions;
create trigger transactions_touch before update on transactions
  for each row execute function touch_updated_at();

-- 거래 직접 쓰기 차단 (SELECT RLS는 유지). 이후 모든 쓰기는 함수 경유
revoke insert, update, delete on transactions from authenticated, anon;

-- 예약 lazy-expiry: 10분 지난 미결제 예약 해제 + 해당 pending 거래 취소
create or replace function release_stale_reservations() returns void
  language plpgsql security definer set search_path = public as $$
begin
  update transactions set status = 'cancelled'
    where status = 'pending_payment' and created_at < now() - interval '10 minutes';
  update listings set status = 'active', reserved_at = null
    where status = 'reserved' and reserved_at < now() - interval '10 minutes'
      and not exists (
        select 1 from transactions t
        where t.listing_id = listings.id
          and t.status not in ('pending_payment','cancelled'));
end $$;

-- 결제 시작: 예약 선점(조건부 update로 경합 차단) + 거래 생성 + 수수료 계산
create or replace function start_transaction(p_listing_id uuid, p_intl_shipping_fee int default 0)
  returns transactions language plpgsql security definer set search_path = public as $$
declare
  v_l listings;
  v_uid uuid := auth.uid();
  v_buyer_country country_code;
  v_cross boolean;
  v_center center_code;
  v_tx transactions;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  if coalesce(p_intl_shipping_fee, 0) < 0 then raise exception 'invalid shipping fee'; end if;
  perform release_stale_reservations();

  select * into v_l from listings where id = p_listing_id;
  if v_l is null then raise exception 'listing not found'; end if;
  if v_l.seller_id = v_uid then raise exception 'cannot buy own listing'; end if;

  select country into v_buyer_country from profiles where id = v_uid;
  v_cross := v_l.cross_border_enabled and v_l.country <> v_buyer_country;
  if v_cross then
    v_center := case v_l.country when 'JP' then 'NARITA'::center_code else 'SEOUL'::center_code end;
  else
    v_center := null;
  end if;

  -- 조건부 예약 선점: active 상태에서만 성공 (동시 결제 경합 차단)
  update listings set status = 'reserved', reserved_at = now()
    where id = p_listing_id and status = 'active';
  if not found then raise exception 'listing not available'; end if;

  insert into transactions (
    listing_id, buyer_id, seller_id, status, is_cross_border, center,
    item_price, intl_shipping_fee, platform_fee, currency)
  values (
    p_listing_id, v_uid, v_l.seller_id, 'pending_payment', v_cross, v_center,
    v_l.price, coalesce(p_intl_shipping_fee, 0), floor(v_l.price * 0.10)::int, v_l.currency)
  returning * into v_tx;

  return v_tx;
end $$;

-- 결제 시작 후 Stripe PaymentIntent id 연결 (구매자·pending 한정)
create or replace function attach_payment_intent(p_tx_id uuid, p_payment_intent_id text)
  returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  update transactions set stripe_payment_intent_id = p_payment_intent_id
    where id = p_tx_id and buyer_id = v_uid and status = 'pending_payment';
  if not found then raise exception 'cannot attach payment intent'; end if;
end $$;

-- 상태 전이: (from, to, 주체, 경로) 4중 검증 + 낙관적 잠금
create or replace function advance_transaction(p_tx_id uuid, p_to tx_status, p_tracking text default null)
  returns transactions language plpgsql security definer set search_path = public as $$
declare
  v_t transactions;
  v_uid uuid := auth.uid();
  v_admin boolean := false;
  v_role text;
  v_from tx_status;
  v_ok boolean := false;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  select * into v_t from transactions where id = p_tx_id;
  if v_t is null then raise exception 'tx not found'; end if;
  select is_admin into v_admin from profiles where id = v_uid;

  v_role := case
    when v_uid = v_t.buyer_id then 'buyer'
    when v_uid = v_t.seller_id then 'seller'
    when v_admin then 'admin'
    else null end;
  if v_role is null then raise exception 'not authorized for this transaction'; end if;

  v_from := v_t.status;

  if not v_t.is_cross_border then
    v_ok :=
         (v_from = 'paid'      and p_to = 'shipped'   and v_role = 'seller')
      or (v_from = 'shipped'   and p_to = 'delivered' and v_role = 'buyer')
      or (v_from = 'delivered' and p_to = 'completed' and v_role = 'buyer');
  else
    v_ok :=
         (v_from = 'paid'                 and p_to = 'shipped_to_center'      and v_role = 'seller')
      or (v_from = 'shipped_to_center'    and p_to = 'center_received'        and v_role = 'admin')
      or (v_from = 'center_received'      and p_to = 'shipped_international'   and v_role = 'admin')
      or (v_from = 'shipped_international' and p_to = 'delivered'             and v_role = 'buyer')
      or (v_from = 'delivered'            and p_to = 'completed'             and v_role = 'buyer');
  end if;

  -- 공통 이탈: 미결제 취소(구매자/판매자), 결제후 분쟁 플래그(당사자)
  v_ok := v_ok
    or (v_from = 'pending_payment' and p_to = 'cancelled' and v_role in ('buyer','seller'))
    or (v_from = 'paid'            and p_to = 'disputed'  and v_role in ('buyer','seller'));

  if not v_ok then
    raise exception 'illegal transition % -> % by %', v_from, p_to, v_role;
  end if;

  -- 전이 (낙관적 잠금: 그 사이 상태 변경 시 실패)
  update transactions set
    status = p_to,
    domestic_tracking = case when p_to in ('shipped','shipped_to_center')
      then coalesce(p_tracking, domestic_tracking) else domestic_tracking end,
    intl_tracking = case when p_to = 'shipped_international'
      then coalesce(p_tracking, intl_tracking) else intl_tracking end
    where id = p_tx_id and status = v_from
    returning * into v_t;
  if not found then raise exception 'state changed concurrently'; end if;

  -- 취소 시 상품 예약 해제
  if p_to = 'cancelled' then
    update listings set status = 'active', reserved_at = null
      where id = v_t.listing_id and status = 'reserved';
  end if;

  return v_t;
end $$;

-- webhook 전용 결제확정 (멱등): pending_payment -> paid + listing sold
create or replace function mark_paid(p_payment_intent_id text)
  returns void language plpgsql security definer set search_path = public as $$
begin
  update transactions set status = 'paid'
    where stripe_payment_intent_id = p_payment_intent_id and status = 'pending_payment';
  update listings l set status = 'sold'
    from transactions t
    where t.listing_id = l.id
      and t.stripe_payment_intent_id = p_payment_intent_id
      and t.status = 'paid';
end $$;

-- 후기 + 신뢰온도 (completed 거래·당사자만, 상대에게 반영; 5:+0.5 4:+0.3 3:+0.1 1~2:-0.5)
create or replace function submit_review(p_tx_id uuid, p_rating int, p_comment text default '')
  returns reviews language plpgsql security definer set search_path = public as $$
declare
  v_t transactions;
  v_uid uuid := auth.uid();
  v_target uuid;
  v_delta numeric;
  v_r reviews;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'invalid rating'; end if;
  select * into v_t from transactions where id = p_tx_id;
  if v_t is null or v_uid not in (v_t.buyer_id, v_t.seller_id) then
    raise exception 'not a party';
  end if;
  if v_t.status <> 'completed' then raise exception 'tx not completed'; end if;

  v_target := case when v_uid = v_t.buyer_id then v_t.seller_id else v_t.buyer_id end;
  v_delta := case p_rating when 5 then 0.5 when 4 then 0.3 when 3 then 0.1 else -0.5 end;

  insert into reviews (transaction_id, reviewer_id, rating, comment)
    values (p_tx_id, v_uid, p_rating, coalesce(p_comment, ''))
    returning * into v_r;  -- unique(transaction_id, reviewer_id)가 중복 후기 차단

  update profiles set trust_temp = greatest(0, least(99, trust_temp + v_delta))
    where id = v_target;

  return v_r;
end $$;

-- 실행 권한: 사용자 호출 함수만 authenticated에 부여.
-- mark_paid / release_stale_reservations 는 미부여 (service_role·정의자 내부 전용)
grant execute on function start_transaction(uuid, int) to authenticated;
grant execute on function attach_payment_intent(uuid, text) to authenticated;
grant execute on function advance_transaction(uuid, tx_status, text) to authenticated;
grant execute on function submit_review(uuid, int, text) to authenticated;
revoke execute on function mark_paid(text) from authenticated, anon;
revoke execute on function release_stale_reservations() from authenticated, anon;
