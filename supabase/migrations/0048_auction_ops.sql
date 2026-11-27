-- 0048 경매 운영 (U5, 설계 docs/aaa/14-auction.md A-6·A-7·C절 U5, 0046·0047 뒤)
-- 1) 운영 함수(운영자 세션, is_admin_user(), 메모 필수, 활동 기록):
--    admin_close_auction(경매, 메모)        진행 중 경매 강제 종료 → cancelled, 상품 숨김, 입찰자 전원·판매자 알림(auction_cancelled)
--    admin_void_bid(경매, 입찰자, 메모)     진행 중 경매에서 한 입찰자의 입찰 전부 무효 → 상한 삭제(기록은 auction_bid_voids),
--                                         1등·현재가·입찰 수·listings.price 다시 계산(auction_recalc), 그 입찰자 알림(auction_bid_voided).
--                                         무효 처리된 입찰자는 그 경매에 다시 입찰할 수 없다(auction_max_bids 트리거 'bid voided').
--    admin_clear_strike(경고, 메모)         미결제 경고 해제 → 입찰 제한(bid_banned_until) 다시 계산
-- 2) 조회 함수(운영자 또는 service_role): admin_auctions(목록), admin_auction_detail(상세·입찰 원본·상한은 마감 뒤에만), auction_ops_counts(할 일 건수)
-- 3) 자전 입찰 의심 표시(표시만, 자동 조치 없음): 상한을 넣을 때 auction_flags 에 신호를 쌓는다.
--    same_contact(판매자와 연락처·배송지·출금 계좌 같음) / repeat_no_win(같은 판매자 경매 3건 이상 입찰, 낙찰 결제 0)
--    relist_rebid(미결제 뒤 다시 올린 경매에 앞 경매 입찰자가 또 입찰) / new_account_pusher(가입 7일 미만 계정이 1등 아닌 채 값을 올림)
--    IP·기기 정보는 DB 에 없어 쓰지 않는다.
-- 4) 이벤트(ops_outbox): auction.ended(낙찰로 마감) · auction.unpaid(미결제 확정) · auction.cancelled(운영 강제 종료) · auction.flagged(의심 표시 첫 등록)
-- 5) 진행 중 경매 보호: admin_set_listing_hidden 은 진행 중 경매 상품을 숨기지 않는다('auction live: use force close'),
--    admin_set_user 는 진행 중 경매가 있는 판매자를 정지하지 않는다('seller has live auctions'). 먼저 강제 종료한다.
-- 0046·0047 함수(place_bid·close_due_auctions·settle_unpaid_auctions 등)는 바꾸지 않는다.
begin;

-- ── 1. 이벤트 종류 ──
alter table ops_outbox drop constraint if exists ops_outbox_type_check;
alter table ops_outbox add constraint ops_outbox_type_check check (type in ('order.paid', 'order.cancel_requested', 'dispute.opened',
  'ticket.opened', 'refund.pending', 'payout.requested', 'report.opened', 'errors.spike', 'cron.failed',
  'auction.ended', 'auction.unpaid', 'auction.cancelled', 'auction.flagged'));

-- ── 2. 표 ──
create table if not exists auction_flags (
  auction_id uuid not null references auctions(id) on delete cascade,
  bidder_id uuid not null references profiles(id) on delete cascade,
  signals text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (auction_id, bidder_id)
);
alter table auction_flags enable row level security;
drop policy if exists "admin reads auction flags" on auction_flags;
create policy "admin reads auction flags" on auction_flags for select using (is_admin_user());
revoke all on auction_flags from anon, authenticated;
grant select on auction_flags to authenticated;

create table if not exists auction_bid_voids (
  id bigint generated always as identity primary key,
  auction_id uuid not null references auctions(id) on delete cascade,
  bidder_id uuid not null references profiles(id),
  max_amount int not null,
  note text not null,
  voided_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (auction_id, bidder_id)
);
alter table auction_bid_voids enable row level security;
drop policy if exists "admin reads auction bid voids" on auction_bid_voids;
create policy "admin reads auction bid voids" on auction_bid_voids for select using (is_admin_user());
revoke all on auction_bid_voids from anon, authenticated;
grant select on auction_bid_voids to authenticated;
grant select on auction_flags, auction_bid_voids to service_role;

