-- 0055: 해외 마켓 경매 입찰 대행 W1 — 에어쉽 입찰 워커 연결 tomo 쪽(T1). 설계 docs/aaa/16 3·6.2절, 0053 뒤.
-- 실행자(executor) 'airship' = 에어쉽 입찰 워커. 설정 executor 는 'manual' 그대로 둔다(A2~R 리허설 뒤 운영자가 바꾼다).
-- 1) 접수 확인(armed): 에어쉽 다리 작업이 자기 auction_bids 행을 만든 뒤 market_bid_set_armed 로 알린다.
-- 2) 워커 결과: 입찰됨·밀림·유찰·실패·불명은 기존 0052 함수, 낙찰은 market_bid_worker_won → 보류(hold_reason 'worker_won',
--    「낙찰 확인 대기」). 매입(카드 청구)은 운영자가 메루카리 화면에서 낙찰을 확인한 뒤 기존 「낙찰 처리」(money)로만 한다.
-- 3) 워커 건강 신호(market_bid_worker_health, 에어쉽이 1분마다): executor='airship' 이고 접수 중인데 신호가 5분 끊기거나
--    비정상이면 accepting=false + pause_reason 'auto: worker …' + 이벤트 bid.worker_down 1회. 신호가 돌아와도 자동 재개하지 않는다(운영자 재개).
--    executor='manual' 이면 건강 신호와 상관없다.
-- 4) 크론(0053 + 워커 규칙): 마감 30분 전 미입찰 자동 취소는 「입찰이 안 들어간 것이 확실」한 건만 — 수동 건, 워커 건 중 접수 확인이 없는 건.
--    접수 확인된 워커 건은 마감 30분 안에서 워커가 비정상이면 보류(제출 여부 불명), 마감 15분 지나도 결과가 없으면 보류.
--    재알림 bid.to_place_due: 마감 2시간·1시간 전 미입찰(수동 건 전부, 워커 건은 접수 확인 없음·워커 비정상일 때), 접수 확인 10분 지연. 건당 시점당 1회.
-- 5) 고객 취소 마감: 마감 30분 전부터, 그리고 접수 확인된 워커 건은 거절('mb: cancel closed'). 워커 건 고객 취소는 에어쉽 동기 취소(T2) 뒤에 연다.
-- 6) 운영 API 시스템 주체: ops_actors.is_system 행(에어쉽 다리 작업). profile_id 없음·소유자 아님 → money scope 불가(앱 opsAuth 도 거절).
begin;

-- ── 1. 이벤트 종류(0052 의 19종 + 2) ──
alter table ops_outbox drop constraint if exists ops_outbox_type_check;
alter table ops_outbox add constraint ops_outbox_type_check check (type in ('order.paid', 'order.cancel_requested', 'dispute.opened',
  'ticket.opened', 'refund.pending', 'payout.requested', 'report.opened', 'errors.spike', 'cron.failed',
  'auction.ended', 'auction.unpaid', 'auction.cancelled', 'auction.flagged',
  'bid.requested', 'bid.hold', 'bid.won', 'bid.missed', 'bid.capture_failed', 'bid.auth_expiring', 'bid.to_place_due', 'bid.worker_down'));

-- ── 2. 칸 ──
alter table market_bid_settings add column if not exists pause_reason text, add column if not exists paused_at timestamptz;
alter table market_bids add column if not exists worker_final_jpy int;

-- ── 3. 워커 건강 신호(한 행, 덮어쓰기) ──
create table if not exists market_bid_worker_health (
  id boolean primary key default true check (id),
  received_at timestamptz not null default now(),   -- tomo 가 받은 시각
  worker_at timestamptz,                           -- 워커 생존 신호 시각(에어쉽 worker_heartbeat)
  enabled boolean not null, dry_run boolean not null, logged_in boolean not null, bid_enabled boolean not null,
  ok boolean not null,
  reason text,                                     -- 비정상 이유(ok=false)
  meta jsonb not null default '{}'
);
alter table market_bid_worker_health enable row level security;
drop policy if exists "mb worker health admin" on market_bid_worker_health;
create policy "mb worker health admin" on market_bid_worker_health for select using (is_admin_user());
revoke all on market_bid_worker_health from anon;
revoke insert, update, delete on market_bid_worker_health from authenticated;
grant select on market_bid_worker_health to authenticated;

