-- 0046 자체 상품 경매 — DB 핵심 (U1, 설계 docs/aaa/14-auction.md A절·C절, Ren 승인 2026-11-27 기본값 전부)
-- 확정값: 상한가 입찰 한 가지(대리 입찰), 마감 5분 안에 현재가가 오르면 그 시각 + 5분, 최저 낙찰가·즉시구매 없음,
--         택배만, 수수료 낙찰가 10%(기존 start_transaction 규칙), 입찰 단계에서 돈은 움직이지 않는다.
-- 1) listings.sale_type('fixed'|'auction'), profiles.bid_banned_until(입찰 제한 종료 시각, 열 권한상 남에게 안 보임)
-- 2) auction_settings(한 행: 연장 분·결제 기한·동시 경매 수·신규 한도·기간·단위표), auctions, auction_bids(기록),
--    auction_max_bids(상한가, 본인만 읽기), auction_bid_requests(멱등, 아무도 못 읽음)
-- 3) 함수: create_auction, place_bid, cancel_auction, auction_state(폴링용), my_auction_bids, close_due_auctions, cron_auctions
-- 4) 기존 가드: start_transaction(경매 상품 거절), release_stale_reservations(낙찰 대기 예약 유지), bump_listing(경매 거절),
--    offers(경매 상품 제안 거절, RESTRICTIVE 정책), listings 경매 잠금 트리거(가격·통화·거래 방법·제안·상태는 경매 함수만)
-- 5) 알림 kind: auction_first_bid, auction_outbid, auction_ending, auction_won, auction_lost, auction_sold, auction_unsold
--    (notify_transaction·notify_proxy(0042)·notify_listing_hold(0044)는 건드리지 않는다. 경매 함수 안에서 notify() 를 직접 부른다)
-- 6) pg_cron tomo_auctions 1분 → cron_auctions() (cron_runs 기록, 모든 전이는 where status = 이전 상태 → 멱등)
-- 경매 함수만 listings 잠금을 통과한다: set_config('tomo.auction','1',true) 를 켜고 끝나기 전에 '' 로 되돌린다.
begin;

-- ── 1. 칸 ──
alter table listings add column if not exists sale_type text not null default 'fixed';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'listings_sale_type_check') then
    alter table listings add constraint listings_sale_type_check check (sale_type in ('fixed', 'auction'));
  end if;
end $$;
alter table profiles add column if not exists bid_banned_until timestamptz;

-- ── 2. 설정(한 행) ──
-- rules 는 lib/auction.ts AUCTION_RULES 와 글자 그대로 같아야 한다(tests/unit/auction.test.ts 가 이 줄을 읽어 비교).
-- increments: [미만 금액, 단위] 순서, 마지막 null = 그 이상. unit = 금액 최소 단위, min_start = 시작가 하한, max_bid = 입찰 상한
create table if not exists auction_settings (
  id boolean primary key default true check (id),
  extend_minutes int not null default 5,
  pay_hours int not null default 48,
  max_live_per_seller int not null default 10,
  new_bidder_limit int not null default 3,
  durations int[] not null default '{1,3,5,7}',
  rules jsonb not null default
    -- @auction-rules
    '{"increments":{"KRW":[[10000,100],[50000,1000],[100000,2000],[500000,5000],[null,10000]],"JPY":[[1000,10],[5000,100],[10000,250],[50000,500],[null,1000]]},"unit":{"KRW":100,"JPY":10},"min_start":{"KRW":1000,"JPY":100},"max_bid":{"KRW":100000000,"JPY":10000000}}',
  updated_at timestamptz not null default now()
);
insert into auction_settings (id) values (true) on conflict do nothing;
alter table auction_settings enable row level security;
drop policy if exists "auction settings are public" on auction_settings;
create policy "auction settings are public" on auction_settings for select using (true);
revoke all on auction_settings from anon, authenticated;
grant select on auction_settings to anon, authenticated;