-- 운영자 또는 서버(service_role, 운영 API 읽기)
create or replace function auction_admin_reader() returns boolean
  language sql stable security definer set search_path = public as $$
  select is_admin_user() or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
$$;
revoke all on function auction_admin_reader() from public, anon, authenticated;

-- ── 3. 무효 처리된 입찰자는 그 경매에 다시 입찰할 수 없다 ──
create or replace function guard_voided_bidder() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from auction_bid_voids where auction_id = new.auction_id and bidder_id = new.bidder_id) then
    raise exception 'bid voided';
  end if;
  return new;
end $$;
revoke all on function guard_voided_bidder() from public, anon, authenticated;
drop trigger if exists auction_max_bids_voided on auction_max_bids;
create trigger auction_max_bids_voided before insert on auction_max_bids
  for each row execute function guard_voided_bidder();

-- ── 4. 의심 신호 ──
create or replace function auction_flag_signals(p_auction uuid, p_bidder uuid) returns text[]
  language plpgsql stable security definer set search_path = public as $$
declare v_a auctions; v_prev auctions; v_s text[] := '{}'; v_n int; v_won int; v_created timestamptz;
begin
  select * into v_a from auctions where id = p_auction;
  if v_a.id is null or p_bidder = v_a.seller_id then return v_s; end if;
  -- 판매자와 연락처·배송지·출금 계좌가 같다
  if exists (select 1 from addresses b join addresses s on s.user_id = v_a.seller_id
              where b.user_id = p_bidder
                and ((length(regexp_replace(b.phone, '\D', '', 'g')) >= 8
                      and regexp_replace(b.phone, '\D', '', 'g') = regexp_replace(s.phone, '\D', '', 'g'))
                  or lower(regexp_replace(b.postal || b.address, '\s', '', 'g')) = lower(regexp_replace(s.postal || s.address, '\s', '', 'g'))))
     or exists (select 1 from payout_accounts b join payout_accounts s on s.user_id = v_a.seller_id
                 where b.user_id = p_bidder
                   and regexp_replace(b.account_number, '\D', '', 'g') = regexp_replace(s.account_number, '\D', '', 'g')) then
    v_s := v_s || 'same_contact'::text;
  end if;
  -- 같은 판매자 경매 3건 이상에 입찰했고 낙찰·결제 0건
  select count(*), count(*) filter (where a.winner_id = p_bidder and a.status = 'paid') into v_n, v_won
    from auction_max_bids m join auctions a on a.id = m.auction_id
   where m.bidder_id = p_bidder and a.seller_id = v_a.seller_id;
  if v_n >= 3 and v_won = 0 then v_s := v_s || 'repeat_no_win'::text; end if;
  -- 미결제 뒤 다시 올린 경매에 앞 경매 입찰자가 또 입찰
  if v_a.relist_of is not null then
    select * into v_prev from auctions where id = v_a.relist_of;
    if v_prev.status = 'unpaid' and exists (select 1 from auction_max_bids where auction_id = v_prev.id and bidder_id = p_bidder) then
      v_s := v_s || 'relist_rebid'::text;
    end if;
  end if;
  -- 가입 7일 미만 계정이 1등 아닌 채 값을 올림(같은 금액 이상인 다른 상한이 있다)
  select created_at into v_created from profiles where id = p_bidder;
  if v_created > now() - interval '7 days'
     and exists (select 1 from auction_max_bids me join auction_max_bids o on o.auction_id = me.auction_id and o.bidder_id <> me.bidder_id
                  where me.auction_id = p_auction and me.bidder_id = p_bidder and o.max_amount >= me.max_amount) then
    v_s := v_s || 'new_account_pusher'::text;
  end if;
  return v_s;