-- ── 4. 운영 API 시스템 주체 ──
alter table ops_actors add column if not exists is_system boolean not null default false;
alter table ops_actors alter column profile_id drop not null;
alter table ops_actors drop constraint if exists ops_actors_system_check;
alter table ops_actors add constraint ops_actors_system_check
  check ((is_system and profile_id is null and not is_owner) or (not is_system and profile_id is not null));
insert into ops_actors (center_actor_email, is_system, note)
values ('site-bids@system.airship.click', true, '에어쉽 입찰 워커 다리(시스템). ops 한정·money 불가·워커 경로만(0055)')
on conflict (center_actor_email) do nothing;

-- ── 5. 워커 상태 판정 ──
-- 비정상 이유(정상이면 null). 판정 기준 = 마지막 신호 수신 5분 안 + 워커 생존 신호 5분 안 + 신호 내용 정상
create or replace function market_bid_worker_problem() returns text
  language plpgsql stable security definer set search_path = public as $$
declare h market_bid_worker_health;
begin
  select * into h from market_bid_worker_health where id;
  if not found then return 'no signal'; end if;
  if h.received_at <= now() - interval '5 minutes' then return 'signal lost'; end if;
  if h.worker_at is null or h.worker_at <= now() - interval '5 minutes' then return 'worker heartbeat stale'; end if;
  if not h.ok then return coalesce(h.reason, 'not ok'); end if;
  return null;
end $$;

-- 워커 실행 중 + 접수 중 + 워커 비정상 → 접수 자동 중단(사유 기록) + bid.worker_down 1회. 중단한 이유를 돌려준다(안 했으면 null)
create or replace function market_bid_worker_watch() returns text
  language plpgsql security definer set search_path = public as $$
declare v_s market_bid_settings; v_p text;
begin
  select * into v_s from market_bid_settings where id;
  if v_s.executor <> 'airship' or not v_s.accepting then return null; end if;
  v_p := market_bid_worker_problem();
  if v_p is null then return null; end if;
  update market_bid_settings set accepting = false, pause_reason = 'auto: worker ' || v_p, paused_at = now(), updated_at = now()
   where id and accepting and executor = 'airship';
  if not found then return null; end if;
  perform ops_emit('bid.worker_down', 'bid.worker_down:' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint, null, null, null,
    '/admin/market-bids', 'market_bid_settings', 'settings');
  return v_p;
end $$;