-- ── 3. 표 ──
create sequence if not exists auction_code_seq;
create table if not exists auctions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default order_code('AU', nextval('auction_code_seq')),
  listing_id uuid not null references listings(id) on delete cascade,
  seller_id uuid not null references profiles(id),
  currency currency_code not null,
  start_price int not null check (start_price > 0),
  current_price int not null,
  duration_days int not null,
  bid_count int not null default 0,
  bidder_count int not null default 0,
  leader_id uuid references profiles(id),
  ends_at timestamptz not null,
  original_ends_at timestamptz not null,
  extended_count int not null default 0,
  status text not null default 'live'
    check (status in ('live', 'awaiting_payment', 'paid', 'unsold', 'unpaid', 'cancelled')),
  winner_id uuid references profiles(id),
  final_price int,
  pay_due_at timestamptz,
  closed_at timestamptz,
  paid_at timestamptz,
  tx_id uuid references transactions(id),
  relist_of uuid references auctions(id),
  ending_notified_at timestamptz,
  remind24_at timestamptz,
  remind6_at timestamptz,
  created_at timestamptz not null default clock_timestamp()   -- 같은 트랜잭션의 취소·재등록도 순서가 갈린다
);
alter sequence auction_code_seq owned by auctions.code;
-- 한 상품에 열린 경매(진행·결제 대기)는 하나. 다시 경매는 새 행(relist_of)
create unique index if not exists auctions_open_listing on auctions (listing_id) where status in ('live', 'awaiting_payment');
create index if not exists auctions_live_ends on auctions (ends_at) where status = 'live';
create index if not exists auctions_pay_due on auctions (pay_due_at) where status = 'awaiting_payment';
create index if not exists auctions_seller on auctions (seller_id, status);
create index if not exists auctions_listing on auctions (listing_id, created_at desc);

alter table auctions enable row level security;
drop policy if exists "auctions are public" on auctions;
create policy "auctions are public" on auctions for select using (true);
-- leader_id·winner_id·tx_id·알림 표시 칸은 열 권한에서 뺀다(「나인지」는 auction_state 가 돌려준다)
revoke all on auctions from anon, authenticated;
grant select (id, code, listing_id, seller_id, currency, start_price, current_price, duration_days, bid_count, bidder_count,
  ends_at, original_ends_at, extended_count, status, final_price, pay_due_at, closed_at, paid_at, relist_of, created_at)
  on auctions to anon, authenticated;