end $$;
revoke all on function auction_flag_signals(uuid, uuid) from public, anon, authenticated;

-- 상한을 넣거나 올릴 때 신호를 쌓는다. 처음 표시되면 이벤트 한 번. 어떤 오류도 입찰을 막지 않는다
create or replace function auction_flag_on_bid() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_s text[]; v_new boolean; v_a auctions;
begin
  begin
    v_s := auction_flag_signals(new.auction_id, new.bidder_id);
    if cardinality(v_s) > 0 then
      insert into auction_flags as f (auction_id, bidder_id, signals) values (new.auction_id, new.bidder_id, array(select distinct x from unnest(v_s) x order by 1))
        on conflict (auction_id, bidder_id) do update
          set signals = array(select distinct x from unnest(f.signals || excluded.signals) x order by 1), updated_at = now()
        returning (xmax = 0) into v_new;
      if v_new then
        select * into v_a from auctions where id = new.auction_id;
        perform ops_emit('auction.flagged', 'auction.flagged:' || new.auction_id || ':' || new.bidder_id, v_a.code,
          v_a.current_price, v_a.currency::text, '/admin/auctions?open=' || v_a.id, 'auction', v_a.id::text);
      end if;
    end if;
  exception when others then
    raise warning 'auction_flag_on_bid: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function auction_flag_on_bid() from public, anon, authenticated;
drop trigger if exists auction_max_bids_flag on auction_max_bids;
create trigger auction_max_bids_flag after insert or update of max_amount on auction_max_bids
  for each row execute function auction_flag_on_bid();

-- ── 5. 이벤트: 낙찰 마감·미결제 확정 ──
create or replace function ops_on_auction() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'awaiting_payment' and old.status = 'live' then
    perform ops_emit('auction.ended', 'auction.ended:' || new.id, new.code, new.final_price, new.currency::text,
      '/admin/auctions?open=' || new.id, 'auction', new.id::text);
  elsif new.status = 'unpaid' and old.status = 'awaiting_payment' then
    perform ops_emit('auction.unpaid', 'auction.unpaid:' || new.id, new.code, new.final_price, new.currency::text,
      '/admin/auctions?open=' || new.id, 'auction', new.id::text);
  end if;
  return null;
end $$;
revoke all on function ops_on_auction() from public, anon, authenticated;
drop trigger if exists auctions_ops_event on auctions;
create trigger auctions_ops_event after update of status on auctions
  for each row execute function ops_on_auction();

-- ── 6. 다시 계산(내부 전용, 호출자가 경매 행을 잠근 상태) ──
-- 1등 = 상한이 가장 높은 사람(같으면 그 금액을 먼저 넣은 사람), 현재가 = min(1등 상한, 2등 상한 + 단위), 입찰자 1명 이하면 시작가.
-- 남은 기록 중 새 현재가보다 높은 줄(빠진 입찰자가 밀어 올린 자동 대응)은 무효로 돌리고, 마지막 줄이 새 상태와 다르면 자동 줄 하나를 더한다.
create or replace function auction_recalc(p_auction uuid) returns auctions
  language plpgsql security definer set search_path = public as $$
