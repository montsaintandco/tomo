-- 0047 경매 낙찰 결제·미결제·경고·재등록 (U2, 설계 docs/aaa/14-auction.md A-3·A-4, 0046 뒤)
-- 1) start_auction_transaction: 낙찰자가 「결제하기」를 누를 때 기존 45분 거래(pending_payment)를 낙찰가로 연다.
--    국제배송비(8000원/900엔)·수수료(floor 10%)·센터 판정은 start_transaction(0035/0046)과 같다. 주문 번호는 기존 TX 기본값.
--    pay_due_at(마감 + 48시간) 전까지 여러 번 열 수 있다. 결제창이 만료돼 거래가 취소돼도 상품은 낙찰자 앞으로 reserved(0046 가드).
-- 2) 거래가 paid 가 되면 경매를 paid 로 닫는다(transactions AFTER 트리거, notify_transaction 은 그대로).
-- 3) settle_unpaid_auctions: 결제 기한 24시간·6시간 전 알림, pay_due_at + 45분 뒤 미결제 확정(마지막 결제창이 끝난 뒤).
--    경고 auction_strikes. 해제 안 된 경고가 90일 안 2회면 30일 입찰 제한, 통산 3회면 입찰 정지(bid_banned_until = infinity, 운영자가 푼다).
-- 4) relist_auction(같은 설정으로 다시 경매) / convert_to_fixed(일반 판매로 전환): 유찰·미결제·판매자 취소(·결제 뒤 환불로 상품이 돌아온) 경매.
-- 5) cron_auctions(0046) 를 마감 + 미결제 처리로 바꾼다(같은 크론 tomo_auctions).
-- 알림 kind: auction_pay_reminder, auction_unpaid(낙찰자), auction_unpaid_seller(판매자)
begin;

-- ── 1. 경고 ──
create table if not exists auction_strikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  auction_id uuid references auctions(id) on delete set null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references profiles(id),
  note text
);
create index if not exists auction_strikes_user on auction_strikes (user_id, created_at desc);
alter table auction_strikes enable row level security;
drop policy if exists "own or admin strikes" on auction_strikes;
create policy "own or admin strikes" on auction_strikes for select using (user_id = auth.uid() or is_admin_user());
revoke all on auction_strikes from anon, authenticated;
grant select on auction_strikes to authenticated;

-- ── 2. 낙찰 거래 열기 ──
create or replace function start_auction_transaction(p_auction uuid) returns transactions
  language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_a auctions; v_l listings; v_tx transactions; v_country country_code;
  v_cross boolean; v_center center_code;
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
  insert into transactions (listing_id, buyer_id, seller_id, status, is_cross_border, center, meetup,
      item_price, intl_shipping_fee, platform_fee, currency)
    values (v_a.listing_id, v_uid, v_a.seller_id, 'pending_payment', v_cross, v_center, false,
      v_a.final_price,
      case when v_cross then (case when v_a.currency = 'KRW' then 8000 else 900 end) else 0 end,
      floor(v_a.final_price * 0.10)::int, v_a.currency)
    returning * into v_tx;

  perform set_config('tomo.auction', '1', true);
  update listings set reserved_at = now() where id = v_a.listing_id;
  update auctions set tx_id = v_tx.id where id = p_auction;
  perform set_config('tomo.auction', '', true);
  return v_tx;
end $$;
revoke all on function start_auction_transaction(uuid) from public, anon;
grant execute on function start_auction_transaction(uuid) to authenticated;

-- ── 3. 결제 완료 → 경매 paid ──
create or replace function auction_on_tx_paid() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status = 'pending_payment' then
    update auctions set status = 'paid', paid_at = now(), tx_id = new.id
      where listing_id = new.listing_id and status = 'awaiting_payment' and winner_id = new.buyer_id;
  end if;
  return null;
end $$;
revoke all on function auction_on_tx_paid() from public, anon, authenticated;
drop trigger if exists transactions_auction_paid on transactions;
create trigger transactions_auction_paid after update of status on transactions
  for each row execute function auction_on_tx_paid();

-- ── 4. 결제 알림·미결제 확정 ──
create or replace function settle_unpaid_auctions() returns jsonb
  language plpgsql security definer set search_path = public as $$
declare r record; v_a auctions; v_r6 int := 0; v_r24 int := 0; v_unpaid int := 0; v_fail jsonb := '[]'::jsonb;
  v_90 int; v_all int; v_ban timestamptz;