create table if not exists auction_bids (
  id bigint generated always as identity primary key,
  auction_id uuid not null references auctions(id) on delete cascade,
  bidder_id uuid not null references profiles(id),
  amount int not null,                       -- 그 입찰 뒤 현재가
  kind text not null check (kind in ('direct', 'auto')),
  voided_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists auction_bids_auction on auction_bids (auction_id, id desc);
create index if not exists auction_bids_bidder on auction_bids (bidder_id);
alter table auction_bids enable row level security;
drop policy if exists "admin reads auction bids" on auction_bids;
create policy "admin reads auction bids" on auction_bids for select using (is_admin_user());
revoke all on auction_bids from anon, authenticated;
grant select on auction_bids to authenticated;

create table if not exists auction_max_bids (
  auction_id uuid not null references auctions(id) on delete cascade,
  bidder_id uuid not null references profiles(id),
  max_amount int not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (auction_id, bidder_id)
);
create index if not exists auction_max_bids_bidder on auction_max_bids (bidder_id);
alter table auction_max_bids enable row level security;
drop policy if exists "own max bid" on auction_max_bids;
create policy "own max bid" on auction_max_bids for select using (bidder_id = auth.uid());
revoke all on auction_max_bids from anon, authenticated;
grant select on auction_max_bids to authenticated;

create table if not exists auction_bid_requests (
  auction_id uuid not null references auctions(id) on delete cascade,
  bidder_id uuid not null references profiles(id),
  request_id text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (auction_id, bidder_id, request_id)
);
alter table auction_bid_requests enable row level security;
revoke all on auction_bid_requests from anon, authenticated;

-- ── 4. 계산 도우미 ──
create or replace function auction_increment(p_cur currency_code, p_price int) returns int
  language sql stable set search_path = public as $$
  select (e->>1)::int
  from auction_settings s, jsonb_array_elements(s.rules->'increments'->(p_cur::text)) with ordinality x(e, n)
  where e->>0 is null or p_price < (e->>0)::int
  order by n limit 1
$$;

create or replace function auction_amount_ok(p_cur currency_code, p_amount int, p_start boolean) returns boolean
  language sql stable set search_path = public as $$
  select p_amount is not null and p_amount > 0
    and p_amount % (s.rules->'unit'->>(p_cur::text))::int = 0
    and p_amount <= (s.rules->'max_bid'->>(p_cur::text))::int
    and (not p_start or p_amount >= (s.rules->'min_start'->>(p_cur::text))::int)
  from auction_settings s
$$;

-- 마감 = 시작 + 기간, 10분 단위 올림
create or replace function auction_ends_at(p_from timestamptz, p_days int) returns timestamptz
  language sql immutable as $$
  select to_timestamp(ceil(extract(epoch from p_from + make_interval(days => p_days)) / 600) * 600)
$$;

-- 경매 알림 공통 data
create or replace function auction_notify(p_user uuid, p_kind text, p_a auctions, p_extra jsonb default '{}')
  returns void language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  select title into v_title from listings where id = p_a.listing_id;
  perform notify(p_user, p_kind, 'auction', p_a.id::text,
    jsonb_build_object('title', coalesce(v_title, ''), 'listing_id', p_a.listing_id, 'auction_id', p_a.id, 'code', p_a.code,
      'price', p_a.current_price, 'currency', p_a.currency) || coalesce(p_extra, '{}'::jsonb));
end $$;

revoke all on function auction_increment(currency_code, int) from public, anon, authenticated;
revoke all on function auction_amount_ok(currency_code, int, boolean) from public, anon, authenticated;
revoke all on function auction_ends_at(timestamptz, int) from public, anon, authenticated;
revoke all on function auction_notify(uuid, text, auctions, jsonb) from public, anon, authenticated;
grant execute on function auction_increment(currency_code, int) to anon, authenticated;

-- ── 5. 상품 잠금 트리거(경매 상품은 경매 함수만 바꾼다) ──
create or replace function guard_auction_listing() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_open text;
begin
  if coalesce(current_setting('tomo.auction', true), '') = '1' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' then
    if new.sale_type <> 'fixed' then raise exception 'auction listing locked'; end if;
    return new;
  end if;
  select status into v_open from auctions where listing_id = old.id and status in ('live', 'awaiting_payment');
  if tg_op = 'DELETE' then
    if v_open is not null then raise exception 'auction in progress'; end if;
    return old;
  end if;
  if new.sale_type is distinct from old.sale_type then raise exception 'auction listing locked'; end if;
  if old.sale_type <> 'auction' then return new; end if;
  if new.price is distinct from old.price or new.currency is distinct from old.currency
     or new.trade_method is distinct from old.trade_method or new.allow_offers is distinct from old.allow_offers then
    raise exception 'auction listing locked';
  end if;
  if v_open is not null then
    if new.cross_border_enabled is distinct from old.cross_border_enabled then raise exception 'auction listing locked'; end if;
    if new.status is distinct from old.status then
      if old.status = 'reserved' and new.status = 'sold'
         and exists (select 1 from transactions t where t.listing_id = old.id and t.status = 'paid') then
        null;                                             -- 결제 완료(mark_tx_paid)
      elsif v_open = 'awaiting_payment' and old.status = 'reserved' and new.status = 'active' then
        new.status := 'reserved';                         -- 결제창 만료·거래 취소가 낙찰자 예약을 풀지 않게
        new.reserved_at := old.reserved_at;
      else
        raise exception 'auction listing locked';
      end if;
    end if;
    if new.hidden and not old.hidden and not is_admin_user() then raise exception 'auction listing locked'; end if;
  end if;
  return new;
end $$;
revoke all on function guard_auction_listing() from public, anon, authenticated;
drop trigger if exists listings_auction_guard on listings;
create trigger listings_auction_guard before insert or update or delete on listings
  for each row execute function guard_auction_listing();

-- ── 6. 등록·취소 ──
create or replace function create_auction(p_listing uuid, p_start_price int, p_days int) returns auctions
  language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_l listings; v_s auction_settings; v_a auctions; v_now timestamptz := clock_timestamp();
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  if is_suspended() then raise exception 'suspended'; end if;
  select * into v_s from auction_settings;
  select * into v_l from listings where id = p_listing for update;
  if v_l.id is null or v_l.seller_id <> v_uid then raise exception 'not seller'; end if;
  if v_l.status <> 'active' or v_l.hidden_by_admin then raise exception 'listing not available'; end if;
  if exists (select 1 from auctions where listing_id = p_listing and status in ('live', 'awaiting_payment')) then
    raise exception 'auction already open';
  end if;
  if exists (select 1 from transactions where listing_id = p_listing and status not in ('completed', 'cancelled')) then
    raise exception 'listing has active transaction';
  end if;
  if exists (select 1 from offers where listing_id = p_listing and status = 'pending') then raise exception 'listing has pending offers'; end if;
  if p_days is null or not (p_days = any (v_s.durations)) then raise exception 'invalid duration'; end if;
  if not coalesce(auction_amount_ok(v_l.currency, p_start_price, true), false) then raise exception 'invalid start price'; end if;
  if (select count(*) from auctions where seller_id = v_uid and status = 'live') >= v_s.max_live_per_seller then
    raise exception 'too many live auctions';
  end if;

  perform set_config('tomo.auction', '1', true);
  -- 숨긴 채 가격을 바꾼 뒤 공개한다(찜 값내림 알림 0027 이 시작가를 값내림으로 보지 않게)
  update listings set sale_type = 'auction', trade_method = 'shipping', allow_offers = false, hidden = true,
      price = p_start_price, reserved_at = null
    where id = p_listing;
  update listings set hidden = false where id = p_listing;
  insert into auctions (listing_id, seller_id, currency, start_price, current_price, duration_days, ends_at, original_ends_at)
    values (p_listing, v_uid, v_l.currency, p_start_price, p_start_price, p_days,
      auction_ends_at(v_now, p_days), auction_ends_at(v_now, p_days))
    returning * into v_a;
  perform set_config('tomo.auction', '', true);
  return v_a;
end $$;

-- 판매자 취소: 입찰 0건일 때만. 상품은 숨김(판매자가 고쳐서 다시 경매/일반 판매)
create or replace function cancel_auction(p_auction uuid) returns auctions
  language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_a auctions;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  select * into v_a from auctions where id = p_auction for update;
  if v_a.id is null or v_a.seller_id <> v_uid then raise exception 'not seller'; end if;
  if v_a.status <> 'live' then raise exception 'auction not live'; end if;
  if v_a.bid_count > 0 then raise exception 'auction has bids'; end if;
  perform set_config('tomo.auction', '1', true);
  update auctions set status = 'cancelled', closed_at = now() where id = p_auction and status = 'live' returning * into v_a;
  update listings set hidden = true where id = v_a.listing_id;
  perform set_config('tomo.auction', '', true);
  return v_a;
end $$;

-- ── 7. 입찰 ──
-- 한 경매의 입찰은 auctions 행 잠금으로 한 줄로 선다. 잠금을 얻은 뒤 clock_timestamp() 로 마감을 다시 본다.
-- 현재가 = min(1등 상한, 2등 상한 + 단위). 같은 금액이면 먼저 넣은 사람(기존 1등)이 이긴다.
create or replace function place_bid(p_auction uuid, p_amount int, p_request_id text default null) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_a auctions; v_l listings; v_s auction_settings; v_now timestamptz; v_prev jsonb;
  v_country country_code; v_lead_max int; v_old_price int; v_old_leader uuid; v_new_price int; v_new_leader uuid;
  v_extended boolean := false; v_ends timestamptz; v_res jsonb; v_first boolean;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  if p_request_id is not null and (length(p_request_id) = 0 or length(p_request_id) > 64) then raise exception 'invalid request id'; end if;
  select * into v_a from auctions where id = p_auction for update;
  if v_a.id is null then raise exception 'auction not found'; end if;
  -- 멱등: 같은 요청 번호는 처음 결과 그대로(잠금 뒤에 봐야 동시에 온 같은 요청 둘이 둘 다 통과하지 않는다)
  if p_request_id is not null then
    select result into v_prev from auction_bid_requests
      where auction_id = p_auction and bidder_id = v_uid and request_id = p_request_id;
    if found then return v_prev || jsonb_build_object('replayed', true); end if;
  end if;
  v_now := clock_timestamp();
  if v_a.status <> 'live' or v_now >= v_a.ends_at then raise exception 'auction ended'; end if;
  if v_a.seller_id = v_uid then raise exception 'cannot bid own auction'; end if;
  if is_suspended() then raise exception 'suspended'; end if;
  if exists (select 1 from profiles where id = v_uid and bid_banned_until > v_now) then raise exception 'bid restricted'; end if;
  if blocked_with(v_a.seller_id) then raise exception 'blocked'; end if;
  select * into v_l from listings where id = v_a.listing_id;
  select country into v_country from profiles where id = v_uid;
  if v_country is null then raise exception 'profile required'; end if;
  if v_country <> v_l.country and not v_l.cross_border_enabled then raise exception 'country not allowed'; end if;
  if not coalesce(auction_amount_ok(v_a.currency, p_amount, false), false) then raise exception 'invalid amount'; end if;
  select * into v_s from auction_settings;
  if not exists (select 1 from transactions where buyer_id = v_uid and status = 'completed')
     and not exists (select 1 from auction_max_bids where auction_id = p_auction and bidder_id = v_uid)
     and (select count(*) from auction_max_bids m join auctions x on x.id = m.auction_id
          where m.bidder_id = v_uid and x.status = 'live') >= v_s.new_bidder_limit then
    raise exception 'new bidder limit';
  end if;

  v_old_price := v_a.current_price; v_old_leader := v_a.leader_id; v_first := v_a.bid_count = 0;
  if v_a.leader_id is null then
    if p_amount < v_a.start_price then raise exception 'bid too low'; end if;
    v_new_leader := v_uid; v_new_price := v_a.start_price;
    insert into auction_bids (auction_id, bidder_id, amount, kind) values (p_auction, v_uid, v_new_price, 'direct');
  elsif v_a.leader_id = v_uid then
    -- 1등의 상한 올리기: 현재가·연장 변화 없음, 기록 줄 없음
    select max_amount into v_lead_max from auction_max_bids where auction_id = p_auction and bidder_id = v_uid;
    if p_amount <= v_lead_max then raise exception 'bid too low'; end if;
    v_new_leader := v_uid; v_new_price := v_old_price;
  else
    if p_amount < v_old_price + auction_increment(v_a.currency, v_old_price) then raise exception 'bid too low'; end if;
    select max_amount into v_lead_max from auction_max_bids where auction_id = p_auction and bidder_id = v_a.leader_id;
    if p_amount > v_lead_max then
      v_new_leader := v_uid;
      v_new_price := least(p_amount, v_lead_max + auction_increment(v_a.currency, v_lead_max));
      if v_lead_max > v_old_price then
        insert into auction_bids (auction_id, bidder_id, amount, kind) values (p_auction, v_a.leader_id, v_lead_max, 'auto');
      end if;
      insert into auction_bids (auction_id, bidder_id, amount, kind) values (p_auction, v_uid, v_new_price, 'direct');
    else
      v_new_leader := v_a.leader_id;
      v_new_price := least(v_lead_max, p_amount + auction_increment(v_a.currency, p_amount));
      insert into auction_bids (auction_id, bidder_id, amount, kind) values (p_auction, v_uid, p_amount, 'direct');
      insert into auction_bids (auction_id, bidder_id, amount, kind) values (p_auction, v_a.leader_id, v_new_price, 'auto');
    end if;
  end if;

  insert into auction_max_bids (auction_id, bidder_id, max_amount, created_at, updated_at)
    values (p_auction, v_uid, p_amount, v_now, v_now)
    on conflict (auction_id, bidder_id) do update set max_amount = excluded.max_amount, updated_at = excluded.updated_at;

  v_ends := v_a.ends_at;
  if (v_new_price > v_old_price or v_first) and v_a.ends_at - v_now <= make_interval(mins => v_s.extend_minutes) then
    v_extended := true;
    v_ends := v_now + make_interval(mins => v_s.extend_minutes);
  end if;

  update auctions set current_price = v_new_price, leader_id = v_new_leader, ends_at = v_ends,
      extended_count = extended_count + case when v_extended then 1 else 0 end,
      bid_count = (select count(*) from auction_bids where auction_id = p_auction and voided_at is null),
      bidder_count = (select count(*) from auction_max_bids where auction_id = p_auction)
    where id = p_auction returning * into v_a;
  if v_new_price <> v_old_price then
    perform set_config('tomo.auction', '1', true);
    update listings set price = v_new_price where id = v_a.listing_id;
    perform set_config('tomo.auction', '', true);
  end if;

  if v_first then perform auction_notify(v_a.seller_id, 'auction_first_bid', v_a); end if;
  if v_old_leader is not null and v_old_leader <> v_new_leader then
    -- 밀림 알림은 경매당 읽지 않은 것 하나로 합친다
    begin
      update notifications set created_at = now(),
          data = data || jsonb_build_object('price', v_a.current_price)
        where user_id = v_old_leader and kind = 'auction_outbid' and ref_id = p_auction::text and read_at is null;
      if not found then perform auction_notify(v_old_leader, 'auction_outbid', v_a); end if;
    exception when others then null;
    end;
  end if;

  v_res := jsonb_build_object('auction_id', v_a.id, 'leading', v_new_leader = v_uid, 'current_price', v_a.current_price,
    'my_max', p_amount, 'bid_count', v_a.bid_count, 'ends_at', v_a.ends_at, 'extended', v_extended,
    'min_bid', v_a.current_price + auction_increment(v_a.currency, v_a.current_price));
  if p_request_id is not null then
    insert into auction_bid_requests (auction_id, bidder_id, request_id, result) values (p_auction, v_uid, p_request_id, v_res);
  end if;
  return v_res;
end $$;

-- ── 8. 조회(폴링 GET 한 번에 필요한 것 전부) ──
-- p_id = 경매 id 또는 상품 id(상품이면 가장 최근 경매). 숨긴 상품은 판매자·입찰자·운영자만.
create or replace function auction_state(p_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_a auctions; v_hidden boolean; v_my_max int; v_no int; v_bids jsonb; v_ban timestamptz;
begin
  select * into v_a from auctions where id = p_id or listing_id = p_id
    order by (id = p_id) desc, (status in ('live', 'awaiting_payment')) desc, created_at desc limit 1;
  if v_a.id is null then return null; end if;
  select hidden into v_hidden from listings where id = v_a.listing_id;
  if v_uid is not null then
    select max_amount into v_my_max from auction_max_bids where auction_id = v_a.id and bidder_id = v_uid;
    select bid_banned_until into v_ban from profiles where id = v_uid;
  end if;
  if coalesce(v_hidden, true) and v_uid is distinct from v_a.seller_id and v_my_max is null and not is_admin_user() then
    return null;
  end if;
  with n as (
    select bidder_id, row_number() over (order by min(id)) as no from auction_bids where auction_id = v_a.id group by bidder_id
  ), b as (
    select * from auction_bids where auction_id = v_a.id and voided_at is null order by id desc limit 20
  )
  select coalesce(jsonb_agg(jsonb_build_object('no', n.no, 'amount', b.amount, 'kind', b.kind, 'at', b.created_at,
      'me', b.bidder_id = v_uid) order by b.id desc), '[]'::jsonb)
    into v_bids from b join n using (bidder_id);
  select no into v_no from (
    select bidder_id, row_number() over (order by min(id)) as no from auction_bids where auction_id = v_a.id group by bidder_id
  ) x where bidder_id = v_uid;
  return jsonb_build_object(
    'id', v_a.id, 'code', v_a.code, 'listing_id', v_a.listing_id, 'status', v_a.status, 'currency', v_a.currency,
    'start_price', v_a.start_price, 'current_price', v_a.current_price, 'bid_count', v_a.bid_count,
    'bidder_count', v_a.bidder_count, 'ends_at', v_a.ends_at, 'original_ends_at', v_a.original_ends_at,
    'extended_count', v_a.extended_count, 'closed_at', v_a.closed_at, 'pay_due_at', v_a.pay_due_at,
    'final_price', v_a.final_price, 'duration_days', v_a.duration_days, 'relist_of', v_a.relist_of,
    'min_bid', case when v_a.leader_id is null then v_a.start_price
                    else v_a.current_price + auction_increment(v_a.currency, v_a.current_price) end,
    'server_now', clock_timestamp(),
    'extend_minutes', (select extend_minutes from auction_settings),
    'viewer', jsonb_build_object(
      'signed_in', v_uid is not null,
      'is_seller', v_uid is not distinct from v_a.seller_id and v_uid is not null,
      'bidder_no', v_no,
      'my_max', v_my_max,
      'leading', v_uid is not null and v_a.leader_id = v_uid and v_a.status = 'live',
      'won', v_uid is not null and v_a.winner_id = v_uid,
      'can_pay', v_uid is not null and v_a.winner_id = v_uid and v_a.status = 'awaiting_payment'
                 and clock_timestamp() < v_a.pay_due_at,
      'tx_id', case when v_uid is not null and (v_a.winner_id = v_uid or v_a.seller_id = v_uid) then v_a.tx_id end,
      'bid_banned_until', case when v_ban > clock_timestamp() then v_ban end),
    'bids', v_bids);
end $$;

-- 마이페이지(U4) 「입찰 중·낙찰」: 내가 상한을 넣은 경매 목록 + 1등 여부
create or replace function my_auction_bids(p_limit int default 100) returns jsonb
  language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(r order by r.ends_at desc), '[]'::jsonb) from (
    select a.id, a.code, a.listing_id, a.status, a.currency, a.current_price, a.bid_count, a.ends_at, a.pay_due_at,
      a.final_price, m.max_amount as my_max, (a.leader_id = auth.uid() and a.status = 'live') as leading,
      (a.winner_id = auth.uid()) as won, l.title, l.images[1] as image
    from auction_max_bids m join auctions a on a.id = m.auction_id join listings l on l.id = a.listing_id
    where m.bidder_id = auth.uid()
    order by a.ends_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)
  ) r
