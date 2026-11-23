-- 알림함 (2026-11-23 이식 묶음 C). 문구는 DB에 없다: 앱이 kind → i18n `notif.<kind>`(lib/notifications.ts).
-- 0025(refunds)·0026(payouts) 뒤에 적용한다. 두 테이블이 없으면 해당 트리거만 건너뛴다.
-- 미적용·미검증(DB 일시정지). 재개 후 begin … rollback 으로 먼저 확인.

create table if not exists notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  ref_type text,
  ref_id text,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

alter table notifications enable row level security;
create policy "own notifications" on notifications for select using (user_id = auth.uid());
create policy "mark own notifications" on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update, delete on notifications from authenticated, anon;
grant select on notifications to authenticated;
grant update (read_at) on notifications to authenticated;

-- 내부 함수: 트리거만 부른다. 알림 실패가 돈·상태 변경을 되돌리지 않게 오류는 삼킨다.
create or replace function notify(p_user uuid, p_kind text, p_ref_type text, p_ref_id text, p_data jsonb default '{}')
  returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  begin
    insert into notifications (user_id, kind, ref_type, ref_id, data)
      values (p_user, p_kind, p_ref_type, p_ref_id, coalesce(p_data, '{}'::jsonb));
  exception when others then null;
  end;
end $$;
revoke all on function notify(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- ── 직거래 ──
create or replace function notify_transaction() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_title text; v_d jsonb; v_actor uuid := auth.uid();
begin
  if new.status is not distinct from old.status then return new; end if;
  select title into v_title from listings where id = new.listing_id;
  v_d := jsonb_build_object('title', coalesce(v_title, ''), 'listing_id', new.listing_id);
  case new.status
    when 'paid' then perform notify(new.seller_id, 'tx_paid', 'tx', new.id::text, v_d);
    when 'shipped', 'shipped_international' then perform notify(new.buyer_id, 'tx_shipped', 'tx', new.id::text, v_d);
    when 'delivered' then perform notify(new.seller_id, 'tx_delivered', 'tx', new.id::text, v_d);
    when 'completed' then perform notify(new.seller_id, 'tx_completed', 'tx', new.id::text, v_d);
    when 'cancelled' then
      perform notify(new.buyer_id, 'tx_cancelled', 'tx', new.id::text, v_d);
      perform notify(new.seller_id, 'tx_cancelled', 'tx', new.id::text, v_d);
    when 'disputed' then
      -- 분쟁을 연 사람의 상대에게. 운영자·서버가 바꿨으면(행위자가 당사자가 아님) 양쪽
      if v_actor is distinct from new.buyer_id then perform notify(new.buyer_id, 'tx_disputed', 'tx', new.id::text, v_d); end if;
      if v_actor is distinct from new.seller_id then perform notify(new.seller_id, 'tx_disputed', 'tx', new.id::text, v_d); end if;
    else null;
  end case;
  return new;
end $$;
drop trigger if exists transactions_notify on transactions;
create trigger transactions_notify after update of status on transactions
  for each row execute function notify_transaction();

-- ── 구매대행 ── 한 주문의 여러 항목이 같이 움직이면 1분 안 같은 주문·같은 kind 는 한 번만
create or replace function notify_proxy() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_kind text; v_title text;
begin
  if new.status is not distinct from old.status then return new; end if;
  v_kind := case new.status
    when 'quoted' then 'proxy_quoted' when 'purchasing' then 'proxy_purchasing'
    when 'center_received' then 'proxy_center' when 'shipped_international' then 'proxy_shipped'
    when 'delivered' then 'proxy_delivered' when 'cancelled' then 'proxy_cancelled' else null end;
  if v_kind is null then return new; end if;
  if new.order_id is not null and exists (
    select 1 from notifications n where n.user_id = new.user_id and n.kind = v_kind
      and n.data->>'order_id' = new.order_id::text and n.created_at > now() - interval '1 minute') then
    return new;
  end if;
  select coalesce(nullif(title_translated, ''), title) into v_title from external_items where id = new.external_item_id;
  perform notify(new.user_id, v_kind, 'proxy', new.id::text,
    jsonb_build_object('title', coalesce(v_title, ''), 'order_id', new.order_id));
  return new;
end $$;
drop trigger if exists proxy_requests_notify on proxy_requests;
create trigger proxy_requests_notify after update of status on proxy_requests
  for each row execute function notify_proxy();

-- ── 문의 답변 ──
create or replace function notify_support() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'answered' and old.status is distinct from 'answered' then
    perform notify(new.user_id, 'support_answered', 'support', new.id::text, '{}'::jsonb);
  end if;
  return new;
end $$;
drop trigger if exists support_tickets_notify on support_tickets;
create trigger support_tickets_notify after update of status on support_tickets
  for each row execute function notify_support();

-- ── 가격제안 ──
create or replace function notify_offer() returns trigger
  language plpgsql security definer set search_path = public as $$
declare l listings; v_d jsonb;
begin
  select * into l from listings where id = new.listing_id;
  v_d := jsonb_build_object('title', coalesce(l.title, ''), 'listing_id', new.listing_id, 'price', new.price, 'currency', l.currency);
  if tg_op = 'INSERT' then
    perform notify(l.seller_id, 'offer_received', 'offer', new.id::text, v_d);
  elsif new.status is distinct from old.status and new.status in ('accepted', 'declined') then
    perform notify(new.buyer_id, 'offer_' || new.status, 'offer', new.id::text, v_d);
  end if;
  return new;
end $$;
drop trigger if exists offers_notify on offers;
create trigger offers_notify after insert or update of status on offers
  for each row execute function notify_offer();

-- ── 찜 값내림: 가격이 내려가면 찜한 사람에게(판매자 본인 제외) ──
create or replace function notify_price_drop() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.price < old.price and new.status = 'active' and not new.hidden then
    begin
      insert into notifications (user_id, kind, ref_type, ref_id, data)
        select w.user_id, 'wish_price_drop', 'listing', new.id::text,
          jsonb_build_object('title', new.title, 'old_price', old.price, 'price', new.price, 'currency', new.currency)
        from wishlists w where w.listing_id = new.id and w.user_id <> new.seller_id;
    exception when others then null;
    end;
  end if;
  return new;
end $$;
drop trigger if exists listings_price_drop_notify on listings;
create trigger listings_price_drop_notify after update of price on listings
  for each row execute function notify_price_drop();

-- ── 환불 완료(0025)·출금 처리(0026): 테이블이 있을 때만 트리거를 단다 ──
create or replace function notify_refund() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status::text = 'done' and old.status::text is distinct from 'done' then
    perform notify(new.user_id, 'refund_done', 'refund', new.id::text,
      jsonb_build_object('amount', new.amount, 'currency', new.currency,
        'transaction_id', new.transaction_id, 'proxy_request_id', new.proxy_request_id));
  end if;
  return new;
end $$;
create or replace function notify_payout() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status::text in ('sent', 'rejected') and old.status::text is distinct from new.status::text then
    perform notify(new.user_id, 'payout_' || new.status::text, 'payout', new.id::text,
      jsonb_build_object('amount', new.amount, 'currency', new.currency));
  end if;
  return new;
end $$;
do $$ begin
  if to_regclass('public.refunds') is not null then
    execute 'drop trigger if exists refunds_notify on refunds';
    execute 'create trigger refunds_notify after update of status on refunds for each row execute function notify_refund()';
  end if;
  if to_regclass('public.payouts') is not null then
    execute 'drop trigger if exists payouts_notify on payouts';
    execute 'create trigger payouts_notify after update of status on payouts for each row execute function notify_payout()';
  end if;
end $$;

-- 트리거 함수는 직접 호출 금지
revoke all on function notify_transaction() from public, anon, authenticated;
revoke all on function notify_proxy() from public, anon, authenticated;
revoke all on function notify_support() from public, anon, authenticated;
revoke all on function notify_offer() from public, anon, authenticated;
revoke all on function notify_price_drop() from public, anon, authenticated;
revoke all on function notify_refund() from public, anon, authenticated;
revoke all on function notify_payout() from public, anon, authenticated;

-- ── RPC ──
create or replace function unread_notifications() returns int
  language sql stable security definer set search_path = public as $$
  select count(*)::int from notifications where user_id = auth.uid() and read_at is null
$$;
revoke all on function unread_notifications() from public;
grant execute on function unread_notifications() to authenticated;

-- p_ids 가 null 이면 전부 읽음. 바뀐 행 수를 돌려준다
create or replace function mark_notifications_read(p_ids bigint[] default null) returns int
  language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  update notifications set read_at = now()
    where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function mark_notifications_read(bigint[]) from public;
grant execute on function mark_notifications_read(bigint[]) to authenticated;