declare v_a auctions; v_l1 auction_max_bids; v_l2 auction_max_bids; v_price int; v_last auction_bids;
begin
  select * into v_a from auctions where id = p_auction;
  select * into v_l1 from auction_max_bids where auction_id = p_auction order by max_amount desc, updated_at, bidder_id limit 1;
  select * into v_l2 from auction_max_bids where auction_id = p_auction order by max_amount desc, updated_at, bidder_id offset 1 limit 1;
  v_price := case when v_l2.bidder_id is null then v_a.start_price
                  else least(v_l1.max_amount, v_l2.max_amount + auction_increment(v_a.currency, v_l2.max_amount)) end;
  update auction_bids set voided_at = clock_timestamp() where auction_id = p_auction and voided_at is null and amount > v_price;
  if v_l1.bidder_id is not null then
    select * into v_last from auction_bids where auction_id = p_auction and voided_at is null order by id desc limit 1;
    if v_last.id is null or v_last.bidder_id <> v_l1.bidder_id or v_last.amount <> v_price then
      insert into auction_bids (auction_id, bidder_id, amount, kind) values (p_auction, v_l1.bidder_id, v_price, 'auto');
    end if;
  end if;
  update auctions set current_price = v_price, leader_id = v_l1.bidder_id,
      bid_count = (select count(*) from auction_bids where auction_id = p_auction and voided_at is null),
      bidder_count = (select count(*) from auction_max_bids where auction_id = p_auction)
    where id = p_auction returning * into v_a;
  perform set_config('tomo.auction', '1', true);
  update listings set price = v_price where id = v_a.listing_id and price is distinct from v_price;
  perform set_config('tomo.auction', '', true);
  return v_a;
end $$;
revoke all on function auction_recalc(uuid) from public, anon, authenticated;

-- ── 7. 운영 조작 ──
create or replace function admin_close_auction(p_auction uuid, p_note text) returns auctions
  language plpgsql security definer set search_path = public as $$
declare v_a auctions; v_u uuid;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if length(trim(coalesce(p_note, ''))) = 0 then raise exception 'note required'; end if;
  select * into v_a from auctions where id = p_auction for update;
  if v_a.id is null then raise exception 'auction not found'; end if;
  if v_a.status <> 'live' then raise exception 'auction not live'; end if;
  perform set_config('tomo.auction', '1', true);
  update auctions set status = 'cancelled', closed_at = now() where id = p_auction and status = 'live' returning * into v_a;
  update listings set hidden = true, reserved_at = null where id = v_a.listing_id;
  perform set_config('tomo.auction', '', true);
  for v_u in select bidder_id from auction_max_bids where auction_id = p_auction union select v_a.seller_id loop
    perform auction_notify(v_u, 'auction_cancelled', v_a, jsonb_build_object('by', 'admin'));
  end loop;
  perform log_admin_action('auction_close', 'auction', v_a.id::text, jsonb_build_object('code', v_a.code, 'note', left(trim(p_note), 300),
    'listing_id', v_a.listing_id, 'bid_count', v_a.bid_count, 'current_price', v_a.current_price, 'currency', v_a.currency));
  perform ops_emit('auction.cancelled', 'auction.cancelled:' || v_a.id, v_a.code, v_a.current_price, v_a.currency::text,
    '/admin/auctions?open=' || v_a.id, 'auction', v_a.id::text);
  return v_a;
end $$;

create or replace function admin_void_bid(p_auction uuid, p_bidder uuid, p_note text) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare v_a auctions; v_max int; v_old_price int; v_old_leader uuid; v_old_count int;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if length(trim(coalesce(p_note, ''))) = 0 then raise exception 'note required'; end if;
  select * into v_a from auctions where id = p_auction for update;
  if v_a.id is null then raise exception 'auction not found'; end if;
  if v_a.status <> 'live' then raise exception 'auction not live'; end if;
  select max_amount into v_max from auction_max_bids where auction_id = p_auction and bidder_id = p_bidder;
  if v_max is null then raise exception 'bidder not found'; end if;
  v_old_price := v_a.current_price; v_old_leader := v_a.leader_id; v_old_count := v_a.bid_count;
  insert into auction_bid_voids (auction_id, bidder_id, max_amount, note, voided_by)
    values (p_auction, p_bidder, v_max, left(trim(p_note), 500), auth.uid());
  delete from auction_max_bids where auction_id = p_auction and bidder_id = p_bidder;
  delete from auction_bid_requests where auction_id = p_auction and bidder_id = p_bidder;   -- 같은 요청 번호 재전송이 옛 결과를 돌려주지 않게
  update auction_bids set voided_at = clock_timestamp() where auction_id = p_auction and bidder_id = p_bidder and voided_at is null;
  v_a := auction_recalc(p_auction);
  perform auction_notify(p_bidder, 'auction_bid_voided', v_a);
  perform log_admin_action('auction_void_bid', 'auction', v_a.id::text, jsonb_build_object('code', v_a.code, 'bidder', p_bidder,
    'note', left(trim(p_note), 300), 'from_price', v_old_price, 'to_price', v_a.current_price, 'from_leader', v_old_leader,
    'to_leader', v_a.leader_id, 'from_bid_count', v_old_count, 'to_bid_count', v_a.bid_count, 'currency', v_a.currency));
  return jsonb_build_object('auction_id', v_a.id, 'status', v_a.status, 'current_price', v_a.current_price,
    'bid_count', v_a.bid_count, 'bidder_count', v_a.bidder_count, 'leader_changed', v_old_leader is distinct from v_a.leader_id);