$$;

-- ── 9. 마감(크론) ──
create or replace function close_due_auctions() returns jsonb
  language plpgsql security definer set search_path = public as $$
declare r record; v_a auctions; v_s auction_settings; v_sold int := 0; v_unsold int := 0; v_ending int := 0; v_fail jsonb := '[]'::jsonb; v_u uuid;
begin
  select * into v_s from auction_settings;
  for r in select id from auctions where status = 'live' and ends_at <= now() order by ends_at limit 200 for update skip locked loop
    begin
      perform set_config('tomo.auction', '1', true);
      select * into v_a from auctions where id = r.id;
      if v_a.leader_id is not null then
        update auctions set status = 'awaiting_payment', winner_id = leader_id, final_price = current_price, closed_at = now(),
            pay_due_at = ends_at + make_interval(hours => v_s.pay_hours)
          where id = r.id and status = 'live' returning * into v_a;
        if found then
          update listings set status = 'reserved', reserved_at = now() where id = v_a.listing_id and status = 'active';
          perform auction_notify(v_a.winner_id, 'auction_won', v_a, jsonb_build_object('pay_due_at', v_a.pay_due_at));
          perform auction_notify(v_a.seller_id, 'auction_sold', v_a);
          for v_u in select bidder_id from auction_max_bids where auction_id = v_a.id and bidder_id <> v_a.winner_id loop
            perform auction_notify(v_u, 'auction_lost', v_a);
          end loop;
          v_sold := v_sold + 1;
        end if;
      else
        update auctions set status = 'unsold', closed_at = now() where id = r.id and status = 'live' returning * into v_a;
        if found then
          update listings set hidden = true where id = v_a.listing_id;
          perform auction_notify(v_a.seller_id, 'auction_unsold', v_a);
          v_unsold := v_unsold + 1;
        end if;
      end if;
      perform set_config('tomo.auction', '', true);
    exception when others then
      perform set_config('tomo.auction', '', true);
      v_fail := v_fail || jsonb_build_object('id', r.id, 'error', left(sqlerrm, 200));
    end;
  end loop;

  -- 마감 1시간 전: 입찰자·찜한 사람(판매자 제외)에게 한 번
  for r in select id from auctions where status = 'live' and ending_notified_at is null
      and ends_at > now() and ends_at <= now() + interval '1 hour' limit 200 for update skip locked loop
    update auctions set ending_notified_at = now() where id = r.id and ending_notified_at is null returning * into v_a;
    if found then
      for v_u in select bidder_id from auction_max_bids where auction_id = v_a.id
                 union select w.user_id from wishlists w where w.listing_id = v_a.listing_id loop
        if v_u <> v_a.seller_id then perform auction_notify(v_u, 'auction_ending', v_a); end if;
      end loop;
      v_ending := v_ending + 1;
    end if;
  end loop;
  return jsonb_build_object('sold', v_sold, 'unsold', v_unsold, 'ending', v_ending, 'failed', v_fail);