-- 건강 신호 기록(운영 API POST /market-bids/worker-health, 서버 권한만)
-- p = { worker_at: ISO, enabled, dry_run, logged_in, bid_enabled: boolean, meta?: object }
create or replace function market_bid_worker_health(p jsonb) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare v_at timestamptz; v_reason text; v_paused text; v_s market_bid_settings;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'mb: admin only'; end if;
  if p is null or jsonb_typeof(p->'enabled') is distinct from 'boolean' or jsonb_typeof(p->'dry_run') is distinct from 'boolean'
     or jsonb_typeof(p->'logged_in') is distinct from 'boolean' or jsonb_typeof(p->'bid_enabled') is distinct from 'boolean' then
    raise exception 'mb: bad health';
  end if;
  begin
    v_at := nullif(p->>'worker_at', '')::timestamptz;
  exception when others then raise exception 'mb: bad health';
  end;
  if v_at > now() + interval '5 minutes' then raise exception 'mb: bad health'; end if;
  v_reason := case
    when v_at is null or v_at <= now() - interval '5 minutes' then 'worker heartbeat stale'
    when not (p->>'enabled')::boolean then 'worker disabled'
    when (p->>'dry_run')::boolean then 'worker dry run'
    when not (p->>'logged_in')::boolean then 'mercari login needed'
    when not (p->>'bid_enabled')::boolean then 'bidding switched off'
  end;
  insert into market_bid_worker_health (id, received_at, worker_at, enabled, dry_run, logged_in, bid_enabled, ok, reason, meta)
  values (true, now(), v_at, (p->>'enabled')::boolean, (p->>'dry_run')::boolean, (p->>'logged_in')::boolean, (p->>'bid_enabled')::boolean,
    v_reason is null, v_reason, case when jsonb_typeof(p->'meta') = 'object' then p->'meta' else '{}'::jsonb end)
  on conflict (id) do update set received_at = excluded.received_at, worker_at = excluded.worker_at, enabled = excluded.enabled,
    dry_run = excluded.dry_run, logged_in = excluded.logged_in, bid_enabled = excluded.bid_enabled, ok = excluded.ok,
    reason = excluded.reason, meta = excluded.meta;
  v_paused := market_bid_worker_watch();
  select * into v_s from market_bid_settings where id;
  return jsonb_build_object('ok', v_reason is null, 'reason', v_reason, 'paused_now', v_paused is not null,
    'accepting', v_s.accepting, 'executor', v_s.executor, 'pause_reason', v_s.pause_reason);
end $$;

-- ── 6. 접수 확인(armed) ──
-- 워커 건(executor='airship')·입찰 필요(authorized)일 때만. 같은 ref 로 다시 부르면 그대로, 다른 ref 면 거절
create or replace function market_bid_set_armed(p_id uuid, p_ref text, p_expected text default null) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare v_b market_bids;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'mb: admin only'; end if;
  v_b := market_bid_lock(p_id, p_expected, array['authorized']);
  if v_b.executor <> 'airship' then raise exception 'mb: not worker'; end if;
  if length(trim(coalesce(p_ref, ''))) = 0 then raise exception 'mb: note required'; end if;
  if v_b.armed_at is not null then
    if v_b.executor_ref = trim(p_ref) then return jsonb_build_object('status', v_b.status, 'armed_at', v_b.armed_at, 'executor_ref', v_b.executor_ref, 'again', true); end if;
    raise exception 'mb: armed by other';
  end if;
  update market_bids set armed_at = now(), executor_ref = left(trim(p_ref), 100) where id = p_id returning * into v_b;
  insert into market_bid_events (bid_id, kind, evidence) values (p_id, 'armed', jsonb_build_object('ref', v_b.executor_ref));
  return jsonb_build_object('status', v_b.status, 'armed_at', v_b.armed_at, 'executor_ref', v_b.executor_ref);
end $$;

-- ── 7. 워커 낙찰 → 낙찰 확인 대기(보류 'worker_won'). 매입하지 않는다 ──
create or replace function market_bid_worker_won(p_id uuid, p_final int, p_expected text default null) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare v_b market_bids;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'mb: admin only'; end if;
  v_b := market_bid_lock(p_id, p_expected, array['placed', 'outbid', 'hold']);
  if v_b.executor <> 'airship' then raise exception 'mb: not worker'; end if;
  if p_final is null or p_final <= 0 then raise exception 'mb: bad amount'; end if;
  if v_b.status = 'hold' and v_b.hold_reason = 'worker_won' and v_b.worker_final_jpy = p_final then
    return jsonb_build_object('status', 'hold', 'reason', 'worker_won', 'again', true, 'buy_due', v_b.ends_at + interval '24 hours');
  end if;
  update market_bids set status = 'hold', hold_reason = 'worker_won', worker_final_jpy = p_final where id = p_id returning * into v_b;
  insert into market_bid_events (bid_id, kind, amount_jpy, evidence)
    values (p_id, 'hold', p_final, jsonb_build_object('reason', 'worker_won', 'final', p_final, 'buy_due', v_b.ends_at + interval '24 hours'));
  perform market_bid_note(v_b, 'mb_won_check', jsonb_build_object('final', p_final));
  return jsonb_build_object('status', 'hold', 'reason', 'worker_won', 'buy_due', v_b.ends_at + interval '24 hours');