end $$;

-- 경고 해제 → 남은 경고로 입찰 제한을 다시 정한다(통산 3회 이상 = 정지 유지, 90일 안 2회 = 마지막 경고 + 30일, 그 밖 = 풀림)
create or replace function admin_clear_strike(p_strike uuid, p_note text) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare v_s auction_strikes; v_90 int; v_all int; v_last timestamptz; v_before timestamptz; v_after timestamptz;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if length(trim(coalesce(p_note, ''))) = 0 then raise exception 'note required'; end if;
  update auction_strikes set lifted_at = now(), lifted_by = auth.uid(), note = left(trim(p_note), 500)
    where id = p_strike and lifted_at is null returning * into v_s;
  if v_s.id is null then raise exception 'strike not active'; end if;
  select bid_banned_until into v_before from profiles where id = v_s.user_id for update;
  select count(*) filter (where created_at > now() - interval '90 days'), count(*), max(created_at)
    into v_90, v_all, v_last from auction_strikes where user_id = v_s.user_id and lifted_at is null;
  v_after := case when v_all >= 3 then v_before
                  when v_90 >= 2 and v_before is not null then least(v_before, v_last + interval '30 days')
                  else null end;
  if v_after <= now() then v_after := null; end if;
  update profiles set bid_banned_until = v_after where id = v_s.user_id;
  perform log_admin_action('auction_clear_strike', 'user', v_s.user_id::text, jsonb_build_object('strike', v_s.id,
    'auction', v_s.auction_id, 'note', left(trim(p_note), 300), 'ban_before', v_before, 'ban_after', v_after, 'active_strikes', v_all));
  return jsonb_build_object('strike_id', v_s.id, 'user_id', v_s.user_id, 'bid_banned_until', v_after, 'active_strikes', v_all);
end $$;

revoke all on function admin_close_auction(uuid, text) from public, anon;
revoke all on function admin_void_bid(uuid, uuid, text) from public, anon;
revoke all on function admin_clear_strike(uuid, text) from public, anon;
grant execute on function admin_close_auction(uuid, text) to authenticated;
grant execute on function admin_void_bid(uuid, uuid, text) to authenticated;
grant execute on function admin_clear_strike(uuid, text) to authenticated;