end $$;

create or replace function cron_auctions() returns jsonb
  language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  v := close_due_auctions();
  insert into cron_runs (job, ok, detail) values ('auctions', jsonb_array_length(v->'failed') = 0, v);
  return v;
exception when others then
  insert into cron_runs (job, ok, detail) values ('auctions', false, jsonb_build_object('error', left(sqlerrm, 300)));
  return null;
end $$;

revoke all on function create_auction(uuid, int, int) from public, anon;
revoke all on function cancel_auction(uuid) from public, anon;
revoke all on function place_bid(uuid, int, text) from public, anon;
revoke all on function auction_state(uuid) from public;
revoke all on function my_auction_bids(int) from public, anon;
revoke all on function close_due_auctions() from public, anon, authenticated;
revoke all on function cron_auctions() from public, anon, authenticated;
grant execute on function create_auction(uuid, int, int) to authenticated;
grant execute on function cancel_auction(uuid) to authenticated;
grant execute on function place_bid(uuid, int, text) to authenticated;
grant execute on function auction_state(uuid) to anon, authenticated;
grant execute on function my_auction_bids(int) to authenticated;

-- ── 10. 기존 함수 가드 ──
-- start_transaction: 0035 본문 그대로 + 경매 상품 거절(경매는 start_auction_transaction(0047)으로만 거래가 열린다)
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
  if v_l.sale_type = 'auction' then raise exception 'auction listing'; end if;   -- 0046
  if v_l.seller_id = v_uid then raise exception 'cannot buy own listing'; end if;
  if p_meetup and v_l.trade_method not in ('direct','both') then raise exception 'listing is shipping only'; end if;

  select country into v_buyer_country from profiles where id = v_uid;
  v_cross := (not p_meetup) and v_l.cross_border_enabled and v_l.country <> v_buyer_country;
  v_center := case when v_cross then (case v_l.country when 'JP' then 'NARITA'::center_code else 'SEOUL'::center_code end) else null end;

  update listings set status = 'reserved', reserved_at = now()
    where id = p_listing_id and status = 'active' and sale_type = 'fixed';
  if not found then raise exception 'listing not available'; end if;

  insert into transactions (
    listing_id, buyer_id, seller_id, status, is_cross_border, center, meetup,
    item_price, intl_shipping_fee, platform_fee, currency)
  values (
    p_listing_id, v_uid, v_l.seller_id, 'pending_payment', v_cross, v_center, p_meetup,
    v_l.price,
    case when v_cross then (case when v_l.currency = 'KRW' then 8000 else 900 end) else 0 end,
    floor(v_l.price * 0.10)::int, v_l.currency)
  returning * into v_tx;
  return v_tx;
