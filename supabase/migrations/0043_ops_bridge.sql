-- 0043 운영 브리지 (2026-11-27, 설계 docs/aaa/12 3.2·3.3·T3·8장, Ren 승인)
-- 센터(에어쉽 어드민)가 서명된 서버 간 요청으로 tomo 를 운영한다. 정본·돈 경로는 tomo 그대로.
-- 1) ops_actors: 센터 운영자(center_actor_id·center_actor_email) → tomo 운영자(profiles.id, is_admin). 소유자(is_owner)만 money scope.
-- 2) ops_requests: 조작 요청 기록. request_id 유일 = 멱등(같은 요청이 다시 오면 저장된 결과를 돌려준다).
-- 3) ops_outbox: 센터로 보낼 이벤트. 업무 쓰기와 같은 트랜잭션에 먼저 쓰고, 서버 크론(/api/cron/ops-outbox)이 보낸다.
--    실패하면 간격을 늘려(1·2·4…분, 최대 2시간) 24시간 동안 다시 보낸다. 이벤트 이름 9개 고정(8.3).
-- 기존 함수·트리거(notify_transaction·notify_proxy 등)는 바꾸지 않는다. 새 트리거는 AFTER 로 따로 붙이고, 실패해도 업무 쓰기를 막지 않는다.
begin;

-- ── 1. 운영자 연결 ──
create table if not exists ops_actors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  center_actor_id text unique,                -- 센터 관리자 id. 비어 있으면 첫 요청 때 이메일로 맞춰 채운다
  center_actor_email text not null unique check (center_actor_email = lower(trim(center_actor_email)) and center_actor_email like '%@%'),
  is_owner boolean not null default false,    -- money scope(환불 실행·출금 확정·분쟁 환불 결정·회원 완전 삭제)
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
alter table ops_actors enable row level security;
drop policy if exists "admin reads ops actors" on ops_actors;
create policy "admin reads ops actors" on ops_actors for select using (is_admin_user());
revoke insert, update, delete on ops_actors from authenticated, anon;

-- Ren(소유자). profiles 닉네임 「렌」, is_admin. center_actor_id 는 센터 첫 요청 때 이메일로 채운다
insert into ops_actors (profile_id, center_actor_email, is_owner, note)
select p.id, 'mellowdazzle@gmail.com', true, 'Ren (소유자, 2026-11-27)'
  from auth.users u join profiles p on p.id = u.id
 where lower(u.email) = 'mellowdazzle@gmail.com' and p.is_admin
on conflict do nothing;