end $$;

-- ── 8. 고객 취소(0050 + 취소 마감) ──
create or replace function cancel_market_bid(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b market_bids; v_uid uuid := auth.uid(); v_rel uuid; v_exp text[];
begin
  select * into v_b from market_bids where id = p_id for update;
  if not found then raise exception 'mb: not found'; end if;
  if not (v_b.user_id = v_uid or is_admin_user() or auth.role() = 'service_role') then raise exception 'mb: not found'; end if;
  if v_b.status = 'cancelled' then return jsonb_build_object('status', 'cancelled', 'again', true); end if;  -- 멱등
  if v_b.status not in ('pending_auth', 'authorized') then raise exception 'mb: not cancellable'; end if;
  -- 고객 취소 마감: 마감 30분 전부터, 접수 확인된 워커 건(에어쉽 동기 취소 전까지)
  if v_b.status = 'authorized' and not (is_admin_user() or coalesce(auth.role(), '') = 'service_role')
     and (v_b.ends_at <= now() + interval '30 minutes' or (v_b.executor = 'airship' and v_b.armed_at is not null)) then
    raise exception 'mb: cancel closed';
  end if;
  with u as (update market_bid_auths set status = 'superseded' where bid_id = p_id and status = 'pending' returning stripe_session_id)
    select coalesce(array_agg(stripe_session_id), '{}') into v_exp from u;
  if v_b.status = 'authorized' then
    update market_bid_auths set status = 'releasing', release_reason = 'cancelled' where id = v_b.auth_id and status = 'authorized' returning id into v_rel;
  end if;
  update market_bids set status = 'cancelled', closed_at = now(), fail_reason = 'cancelled' where id = p_id;
  insert into market_bid_events (bid_id, kind, actor) values (p_id, 'cancelled', v_uid);
  if v_b.status = 'authorized' then
    perform notify(v_b.user_id, 'mb_cancelled', 'market_bid', v_b.id::text, jsonb_build_object('code', v_b.code, 'source', v_b.source, 'source_id', v_b.source_id));
  end if;
  return jsonb_build_object('status', 'cancelled', 'release_auth_id', v_rel, 'expire', to_jsonb(v_exp));
end $$;

-- ── 9. 크론(0053 + 워커 규칙·재알림) ──
create or replace function cron_market_bids() returns jsonb
  language plpgsql security definer set search_path = public as $$
declare v jsonb; v_exp int := 0; v_missed int := 0; v_over int := 0; v_unpaid int := 0; v_whold int := 0; v_b market_bids; v_rel uuid;
  v_paused text; v_wp text;
begin
  begin
    v_paused := market_bid_worker_watch();
    v_wp := market_bid_worker_problem();
    v_exp := market_bid_expire_pending();
    -- 마감 30분 전 미입찰 자동 취소: 입찰이 안 들어간 것이 확실한 건만(수동 건, 접수 확인 없는 워커 건)
    for v_b in select * from market_bids where status = 'authorized' and ends_at <= now() + interval '30 minutes'
                 and (executor = 'manual' or armed_at is null)
               order by ends_at for update skip locked loop
      update market_bid_auths set status = 'releasing', release_reason = 'missed' where id = v_b.auth_id and status = 'authorized' returning id into v_rel;
      update market_bids set status = 'missed', closed_at = now(),
          fail_reason = case when executor = 'manual' then 'not placed 30 minutes before end' else 'worker not armed 30 minutes before end' end
        where id = v_b.id and status = 'authorized' returning * into v_b;
      insert into market_bid_events (bid_id, kind, evidence) values (v_b.id, 'missed', jsonb_build_object('reason', 'auto: ' || v_b.fail_reason, 'auth', v_rel));
      perform market_bid_note(v_b, 'mb_missed');
      v_missed := v_missed + 1;
    end loop;
    -- 접수 확인된 워커 건: 마감 30분 안에서 워커 비정상, 또는 마감 15분 지나도 결과 없음 → 보류(제출 여부 불명, 승인 유지)
    for v_b in select * from market_bids where status = 'authorized' and executor = 'airship' and armed_at is not null
                 and ends_at <= now() + interval '30 minutes' and (v_wp is not null or ends_at + interval '15 minutes' < now())
               order by ends_at for update skip locked loop
      update market_bids set status = 'hold', hold_reason = case when v_wp is not null then 'worker down before end' else 'result overdue' end
        where id = v_b.id returning * into v_b;
      insert into market_bid_events (bid_id, kind, evidence) values (v_b.id, 'hold', jsonb_build_object('reason', 'auto: ' || v_b.hold_reason, 'worker', v_wp));
      perform market_bid_note(v_b, 'mb_hold');
      v_whold := v_whold + 1;
    end loop;
    for v_b in select * from market_bids where status in ('placed', 'outbid') and ends_at + interval '15 minutes' < now()
               order by ends_at for update skip locked loop
      update market_bids set status = 'hold', hold_reason = 'result overdue' where id = v_b.id returning * into v_b;
      insert into market_bid_events (bid_id, kind, evidence) values (v_b.id, 'hold', jsonb_build_object('reason', 'auto: result overdue'));
      perform market_bid_note(v_b, 'mb_hold');
      v_over := v_over + 1;
    end loop;
    -- 재결제 기한(48시간) + 결제창 30분이 지나도 안 냈다 → 신청 닫기·입찰 정지. 상품은 우리가 보유(운영 처리)
    for v_b in select * from market_bids where status = 'capture_failed' and closed_at is null and pay_due_at + interval '35 minutes' < now()
               order by pay_due_at for update skip locked loop
      update market_bids set closed_at = now() where id = v_b.id returning * into v_b;
      insert into market_bid_blocks (user_id, reason) values (v_b.user_id, 'unpaid win ' || v_b.code) on conflict (user_id) do nothing;
      insert into market_bid_events (bid_id, kind, evidence) values (v_b.id, 'pay_expired', jsonb_build_object('due', v_b.pay_due_at));
      perform market_bid_note(v_b, 'mb_pay_expired');
      v_unpaid := v_unpaid + 1;
    end loop;
    -- 재알림: 마감 2시간·1시간 전 미입찰(수동 건 전부, 워커 건은 접수 확인 없음·워커 비정상), 건당 시점당 1회
    perform ops_emit('bid.to_place_due', 'bid.to_place_due:' || b.id || ':' || x.h, b.code, b.cap_jpy, 'JPY', '/admin/market-bids?open=' || b.id, 'market_bid', b.id::text)
      from market_bids b cross join (values (2), (1)) x(h)
     where b.status = 'authorized' and b.ends_at <= now() + make_interval(hours => x.h)
       and b.ends_at > now() + case x.h when 2 then interval '1 hour' else interval '30 minutes' end
       and (b.executor = 'manual' or b.armed_at is null or v_wp is not null);
    -- 워커 건 접수 확인 10분 지연
    perform ops_emit('bid.to_place_due', 'bid.to_place_due:' || b.id || ':arm', b.code, b.cap_jpy, 'JPY', '/admin/market-bids?open=' || b.id, 'market_bid', b.id::text)
      from market_bids b
     where b.status = 'authorized' and b.executor = 'airship' and b.armed_at is null and b.authorized_at < now() - interval '10 minutes'
       and b.ends_at > now() + interval '30 minutes';
    perform ops_emit('bid.auth_expiring', 'bid.auth_expiring:' || b.id || ':' || h, b.code, b.auth_krw, 'KRW', '/admin/market-bids?open=' || b.id, 'market_bid', b.id::text)
      from market_bids b cross join (values (24), (6)) x(h)
     where b.status in ('authorized', 'placed', 'outbid', 'hold', 'won') and b.auth_expires_at < now() + make_interval(hours => x.h);
    v := jsonb_build_object('expired', v_exp, 'missed', v_missed, 'overdue', v_over, 'worker_hold', v_whold, 'unpaid', v_unpaid,
      'worker_paused', v_paused,
      'releasing', (select count(*) from market_bid_auths where status = 'releasing'),
      'won_waiting', (select count(*) from market_bids where status = 'won'));
    insert into cron_runs (job, ok, detail) values ('market_bids', true, v);
    return v;
  exception when others then
    insert into cron_runs (job, ok, detail) values ('market_bids', false, jsonb_build_object('error', left(sqlerrm, 300)));
    return jsonb_build_object('error', left(sqlerrm, 300));
  end;
end $$;

-- ── 10. 할 일 건수(0052 + 워커): 입찰 필요 = 운영자가 넣어야 하는 건(수동 건, 접수 확인 없는 워커 건) ──
create or replace function market_bid_ops_counts() returns jsonb
  language plpgsql stable security definer set search_path = public as $$
begin
  if not auction_admin_reader() then raise exception 'mb: admin only'; end if;
  return (select jsonb_build_object(
    'to_place', count(*) filter (where b.status = 'authorized' and (b.executor = 'manual' or b.armed_at is null)),
    'to_place_soon', count(*) filter (where b.status = 'authorized' and (b.executor = 'manual' or b.armed_at is null) and b.ends_at <= now() + interval '2 hours'),
    'worker_wait', count(*) filter (where b.status = 'authorized' and b.executor = 'airship' and b.armed_at is not null),
    'bidding', count(*) filter (where b.status in ('placed', 'outbid')),
    'hold', count(*) filter (where b.status = 'hold'),
    'won_check', count(*) filter (where b.status = 'hold' and b.hold_reason = 'worker_won'),
    'to_buy', count(*) filter (where b.status = 'won' or (b.status = 'ordered' and r.status = 'paid')),
    'to_buy_late', count(*) filter (where (b.status = 'won' and b.updated_at < now() - interval '10 minutes')
                                     or (b.status = 'ordered' and r.status = 'paid' and b.closed_at < now() - interval '18 hours')),
    'capture_failed', count(*) filter (where b.status = 'capture_failed'),
    'auth_expiring', count(*) filter (where b.status in ('authorized', 'placed', 'outbid', 'hold', 'won') and b.auth_expires_at < now() + interval '24 hours'))
    from market_bids b left join proxy_requests r on r.order_id = b.order_id);
end $$;

-- ── 11. 설정(0052 + 실행자·자동 중단 해제) ──
-- 워커 실행(executor='airship')으로 접수를 켜려면 워커가 정상이어야 한다('mb: worker down'). 접수를 켜면 자동 중단 사유를 지운다
create or replace function admin_market_bid_settings(p jsonb) returns market_bid_settings
  language plpgsql security definer set search_path = public as $$
declare v_s market_bid_settings; v_old jsonb;
  ok_int boolean := true;
begin
  if not is_admin_user() then raise exception 'mb: admin only'; end if;
  select * into v_s from market_bid_settings where id for update;
  v_old := to_jsonb(v_s);
  if p ? 'accepting' then v_s.accepting := (p->>'accepting')::boolean; end if;
  if p ? 'executor' then v_s.executor := p->>'executor'; ok_int := ok_int and v_s.executor in ('manual', 'airship'); end if;
  if p ? 'cap_max_jpy' then v_s.cap_max_jpy := (p->>'cap_max_jpy')::int; ok_int := ok_int and v_s.cap_max_jpy between 100 and 1000000; end if;
  if p ? 'max_open' then v_s.max_open := (p->>'max_open')::int; ok_int := ok_int and v_s.max_open between 0 and 1000; end if;
  if p ? 'max_open_per_user' then v_s.max_open_per_user := (p->>'max_open_per_user')::int; ok_int := ok_int and v_s.max_open_per_user between 0 and 100; end if;
  if p ? 'daily_cap_jpy' then v_s.daily_cap_jpy := (p->>'daily_cap_jpy')::int; ok_int := ok_int and v_s.daily_cap_jpy between 0 and 100000000; end if;
  if p ? 'min_lead_minutes' then v_s.min_lead_minutes := (p->>'min_lead_minutes')::int; ok_int := ok_int and v_s.min_lead_minutes between 60 and 10080; end if;
  if p ? 'max_lead_hours' then v_s.max_lead_hours := (p->>'max_lead_hours')::int; ok_int := ok_int and v_s.max_lead_hours between 1 and 120; end if;
  if not ok_int then raise exception 'mb: bad setting'; end if;
  if v_s.accepting and v_s.executor = 'airship' and market_bid_worker_problem() is not null then raise exception 'mb: worker down'; end if;
  update market_bid_settings set accepting = v_s.accepting, executor = v_s.executor, cap_max_jpy = v_s.cap_max_jpy, max_open = v_s.max_open,
      max_open_per_user = v_s.max_open_per_user, daily_cap_jpy = v_s.daily_cap_jpy, min_lead_minutes = v_s.min_lead_minutes,
      max_lead_hours = v_s.max_lead_hours, updated_at = now(), updated_by = auth.uid(),
      pause_reason = case when v_s.accepting then null else pause_reason end, paused_at = case when v_s.accepting then null else paused_at end
    where id returning * into v_s;
  perform log_admin_action('market_bid_settings', 'market_bid_settings', 'settings', jsonb_build_object('before', v_old - 'updated_at' - 'updated_by', 'after', to_jsonb(v_s) - 'updated_at' - 'updated_by'));
  return v_s;
end $$;

revoke all on function market_bid_worker_problem() from public, anon;
revoke all on function market_bid_worker_watch() from public, anon, authenticated;
revoke all on function market_bid_worker_health(jsonb) from public, anon, authenticated;
revoke all on function market_bid_set_armed(uuid, text, text) from public, anon, authenticated;
revoke all on function market_bid_worker_won(uuid, int, text) from public, anon, authenticated;
grant execute on function market_bid_worker_problem() to authenticated, service_role;
grant execute on function market_bid_worker_watch() to service_role;
grant execute on function market_bid_worker_health(jsonb) to service_role;
grant execute on function market_bid_set_armed(uuid, text, text) to service_role;
grant execute on function market_bid_worker_won(uuid, int, text) to service_role;

commit;

-- ── 되돌리기(이 순서로, 한 트랜잭션. 워커 건(executor='airship')이 진행 중이면 먼저 수동 전환) ──
-- 0052 의 market_bid_ops_counts·admin_market_bid_settings, 0053 의 cron_market_bids, 0050 의 cancel_market_bid 정의를 다시 실행한다.
-- drop function if exists market_bid_worker_won(uuid, int, text); drop function if exists market_bid_set_armed(uuid, text, text);
-- drop function if exists market_bid_worker_health(jsonb); drop function if exists market_bid_worker_watch(); drop function if exists market_bid_worker_problem();
-- delete from ops_requests where actor_id in (select id from ops_actors where is_system); delete from ops_actors where is_system;
-- alter table ops_actors drop constraint if exists ops_actors_system_check; alter table ops_actors alter column profile_id set not null;
-- alter table ops_actors drop column if exists is_system;
-- drop table if exists market_bid_worker_health;
-- alter table market_bids drop column if exists worker_final_jpy; alter table market_bid_settings drop column if exists pause_reason, drop column if exists paused_at;
-- delete from ops_outbox where type in ('bid.to_place_due', 'bid.worker_down'); 0052 의 ops_outbox_type_check(19종)으로 다시.