begin
  perform release_stale_reservations();   -- 45분 지난 결제 대기 거래를 먼저 닫는다

  for r in select id from auctions where status = 'awaiting_payment' and remind6_at is null
      and pay_due_at > now() and pay_due_at <= now() + interval '6 hours' limit 200 for update skip locked loop
    update auctions set remind6_at = now(), remind24_at = coalesce(remind24_at, now()) where id = r.id returning * into v_a;
    perform auction_notify(v_a.winner_id, 'auction_pay_reminder', v_a, jsonb_build_object('pay_due_at', v_a.pay_due_at, 'hours', 6));
    v_r6 := v_r6 + 1;
  end loop;
  for r in select id from auctions where status = 'awaiting_payment' and remind24_at is null
      and pay_due_at > now() and pay_due_at <= now() + interval '24 hours' limit 200 for update skip locked loop
    update auctions set remind24_at = now() where id = r.id returning * into v_a;
    perform auction_notify(v_a.winner_id, 'auction_pay_reminder', v_a, jsonb_build_object('pay_due_at', v_a.pay_due_at, 'hours', 24));
    v_r24 := v_r24 + 1;
  end loop;

  for r in select id from auctions where status = 'awaiting_payment' and pay_due_at + interval '45 minutes' <= now()
      order by pay_due_at limit 200 for update skip locked loop
    begin
      select * into v_a from auctions where id = r.id;
      -- 결제됐는데 트리거가 못 닫은 경우(안전망)
      if exists (select 1 from transactions t where t.listing_id = v_a.listing_id and t.buyer_id = v_a.winner_id
                 and t.created_at >= v_a.closed_at and t.status not in ('pending_payment', 'cancelled')) then
        update auctions set status = 'paid', paid_at = coalesce(paid_at, now()) where id = r.id and status = 'awaiting_payment';
        continue;
      end if;
      -- 아직 열린 결제창(45분 안)이 있으면 다음 회차로
      if exists (select 1 from transactions t where t.listing_id = v_a.listing_id and t.status = 'pending_payment') then continue; end if;

      perform set_config('tomo.auction', '1', true);
      update auctions set status = 'unpaid' where id = r.id and status = 'awaiting_payment' returning * into v_a;
      if found then
        insert into auction_strikes (user_id, auction_id) values (v_a.winner_id, v_a.id);
        select count(*) filter (where created_at > now() - interval '90 days'), count(*) into v_90, v_all
          from auction_strikes where user_id = v_a.winner_id and lifted_at is null;
        if v_all >= 3 then
          update profiles set bid_banned_until = 'infinity' where id = v_a.winner_id returning bid_banned_until into v_ban;
        elsif v_90 >= 2 then
          update profiles set bid_banned_until = greatest(coalesce(bid_banned_until, now()), now() + interval '30 days')
            where id = v_a.winner_id returning bid_banned_until into v_ban;
        else
          v_ban := null;
        end if;
        update listings set status = 'active', reserved_at = null, hidden = true where id = v_a.listing_id and status = 'reserved';
        perform auction_notify(v_a.winner_id, 'auction_unpaid', v_a,
          jsonb_build_object('strikes', v_all, 'bid_banned_until', v_ban));
        perform auction_notify(v_a.seller_id, 'auction_unpaid_seller', v_a);
        v_unpaid := v_unpaid + 1;
      end if;
      perform set_config('tomo.auction', '', true);
    exception when others then
      perform set_config('tomo.auction', '', true);
      v_fail := v_fail || jsonb_build_object('id', r.id, 'error', left(sqlerrm, 200));
    end;
  end loop;
  return jsonb_build_object('remind6', v_r6, 'remind24', v_r24, 'unpaid', v_unpaid, 'failed', v_fail);
end $$;
revoke all on function settle_unpaid_auctions() from public, anon, authenticated;

create or replace function cron_auctions() returns jsonb
  language plpgsql security definer set search_path = public as $$
declare v jsonb; w jsonb;
begin
  v := close_due_auctions();
  w := settle_unpaid_auctions();
  v := v || jsonb_build_object('remind6', w->'remind6', 'remind24', w->'remind24', 'unpaid', w->'unpaid',
    'failed', (v->'failed') || (w->'failed'));
  insert into cron_runs (job, ok, detail) values ('auctions', jsonb_array_length(v->'failed') = 0, v);
  return v;
exception when others then
  insert into cron_runs (job, ok, detail) values ('auctions', false, jsonb_build_object('error', left(sqlerrm, 300)));
  return null;