-- ── 8. 진행 중 경매 보호(0025 정의 + 경매 검사) ──
create or replace function admin_set_listing_hidden(p_id uuid, p_hidden boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if p_hidden and exists (select 1 from auctions where listing_id = p_id and status = 'live') then
    raise exception 'auction live: use force close';   -- 0048: 시간이 흐르는 경매를 숨겼다 풀면 공정하지 않다
  end if;
  update listings set hidden = p_hidden, hidden_by_admin = p_hidden where id = p_id;
  perform log_admin_action('listing_hidden', 'listing', p_id::text, jsonb_build_object('hidden', p_hidden));
end $$;
revoke all on function admin_set_listing_hidden(uuid, boolean) from public;
grant execute on function admin_set_listing_hidden(uuid, boolean) to authenticated;

create or replace function admin_set_user(p_id uuid, p_suspended boolean, p_admin boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if p_id = auth.uid() and not p_admin then raise exception 'cannot demote yourself'; end if;
  if p_suspended and exists (select 1 from auctions where seller_id = p_id and status = 'live')
     and not exists (select 1 from profiles where id = p_id and suspended) then
    raise exception 'seller has live auctions';   -- 0048: 경매 화면에서 먼저 강제 종료
  end if;
  update profiles set suspended = p_suspended, is_admin = p_admin where id = p_id;
  if p_suspended then update listings set hidden = true, hidden_by_admin = true where seller_id = p_id and status = 'active'; end if;
  perform log_admin_action('user_set', 'user', p_id::text, jsonb_build_object('suspended', p_suspended, 'admin', p_admin));
end $$;
revoke all on function admin_set_user(uuid, boolean, boolean) from public;
grant execute on function admin_set_user(uuid, boolean, boolean) to authenticated;

-- ── 9. 조회 ──
-- 미결제 뒤 판매자가 아직 고르지 않은 경매: 그 상품의 가장 최근 경매가 unpaid 이고 상품이 아직 경매·판매중·숨김
create or replace function auction_seller_choice_pending(p_a auctions) returns boolean
  language sql stable security definer set search_path = public as $$
  select p_a.status = 'unpaid'
    and exists (select 1 from listings l where l.id = p_a.listing_id and l.sale_type = 'auction' and l.status = 'active' and l.hidden)
    and not exists (select 1 from auctions x where x.listing_id = p_a.listing_id and x.created_at > p_a.created_at)
$$;
revoke all on function auction_seller_choice_pending(auctions) from public, anon, authenticated;

-- 목록. p_tab: live | awaiting | unpaid | ended(paid·unsold·cancelled) | flagged(의심 표시 있는 것) | all. p_q: AU 번호 또는 상품 제목
create or replace function admin_auctions(p_tab text default 'live', p_q text default null, p_limit int default 50, p_offset int default 0)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_items jsonb; v_total int; v_q text := nullif(trim(coalesce(p_q, '')), '');
begin
  if not auction_admin_reader() then raise exception 'admin only'; end if;
  with base as (
    select a.*, l.title, l.images[1] as image, l.hidden as listing_hidden, l.status as listing_status,
      (select count(*) from auction_flags f where f.auction_id = a.id) as flag_count,
      auction_seller_choice_pending(a) as seller_choice_pending
    from auctions a join listings l on l.id = a.listing_id
    where (coalesce(p_tab, 'all') = 'all'
        or (p_tab = 'live' and a.status = 'live')
        or (p_tab = 'awaiting' and a.status = 'awaiting_payment')
        or (p_tab = 'unpaid' and a.status = 'unpaid')
        or (p_tab = 'ended' and a.status in ('paid', 'unsold', 'cancelled'))
        or (p_tab = 'flagged' and exists (select 1 from auction_flags f where f.auction_id = a.id)))
      and (v_q is null or a.code = upper(v_q) or a.id::text = v_q or l.title ilike '%' || replace(replace(v_q, '%', ''), '_', '') || '%')
  ), page as (
    select * from base
    order by case when status in ('live', 'awaiting_payment') then 0 else 1 end,
      case status when 'live' then ends_at when 'awaiting_payment' then pay_due_at end asc nulls last,
      coalesce(closed_at, created_at) desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  )
  select (select count(*) from base),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id, 'code', b.code, 'status', b.status, 'listing_id', b.listing_id, 'title', b.title, 'image', b.image,
      'listing_status', b.listing_status, 'listing_hidden', b.listing_hidden,
      'seller', jsonb_build_object('id', b.seller_id, 'nickname', (select nickname from profiles where id = b.seller_id)),
      'leader_nickname', (select nickname from profiles where id = b.leader_id),
      'winner_nickname', (select nickname from profiles where id = b.winner_id),
      'currency', b.currency, 'start_price', b.start_price, 'current_price', b.current_price, 'final_price', b.final_price,
      'bid_count', b.bid_count, 'bidder_count', b.bidder_count, 'ends_at', b.ends_at, 'original_ends_at', b.original_ends_at,
      'extended_count', b.extended_count, 'closed_at', b.closed_at, 'pay_due_at', b.pay_due_at, 'paid_at', b.paid_at,
      'tx_id', b.tx_id, 'relist_of', b.relist_of, 'created_at', b.created_at, 'flag_count', b.flag_count,
      'seller_choice_pending', b.seller_choice_pending)
      order by case when b.status in ('live', 'awaiting_payment') then 0 else 1 end,
        case b.status when 'live' then b.ends_at when 'awaiting_payment' then b.pay_due_at end asc nulls last,
        coalesce(b.closed_at, b.created_at) desc) from page b), '[]'::jsonb)
    into v_total, v_items;
  return jsonb_build_object('items', v_items, 'total', coalesce(v_total, 0));
