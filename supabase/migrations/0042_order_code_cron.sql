-- 0042 주문 번호·크론·알림 (2026-11-27, 설계 docs/aaa/12 4장 P1 / T2. Ren 결정 4·5·6·7·9)
-- 1) 사람이 읽는 번호: 대행 주문 proxy_orders.code = T+6자리, C2C 거래 transactions.code = TX+6자리. 기존 행도 만든 순서로 채운다.
-- 2) 크론 실행 기록 cron_runs(운영자만 읽기, 서버·DB 함수만 쓰기).
-- 3) 자동 구매확정: 배송 완료(delivered) 7일 뒤 completed. 분쟁(disputed)·환불 진행(refund_pending)이면 건너뛴다. delivered_at 칸 추가.
-- 4) 예약 만료: 결제 대기 거래 예약 45분(0031, Stripe 결제창 30분) 그대로. 지금까지는 누군가 새 거래를 열 때만 풀렸다(lazy) → 5분마다 정리.
-- 5) 알림: 대행 결제 완료(proxy_paid, 주문당 한 번), C2C 센터 단계(tx_to_center 구매자 / tx_center_received 구매자·판매자), 자동 구매확정(tx_auto_completed 양쪽).
-- 6) 환율: pg_cron 이 매일 /api/cron/rates 를 부른다(pg_net). 비밀값은 Vault(tomo_cron_secret), 서버는 cron_secret_ok()로 확인한다.
-- 0041(T1) 없이도 적용된다. 0027·0031 함수 정의를 바탕으로 notify_transaction·notify_proxy 를 다시 만든다.
begin;

-- ── 1. 주문 번호 ──
create or replace function order_code(p_prefix text, p_n bigint) returns text
  language sql immutable set search_path = public as $$
  select p_prefix || case when p_n < 1000000 then lpad(p_n::text, 6, '0') else p_n::text end
$$;

create sequence if not exists proxy_order_code_seq;
create sequence if not exists tx_code_seq;
alter table proxy_orders add column if not exists code text;
alter table transactions add column if not exists code text;

-- 채우는 동안 updated_at(touch)·알림·기록 트리거가 돌지 않게 사용자 트리거를 잠시 끈다(목록 정렬·지연 배지가 바뀌지 않게)
alter table proxy_orders disable trigger user;
alter table transactions disable trigger user;
do $$ declare r record; begin
  for r in select id from proxy_orders where code is null order by created_at, id loop
    update proxy_orders set code = order_code('T', nextval('proxy_order_code_seq')) where id = r.id;
  end loop;
  for r in select id from transactions where code is null order by created_at, id loop
    update transactions set code = order_code('TX', nextval('tx_code_seq')) where id = r.id;
  end loop;
end $$;
alter table proxy_orders enable trigger user;
alter table transactions enable trigger user;

alter sequence proxy_order_code_seq owned by proxy_orders.code;
alter sequence tx_code_seq owned by transactions.code;
alter table proxy_orders alter column code set default order_code('T', nextval('proxy_order_code_seq')), alter column code set not null;
alter table transactions alter column code set default order_code('TX', nextval('tx_code_seq')), alter column code set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'proxy_orders_code_key') then
    alter table proxy_orders add constraint proxy_orders_code_key unique (code);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_code_key') then
    alter table transactions add constraint transactions_code_key unique (code);
  end if;
end $$;
grant usage on sequence proxy_order_code_seq, tx_code_seq to service_role;