end $$;

-- release_stale_reservations: 0031 + 낙찰 대기 경매 상품은 예약을 풀지 않는다(거래 취소는 그대로)
create or replace function release_stale_reservations() returns void
  language plpgsql security definer set search_path = public as $$
begin
  update transactions set status = 'cancelled'
    where status = 'pending_payment' and created_at < now() - interval '45 minutes';
  update listings set status = 'active', reserved_at = null
    where status = 'reserved' and reserved_at < now() - interval '45 minutes'
      and not exists (
        select 1 from transactions t
        where t.listing_id = listings.id
          and t.status not in ('pending_payment','cancelled'))
      and not exists (
        select 1 from auctions a where a.listing_id = listings.id and a.status = 'awaiting_payment');
end $$;
revoke all on function release_stale_reservations() from public, anon, authenticated;

-- 끌어올리기: 0015 + 경매 상품 거절
create or replace function bump_listing(lid uuid) returns timestamptz
  language plpgsql security definer set search_path = public as $$
declare l listings;
begin
  select * into l from listings where id = lid for update;
  if l.id is null or l.seller_id <> auth.uid() then raise exception 'not seller'; end if;
  if l.sale_type = 'auction' then raise exception 'auction listing'; end if;   -- 0046
  if l.status <> 'active' then raise exception 'not active'; end if;
  if l.bumped_at > now() - interval '48 hours' then raise exception 'too soon'; end if;
  update listings set bumped_at = now() where id = lid;
  return now();