-- ── 2. 조작 요청 기록(멱등) ──
create table if not exists ops_requests (
  request_id uuid primary key,
  actor_id uuid not null references ops_actors(id),
  action text not null,
  target text not null,
  status text not null default 'running' check (status in ('running', 'done')),
  http_status int,
  response jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists ops_requests_created_idx on ops_requests (created_at desc);
alter table ops_requests enable row level security;
drop policy if exists "admin reads ops requests" on ops_requests;
create policy "admin reads ops requests" on ops_requests for select using (is_admin_user());
revoke insert, update, delete on ops_requests from authenticated, anon;

-- ── 3. 이벤트 outbox ──
create table if not exists ops_outbox (
  id bigint generated always as identity primary key,
  event_id uuid not null unique default gen_random_uuid(),
  type text not null check (type in ('order.paid', 'order.cancel_requested', 'dispute.opened', 'ticket.opened',
    'refund.pending', 'payout.requested', 'report.opened', 'errors.spike', 'cron.failed')),
  dedupe_key text not null unique,            -- 같은 사건이 두 번 들어가지 않게(예: order.paid:<주문 id>)
  code text, amount int, currency text, path text,   -- path = tomo 어드민 경로(보낼 때 사이트 주소를 붙인다)
  target_type text, target_id text,
  occurred_at timestamptz not null default now(),
  attempts int not null default 0,
  next_at timestamptz not null default now(),
  sent_at timestamptz,
  dead_at timestamptz,                        -- 24시간 동안 못 보냈으면 포기
  last_error text
);
create index if not exists ops_outbox_due_idx on ops_outbox (next_at) where sent_at is null and dead_at is null;
alter table ops_outbox enable row level security;
drop policy if exists "admin reads ops outbox" on ops_outbox;
create policy "admin reads ops outbox" on ops_outbox for select using (is_admin_user());
revoke insert, update, delete on ops_outbox from authenticated, anon;

-- 이벤트 한 건 쓰기. 어떤 오류도 업무 쓰기를 막지 않는다
create or replace function ops_emit(p_type text, p_dedupe text, p_code text, p_amount int, p_currency text,
  p_path text, p_target_type text, p_target_id text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  insert into ops_outbox (type, dedupe_key, code, amount, currency, path, target_type, target_id)
  values (p_type, p_dedupe, p_code, p_amount, p_currency, p_path, p_target_type, p_target_id)
  on conflict (dedupe_key) do nothing;
exception when others then
  raise warning 'ops_emit % 실패: %', p_type, sqlerrm;
end $$;
revoke all on function ops_emit(text, text, text, int, text, text, text, text) from public, anon, authenticated;

-- 대행 결제 완료(주문 단위)
create or replace function ops_on_proxy_order() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    perform ops_emit('order.paid', 'order.paid:' || new.id, new.code, new.total, new.currency::text,
      '/admin/orders?open=' || new.id, 'proxy_order', new.id::text);
  end if;
  return null;
end $$;
drop trigger if exists proxy_orders_ops_event on proxy_orders;
create trigger proxy_orders_ops_event after update of status on proxy_orders
  for each row execute function ops_on_proxy_order();

-- 고객 취소 요청(요청 시각마다 한 번)
create or replace function ops_on_proxy_cancel_request() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_code text; v_cur text;
begin
  if new.cancel_requested_at is not null and new.cancel_requested_at is distinct from old.cancel_requested_at then
    if new.order_id is not null then select code, currency::text into v_code, v_cur from proxy_orders where id = new.order_id; end if;
    perform ops_emit('order.cancel_requested',
      'order.cancel_requested:' || new.id || ':' || extract(epoch from new.cancel_requested_at)::bigint,
      v_code, new.quote_total, v_cur, '/admin/proxy?f=cancelreq', 'proxy_request', new.id::text);
  end if;
  return null;
end $$;
drop trigger if exists proxy_requests_ops_event on proxy_requests;
create trigger proxy_requests_ops_event after update of cancel_requested_at on proxy_requests
  for each row execute function ops_on_proxy_cancel_request();

-- 분쟁 접수
create or replace function ops_on_transaction() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'disputed' and old.status is distinct from 'disputed' then
    perform ops_emit('dispute.opened', 'dispute.opened:' || new.id || ':' || extract(epoch from now())::bigint,
      new.code, new.item_price, new.currency::text, '/admin/disputes', 'transaction', new.id::text);
  end if;
  return null;
end $$;
drop trigger if exists transactions_ops_event on transactions;
create trigger transactions_ops_event after update of status on transactions
  for each row execute function ops_on_transaction();

-- 문의·환불 대기·출금 요청·신고 접수(새 행), 크론 실패
create or replace function ops_on_insert() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  case tg_table_name
    when 'support_tickets' then
      perform ops_emit('ticket.opened', 'ticket.opened:' || new.id, null, null, null, '/admin/support', 'support_ticket', new.id::text);
    when 'refunds' then
      if new.kind = 'tx' then select code into v_code from transactions where id = new.transaction_id;
      else select code into v_code from proxy_orders where id = new.proxy_order_id; end if;
      perform ops_emit('refund.pending', 'refund.pending:' || new.id, v_code, new.amount, new.currency::text, '/admin/refunds', 'refund', new.id::text);
    when 'payouts' then
      if new.status = 'requested' then
        perform ops_emit('payout.requested', 'payout.requested:' || new.id, null, new.amount, new.currency::text, '/admin/payouts', 'payout', new.id::text);
      end if;
    when 'reports' then
      perform ops_emit('report.opened', 'report.opened:' || new.id, null, null, null, '/admin/reports', 'report', new.id::text);
    when 'cron_runs' then
      if not new.ok then
        perform ops_emit('cron.failed', 'cron.failed:' || new.id, new.job, null, null, '/admin', 'cron_run', new.id::text);
      end if;
    else null;
  end case;
  return null;
end $$;
drop trigger if exists support_tickets_ops_event on support_tickets;
create trigger support_tickets_ops_event after insert on support_tickets for each row execute function ops_on_insert();
drop trigger if exists refunds_ops_event on refunds;
create trigger refunds_ops_event after insert on refunds for each row execute function ops_on_insert();
drop trigger if exists payouts_ops_event on payouts;
create trigger payouts_ops_event after insert on payouts for each row execute function ops_on_insert();
drop trigger if exists reports_ops_event on reports;
create trigger reports_ops_event after insert on reports for each row execute function ops_on_insert();
drop trigger if exists cron_runs_ops_event on cron_runs;
create trigger cron_runs_ops_event after insert on cron_runs for each row execute function ops_on_insert();
revoke all on function ops_on_proxy_order() from public, anon, authenticated;
revoke all on function ops_on_proxy_cancel_request() from public, anon, authenticated;
revoke all on function ops_on_transaction() from public, anon, authenticated;
revoke all on function ops_on_insert() from public, anon, authenticated;

-- 보낼 이벤트 가져오기 — 오류 급증 검사(서버 오류 15분 안 5회 이상, 시간당 한 번) → 24시간 지난 건 포기 → 보낼 건을 2분 잡아 둔다(겹친 실행이 같은 건을 보내지 않게)
create or replace function ops_outbox_claim(p_limit int default 50) returns setof ops_outbox
  language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  select coalesce(sum(count), 0) into v_n from error_events where source = 'server' and last_at > now() - interval '15 minutes';
  if v_n >= 5 then
    perform ops_emit('errors.spike', 'errors.spike:' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24'), null, v_n, null, '/admin/errors', 'error_events', null);
  end if;
  update ops_outbox set dead_at = now() where sent_at is null and dead_at is null and occurred_at < now() - interval '24 hours';
  return query
    update ops_outbox o set next_at = now() + interval '2 minutes'
     where o.id in (select id from ops_outbox where sent_at is null and dead_at is null and next_at <= now()
                     order by id limit greatest(1, least(p_limit, 200)) for update skip locked)
    returning o.*;
end $$;

-- 보낸 결과 기록. 실패면 2^시도 분 뒤(최대 2시간), 24시간이 지났으면 포기
create or replace function ops_outbox_mark(p_id bigint, p_ok boolean, p_error text default null) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if p_ok then
    update ops_outbox set sent_at = now(), attempts = attempts + 1, last_error = null where id = p_id and sent_at is null;
  else
    update ops_outbox set attempts = attempts + 1, last_error = left(coalesce(p_error, ''), 500),
      next_at = now() + least(interval '2 hours', interval '1 minute' * power(2, least(attempts, 7))),
      dead_at = case when occurred_at < now() - interval '24 hours' then now() end
     where id = p_id and sent_at is null;
  end if;
end $$;
revoke all on function ops_outbox_claim(int) from public, anon, authenticated;
revoke all on function ops_outbox_mark(bigint, boolean, text) from public, anon, authenticated;
grant execute on function ops_outbox_claim(int) to service_role;
grant execute on function ops_outbox_mark(bigint, boolean, text) to service_role;
grant select, insert, update on ops_actors, ops_requests, ops_outbox to service_role;

commit;

-- ── 4. 크론(트랜잭션 밖, 0042 와 같은 방식): 1분마다 /api/cron/ops-outbox. 서버는 cron_secret_ok() 로 확인한다 ──
do $$ begin
  if to_regnamespace('cron') is null then raise notice 'cron 스키마 없음 — 예약 건너뜀'; return; end if;
  perform cron.schedule('tomo_ops_outbox', '* * * * *', $job$
    select net.http_post(
      url := 'https://tomo.airship.click/api/cron/ops-outbox',
      headers := jsonb_build_object('content-type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tomo_cron_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 20000)
  $job$);
end $$;

-- ── 되돌리기 ──
-- select cron.unschedule('tomo_ops_outbox');
-- drop trigger if exists proxy_orders_ops_event on proxy_orders; drop trigger if exists proxy_requests_ops_event on proxy_requests;
-- drop trigger if exists transactions_ops_event on transactions; drop trigger if exists support_tickets_ops_event on support_tickets;
-- drop trigger if exists refunds_ops_event on refunds; drop trigger if exists payouts_ops_event on payouts;
-- drop trigger if exists reports_ops_event on reports; drop trigger if exists cron_runs_ops_event on cron_runs;
-- drop function if exists ops_outbox_claim(int); drop function if exists ops_outbox_mark(bigint, boolean, text);
-- drop function if exists ops_on_insert(); drop function if exists ops_on_transaction(); drop function if exists ops_on_proxy_cancel_request();
-- drop function if exists ops_on_proxy_order(); drop function if exists ops_emit(text, text, text, int, text, text, text, text);
-- drop table if exists ops_outbox; drop table if exists ops_requests; drop table if exists ops_actors;
-- 앱 쪽은 OPS_BRIDGE_SECRET 을 지우면 /api/ops/** 가 전부 503 이 된다.