-- ── 2. 크론 실행 기록 ──
create table if not exists cron_runs (
  id bigint generated always as identity primary key,
  job text not null,
  ok boolean not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists cron_runs_job_idx on cron_runs (job, created_at desc);
alter table cron_runs enable row level security;
drop policy if exists "admin reads cron runs" on cron_runs;
create policy "admin reads cron runs" on cron_runs for select using (is_admin_user());
revoke insert, update, delete on cron_runs from authenticated, anon;
grant select on cron_runs to authenticated;

-- ── 3. 배송 완료 시각 + 자동 구매확정 ──
alter table transactions add column if not exists delivered_at timestamptz;
update transactions set delivered_at = updated_at where status = 'delivered' and delivered_at is null;

create or replace function set_delivered_at() returns trigger
  language plpgsql set search_path = public as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then new.delivered_at := now(); end if;
  return new;
end $$;
drop trigger if exists transactions_delivered_at on transactions;
create trigger transactions_delivered_at before update of status on transactions
  for each row execute function set_delivered_at();
revoke all on function set_delivered_at() from public, anon, authenticated;

-- 한 건씩 확정한다(한 건 오류가 나머지를 막지 않게). 정산 적립은 credit_sale_on_complete 트리거가 한다.
create or replace function cron_auto_complete() returns int
  language plpgsql security definer set search_path = public as $$
declare r record; v_ok int := 0; v_fail jsonb := '[]'::jsonb;
begin
  for r in select id, delivered_at from transactions
      where status = 'delivered' and delivered_at < now() - interval '7 days' and not coalesce(refund_pending, false)
      order by delivered_at limit 500 loop
    begin
      perform set_config('tomo.auto_complete', '1', true);
      update transactions set status = 'completed' where id = r.id and status = 'delivered';
      if found then
        v_ok := v_ok + 1;
        begin   -- 기록 실패가 확정을 되돌리지 않게
          perform log_admin_action('tx_auto_complete', 'transaction', r.id::text, jsonb_build_object('delivered_at', r.delivered_at));
        exception when others then null;
        end;
      end if;
      perform set_config('tomo.auto_complete', '', true);
    exception when others then
      perform set_config('tomo.auto_complete', '', true);
      v_fail := v_fail || jsonb_build_object('id', r.id, 'error', left(sqlerrm, 200));
    end;
  end loop;
  insert into cron_runs (job, ok, detail)
    values ('auto_complete', jsonb_array_length(v_fail) = 0, jsonb_build_object('completed', v_ok, 'failed', v_fail));
  delete from cron_runs where created_at < now() - interval '30 days';
  return v_ok;
end $$;
revoke all on function cron_auto_complete() from public, anon, authenticated;

-- ── 4. 예약 만료(45분 유지, 정리만 자동) ──
create or replace function cron_release_reservations() returns int
  language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  select count(*) into v_n from transactions where status = 'pending_payment' and created_at < now() - interval '45 minutes';
  perform release_stale_reservations();
  insert into cron_runs (job, ok, detail) values ('release_reservations', true, jsonb_build_object('expired', v_n));
  return v_n;
exception when others then
  insert into cron_runs (job, ok, detail) values ('release_reservations', false, jsonb_build_object('error', left(sqlerrm, 300)));
  return -1;
end $$;
revoke all on function cron_release_reservations() from public, anon, authenticated;

-- ── 5. 알림 ──
create or replace function notify_transaction() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_title text; v_d jsonb; v_actor uuid := auth.uid();
begin
  if new.status is not distinct from old.status then return new; end if;
  select title into v_title from listings where id = new.listing_id;
  v_d := jsonb_build_object('title', coalesce(v_title, ''), 'listing_id', new.listing_id, 'code', new.code);
  case new.status
    when 'paid' then perform notify(new.seller_id, 'tx_paid', 'tx', new.id::text, v_d);
    when 'shipped', 'shipped_international' then perform notify(new.buyer_id, 'tx_shipped', 'tx', new.id::text, v_d);
    when 'shipped_to_center' then perform notify(new.buyer_id, 'tx_to_center', 'tx', new.id::text, v_d);
    when 'center_received' then
      perform notify(new.buyer_id, 'tx_center_received', 'tx', new.id::text, v_d);
      perform notify(new.seller_id, 'tx_center_received', 'tx', new.id::text, v_d);
    when 'delivered' then perform notify(new.seller_id, 'tx_delivered', 'tx', new.id::text, v_d);
    when 'completed' then
      if current_setting('tomo.auto_complete', true) = '1' then
        perform notify(new.buyer_id, 'tx_auto_completed', 'tx', new.id::text, v_d);
        perform notify(new.seller_id, 'tx_auto_completed', 'tx', new.id::text, v_d);
      else
        perform notify(new.seller_id, 'tx_completed', 'tx', new.id::text, v_d);
      end if;
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

-- 결제 완료(proxy_paid)는 주문당 평생 한 번(운영자가 단계를 되돌렸다 다시 paid 로 와도 다시 안 보낸다). 나머지는 기존대로 1분 묶음
create or replace function notify_proxy() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_kind text; v_title text; v_code text;
begin
  if new.status is not distinct from old.status then return new; end if;
  v_kind := case new.status
    when 'paid' then 'proxy_paid'
    when 'quoted' then 'proxy_quoted' when 'purchasing' then 'proxy_purchasing'
    when 'center_received' then 'proxy_center' when 'shipped_international' then 'proxy_shipped'
    when 'delivered' then 'proxy_delivered' when 'cancelled' then 'proxy_cancelled' else null end;
  if v_kind is null then return new; end if;
  if v_kind = 'proxy_paid' then
    if exists (select 1 from notifications n where n.user_id = new.user_id and n.kind = 'proxy_paid'
        and (case when new.order_id is not null then n.data->>'order_id' = new.order_id::text else n.ref_id = new.id::text end)) then
      return new;
    end if;
  elsif new.order_id is not null and exists (
    select 1 from notifications n where n.user_id = new.user_id and n.kind = v_kind
      and n.data->>'order_id' = new.order_id::text and n.created_at > now() - interval '1 minute') then
    return new;
  end if;
  select coalesce(nullif(title_translated, ''), title) into v_title from external_items where id = new.external_item_id;
  if new.order_id is not null then select code into v_code from proxy_orders where id = new.order_id; end if;
  perform notify(new.user_id, v_kind, 'proxy', new.id::text,
    jsonb_build_object('title', coalesce(v_title, ''), 'order_id', new.order_id, 'code', v_code));
  return new;
end $$;
revoke all on function notify_transaction() from public, anon, authenticated;
revoke all on function notify_proxy() from public, anon, authenticated;

-- ── 6. 크론 비밀값(Vault) 확인 — 서버(service_role)만 부른다 ──
create or replace function cron_secret_ok(p_secret text) returns boolean
  language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce(length(p_secret) >= 32 and exists (
    select 1 from vault.decrypted_secrets where name = 'tomo_cron_secret' and decrypted_secret = p_secret), false);
end $$;
revoke all on function cron_secret_ok(text) from public, anon, authenticated;
grant execute on function cron_secret_ok(text) to service_role;

commit;

-- ── 7. 확장·예약 작업(트랜잭션 밖 — 확장이 없는 환경(로컬 재생)에서도 위 내용은 남는다) ──
do $$ begin
  create extension if not exists pg_cron with schema pg_catalog;
  create extension if not exists pg_net with schema extensions;
exception when others then raise notice 'pg_cron/pg_net 없음: %', sqlerrm;
end $$;

do $$ begin
  if not exists (select 1 from vault.secrets where name = 'tomo_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'tomo_cron_secret', 'pg_cron → /api/cron/rates');
  end if;
exception when others then raise notice 'vault 없음: %', sqlerrm;
end $$;

do $$ begin
  if to_regnamespace('cron') is null then raise notice 'cron 스키마 없음 — 예약 건너뜀'; return; end if;
  perform cron.schedule('tomo_release_reservations', '*/5 * * * *', 'select public.cron_release_reservations()');
  perform cron.schedule('tomo_auto_complete', '15 * * * *', 'select public.cron_auto_complete()');
  -- 매일 09:30 KST(00:30 UTC). 응답은 net._http_response, 결과는 cron_runs(job='rates')
  perform cron.schedule('tomo_rates', '30 0 * * *', $job$
    select net.http_post(
      url := 'https://tomo.airship.click/api/cron/rates',
      headers := jsonb_build_object('content-type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tomo_cron_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 20000)
  $job$);
end $$;

-- ── 되돌리기 ──
-- select cron.unschedule('tomo_release_reservations'); select cron.unschedule('tomo_auto_complete'); select cron.unschedule('tomo_rates');
-- drop function if exists cron_auto_complete(); drop function if exists cron_release_reservations(); drop function if exists cron_secret_ok(text);
-- drop trigger if exists transactions_delivered_at on transactions; drop function if exists set_delivered_at();
-- notify_transaction·notify_proxy 는 0027 정의로 다시 만든다. 번호 칸(code)·delivered_at·cron_runs 는 남겨도 해가 없다.