end $$;
revoke all on function cron_auctions() from public, anon, authenticated;

-- ── 5. 판매자 선택: 다시 경매 / 일반 판매 전환 ──
-- 대상: 유찰(unsold)·미결제(unpaid)·판매자 취소(cancelled), 그리고 결제 뒤 환불로 상품이 판매중으로 돌아온 paid
create or replace function auction_relistable(p_a auctions, p_l listings) returns boolean
  language sql stable set search_path = public as $$
  select (p_a.status in ('unsold', 'unpaid', 'cancelled') or (p_a.status = 'paid' and p_l.status = 'active'))
    and p_l.status = 'active' and not p_l.hidden_by_admin and p_l.sale_type = 'auction'
    and not exists (select 1 from auctions x where x.listing_id = p_a.listing_id and x.status in ('live', 'awaiting_payment'))
    and not exists (select 1 from transactions t where t.listing_id = p_a.listing_id and t.status not in ('completed', 'cancelled'))
$$;
revoke all on function auction_relistable(auctions, listings) from public, anon, authenticated;

create or replace function relist_auction(p_auction uuid) returns auctions
  language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_a auctions; v_l listings; v_new auctions; v_s auction_settings; v_now timestamptz := clock_timestamp();
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  if is_suspended() then raise exception 'suspended'; end if;
  select * into v_a from auctions where id = p_auction for update;
  if v_a.id is null or v_a.seller_id <> v_uid then raise exception 'not seller'; end if;
  select * into v_l from listings where id = v_a.listing_id for update;
  if not auction_relistable(v_a, v_l) then raise exception 'auction not relistable'; end if;
  -- 같은 상품의 가장 최근 경매만 다시 올린다
  if exists (select 1 from auctions x where x.listing_id = v_a.listing_id and x.created_at > v_a.created_at) then
    raise exception 'auction not relistable';
  end if;
  select * into v_s from auction_settings;
  if (select count(*) from auctions where seller_id = v_uid and status = 'live') >= v_s.max_live_per_seller then
    raise exception 'too many live auctions';
  end if;
  perform set_config('tomo.auction', '1', true);
  update listings set hidden = true, price = v_a.start_price, reserved_at = null where id = v_l.id;   -- 숨긴 채 가격(값내림 알림 방지)
  update listings set hidden = false where id = v_l.id;
  insert into auctions (listing_id, seller_id, currency, start_price, current_price, duration_days, ends_at, original_ends_at, relist_of)
    values (v_l.id, v_uid, v_a.currency, v_a.start_price, v_a.start_price, v_a.duration_days,
      auction_ends_at(v_now, v_a.duration_days), auction_ends_at(v_now, v_a.duration_days), v_a.id)
    returning * into v_new;
  perform set_config('tomo.auction', '', true);
  return v_new;
end $$;

create or replace function convert_to_fixed(p_auction uuid, p_price int) returns listings
  language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_a auctions; v_l listings;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  select * into v_a from auctions where id = p_auction for update;
  if v_a.id is null or v_a.seller_id <> v_uid then raise exception 'not seller'; end if;
  select * into v_l from listings where id = v_a.listing_id for update;
  if not auction_relistable(v_a, v_l) then raise exception 'auction not relistable'; end if;
  if p_price is null or p_price <= 0 or p_price > 100000000 then raise exception 'invalid price'; end if;
  perform set_config('tomo.auction', '1', true);
  update listings set sale_type = 'fixed', hidden = true, price = p_price, reserved_at = null where id = v_l.id;
  update listings set hidden = false where id = v_l.id returning * into v_l;
  perform set_config('tomo.auction', '', true);
  return v_l;
end $$;

revoke all on function relist_auction(uuid) from public, anon;
revoke all on function convert_to_fixed(uuid, int) from public, anon;
grant execute on function relist_auction(uuid) to authenticated;
grant execute on function convert_to_fixed(uuid, int) to authenticated;

commit;

-- ── 되돌리기(0046 보다 먼저) ──
-- drop function if exists convert_to_fixed(uuid, int); drop function if exists relist_auction(uuid);
-- drop function if exists auction_relistable(auctions, listings);
-- cron_auctions: 0046 정의 다시 실행. drop function if exists settle_unpaid_auctions();
-- drop trigger if exists transactions_auction_paid on transactions; drop function if exists auction_on_tx_paid();
-- drop function if exists start_auction_transaction(uuid); drop table if exists auction_strikes;