end $$;

-- 상세. 입찰 기록 원본(입찰자 닉네임)은 운영자에게 보인다. 상한가는 마감 뒤(live 가 아닐 때)에만 넣는다(설계 A-6)
create or replace function admin_auction_detail(p_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare v_a auctions; v_open boolean;
begin
  if not auction_admin_reader() then raise exception 'admin only'; end if;
  select * into v_a from auctions where id = p_id;
  if v_a.id is null then return null; end if;
  v_open := v_a.status = 'live';
  return jsonb_build_object(
    'auction', to_jsonb(v_a) - 'ending_notified_at' - 'remind24_at' - 'remind6_at'
      || jsonb_build_object('seller_choice_pending', auction_seller_choice_pending(v_a), 'max_visible', not v_open),
    'listing', (select jsonb_build_object('id', l.id, 'title', l.title, 'image', l.images[1], 'status', l.status, 'hidden', l.hidden,
        'hidden_by_admin', l.hidden_by_admin, 'sale_type', l.sale_type, 'country', l.country, 'cross_border_enabled', l.cross_border_enabled)
      from listings l where l.id = v_a.listing_id),
    'seller', (select jsonb_build_object('id', p.id, 'nickname', p.nickname, 'created_at', p.created_at, 'suspended', p.suspended)
      from profiles p where p.id = v_a.seller_id),
    'leader_nickname', (select nickname from profiles where id = v_a.leader_id),
    'winner_nickname', (select nickname from profiles where id = v_a.winner_id),
    'bids', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'bidder_id', b.bidder_id, 'nickname', p.nickname,
        'amount', b.amount, 'kind', b.kind, 'at', b.created_at, 'voided_at', b.voided_at) order by b.id desc), '[]'::jsonb)
      from (select * from auction_bids where auction_id = v_a.id order by id desc limit 300) b left join profiles p on p.id = b.bidder_id),
    'bidders', (select coalesce(jsonb_agg(x order by (x->>'first_bid_at')), '[]'::jsonb) from (
        select jsonb_build_object('bidder_id', u.bidder_id, 'nickname', p.nickname, 'joined_at', p.created_at, 'suspended', p.suspended,
          'first_bid_at', (select min(created_at) from auction_bids where auction_id = v_a.id and bidder_id = u.bidder_id),
          'max_amount', case when v_open then null else coalesce(m.max_amount, v.max_amount) end,
          'leading', u.bidder_id = v_a.leader_id and v_open,
          'voided', v.id is not null, 'void_note', v.note, 'voided_at', v.created_at,
          'signals', coalesce(f.signals, '{}'::text[]),
          'active_strikes', (select count(*) from auction_strikes s where s.user_id = u.bidder_id and s.lifted_at is null),
          'bid_banned_until', p.bid_banned_until) as x
        from (select bidder_id from auction_max_bids where auction_id = v_a.id
              union select bidder_id from auction_bid_voids where auction_id = v_a.id) u
        left join profiles p on p.id = u.bidder_id
        left join auction_max_bids m on m.auction_id = v_a.id and m.bidder_id = u.bidder_id
        left join auction_bid_voids v on v.auction_id = v_a.id and v.bidder_id = u.bidder_id
        left join auction_flags f on f.auction_id = v_a.id and f.bidder_id = u.bidder_id) t),
    'strikes', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'user_id', s.user_id, 'nickname', p.nickname, 'auction_id', s.auction_id,
        'auction_code', (select code from auctions where id = s.auction_id), 'created_at', s.created_at, 'lifted_at', s.lifted_at,
        'note', s.note) order by s.created_at desc), '[]'::jsonb)
      from auction_strikes s left join profiles p on p.id = s.user_id
      where s.auction_id = v_a.id or (v_a.winner_id is not null and s.user_id = v_a.winner_id)),
    'chain', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'code', x.code, 'status', x.status, 'created_at', x.created_at)
        order by x.created_at), '[]'::jsonb) from auctions x where x.listing_id = v_a.listing_id),
    'actions', (select coalesce(jsonb_agg(jsonb_build_object('id', aa.id, 'action', aa.action, 'admin', p.nickname, 'detail', aa.detail,
        'created_at', aa.created_at) order by aa.id desc), '[]'::jsonb)
      from admin_actions aa left join profiles p on p.id = aa.admin_id
      where aa.target_type = 'auction' and aa.target_id = v_a.id::text));