end $$;

-- 가격 제안: 경매 상품은 거절 (RESTRICTIVE = 기존 허용 정책과 AND)
drop policy if exists "auction listings take no offers" on offers;
create policy "auction listings take no offers" on offers as restrictive for insert
  with check (not exists (select 1 from listings l where l.id = offers.listing_id and l.sale_type = 'auction'));

commit;

-- ── 11. 예약 작업(트랜잭션 밖 — 확장이 없는 환경에서도 위 내용은 남는다) ──
do $$ begin
  if to_regnamespace('cron') is null then raise notice 'cron 스키마 없음 — 예약 건너뜀'; return; end if;
  perform cron.schedule('tomo_auctions', '* * * * *', 'select public.cron_auctions()');
end $$;

-- ── 되돌리기(0047 을 먼저 되돌린 뒤) ──
-- select cron.unschedule('tomo_auctions');
-- drop policy if exists "auction listings take no offers" on offers;
-- start_transaction: 0035 정의 다시 실행. release_stale_reservations: 0031 정의 다시 실행. bump_listing: 0015 본문(create or replace).
-- drop trigger if exists listings_auction_guard on listings; drop function if exists guard_auction_listing();
-- drop function if exists cron_auctions(); drop function if exists close_due_auctions(); drop function if exists my_auction_bids(int);
-- drop function if exists auction_state(uuid); drop function if exists place_bid(uuid, int, text);
-- drop function if exists cancel_auction(uuid); drop function if exists create_auction(uuid, int, int);
-- drop function if exists auction_notify(uuid, text, auctions, jsonb); drop function if exists auction_ends_at(timestamptz, int);
-- drop function if exists auction_amount_ok(currency_code, int, boolean); drop function if exists auction_increment(currency_code, int);
-- drop table if exists auction_bid_requests, auction_max_bids, auction_bids, auctions, auction_settings;
-- (경매 상품이 남아 있으면 먼저 sale_type 을 'fixed' 로) alter table listings drop column if exists sale_type;
-- alter table profiles drop column if exists bid_banned_until;