end $$;

-- 할 일 건수
create or replace function auction_ops_counts() returns jsonb
  language plpgsql stable security definer set search_path = public as $$
begin
  if not auction_admin_reader() then raise exception 'admin only'; end if;
  return (select jsonb_build_object(
    'live', count(*) filter (where status = 'live'),
    'awaiting', count(*) filter (where status = 'awaiting_payment'),
    'pay_due_soon', count(*) filter (where status = 'awaiting_payment' and pay_due_at <= now() + interval '12 hours'),
    'pay_overdue', count(*) filter (where status = 'awaiting_payment' and pay_due_at + interval '50 minutes' < now()),
    'live_overdue', count(*) filter (where status = 'live' and ends_at + interval '5 minutes' < now()),
    'seller_choice', count(*) filter (where auction_seller_choice_pending(a)),
    'seller_choice_old', count(*) filter (where auction_seller_choice_pending(a) and pay_due_at < now() - interval '3 days'),
    'flagged', count(*) filter (where status in ('live', 'awaiting_payment') and exists (select 1 from auction_flags f where f.auction_id = a.id)))
    from auctions a);
end $$;

revoke all on function admin_auctions(text, text, int, int) from public, anon;
revoke all on function admin_auction_detail(uuid) from public, anon;
revoke all on function auction_ops_counts() from public, anon;
grant execute on function admin_auctions(text, text, int, int) to authenticated, service_role;
grant execute on function admin_auction_detail(uuid) to authenticated, service_role;
grant execute on function auction_ops_counts() to authenticated, service_role;

commit;

-- ── 되돌리기 ──
-- drop function if exists auction_ops_counts(); drop function if exists admin_auction_detail(uuid); drop function if exists admin_auctions(text, text, int, int);
-- drop function if exists auction_seller_choice_pending(auctions);
-- admin_set_user·admin_set_listing_hidden: 0025 정의 다시 실행.
-- drop function if exists admin_clear_strike(uuid, text); drop function if exists admin_void_bid(uuid, uuid, text); drop function if exists admin_close_auction(uuid, text);
-- drop function if exists auction_recalc(uuid);
-- drop trigger if exists auctions_ops_event on auctions; drop function if exists ops_on_auction();
-- drop trigger if exists auction_max_bids_flag on auction_max_bids; drop function if exists auction_flag_on_bid(); drop function if exists auction_flag_signals(uuid, uuid);
-- drop trigger if exists auction_max_bids_voided on auction_max_bids; drop function if exists guard_voided_bidder();
-- drop function if exists auction_admin_reader(); drop table if exists auction_bid_voids; drop table if exists auction_flags;
-- ops_outbox_type_check: 0043 의 9종으로 다시(auction.* 행을 먼저 지운다).
