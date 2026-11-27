-- 0056: 입찰 워커 연결 T2(docs/aaa/16 13절). 0055 뒤.
-- 1) 수동 전환 market_bid_set_executor: 워커 건 한 건을 운영자 수동으로 바꾼다. 입찰 필요(authorized)·보류(hold) 이고 입찰이 한 번도 안 들어간 건만.
--    접수 확인(armed)된 건은 에어쉽 연결 행을 먼저 닫아야 한다 → 운영 API(에어쉽 「마켓 입찰」 화면 통로가 site_bid_cancel 뒤에 부름)만 p_worker_closed=true.
--    tomo 어드민은 접수 전 건만 바꿀 수 있다(접수 전 에어쉽 행은 'bidding' = 워커가 안 읽음, 에어쉽 20261128120000).
-- 2) 접수 확인된 워커 건을 사람이 「못 넣음」·「운영 취소」로 닫지 못하게 한다(먼저 수동 전환). 다리 작업(service_role)의 결과 전달은 그대로.
--    에어쉽 행이 살아 있는데 tomo 만 승인을 풀면 워커가 승인 없는 입찰을 할 수 있다.
-- 3) 재알림 bid.to_buy_due: 낙찰 확인 대기·매입 중·미구매 주문 건, 마감 뒤 2·12·20시간 구간마다 1회(구매 기한 = 마감 + 24시간).
begin;

-- ── 1. 이벤트 종류(0055 의 21종 + bid.to_buy_due), 진행 기록 종류(+ executor) ──
alter table ops_outbox drop constraint if exists ops_outbox_type_check;
alter table ops_outbox add constraint ops_outbox_type_check check (type in ('order.paid', 'order.cancel_requested', 'dispute.opened',
  'ticket.opened', 'refund.pending', 'payout.requested', 'report.opened', 'errors.spike', 'cron.failed',
  'auction.ended', 'auction.unpaid', 'auction.cancelled', 'auction.flagged',
  'bid.requested', 'bid.hold', 'bid.won', 'bid.missed', 'bid.capture_failed', 'bid.auth_expiring', 'bid.to_place_due', 'bid.worker_down', 'bid.to_buy_due'));
alter table market_bid_events drop constraint if exists market_bid_events_kind_check;
alter table market_bid_events add constraint market_bid_events_kind_check check (kind in ('requested', 'authorized', 'auth_void', 'armed', 'placed',
  'outbid', 'rebid', 'hold', 'released', 'won', 'captured', 'ordered', 'lost', 'missed', 'cancelled', 'expired', 'loss_recorded', 'capture_failed',
  'repaid', 'pay_expired', 'executor'));

-- ── 2. 수동 전환 ──
create or replace function market_bid_set_executor(p_id uuid, p_to text, p_note text, p_expected text default null, p_worker_closed boolean default false)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b market_bids;
begin
  v_b := market_bid_lock(p_id, p_expected, array['authorized', 'hold']);   -- 운영자·서버만(market_bid_actor_ok)
  if p_to is distinct from 'manual' then raise exception 'mb: bad executor'; end if;
  if v_b.executor = 'manual' then return jsonb_build_object('status', v_b.status, 'executor', 'manual', 'again', true); end if;
  if length(trim(coalesce(p_note, ''))) = 0 then raise exception 'mb: note required'; end if;
  if v_b.placed_at is not null then raise exception 'mb: already placed'; end if;          -- 들어간 입찰은 워커가 끝까지 맡는다
  if v_b.armed_at is not null and not coalesce(p_worker_closed, false) then raise exception 'mb: worker armed'; end if;
  update market_bids set executor = 'manual' where id = p_id returning * into v_b;
  insert into market_bid_events (bid_id, kind, evidence, actor)
    values (p_id, 'executor', jsonb_build_object('from', 'airship', 'to', 'manual', 'note', left(trim(p_note), 500),
      'worker_ref', v_b.executor_ref, 'worker_closed', coalesce(p_worker_closed, false)), auth.uid());
  perform market_bid_log('market_bid_executor', v_b, jsonb_build_object('to', 'manual', 'note', left(trim(p_note), 300), 'worker_ref', v_b.executor_ref));
  return jsonb_build_object('status', v_b.status, 'executor', 'manual');
end $$;
revoke all on function market_bid_set_executor(uuid, text, text, text, boolean) from public, anon;
grant execute on function market_bid_set_executor(uuid, text, text, text, boolean) to authenticated, service_role;

-- ── 3. 접수 확인된 워커 건은 사람이 승인 해제로 닫지 못한다(먼저 수동 전환). 서버 권한(다리 작업 결과 전달)은 그대로 ──
create or replace function market_bid_worker_close_guard() returns trigger
  language plpgsql set search_path = public as $$
begin
  if old.executor = 'airship' and new.executor = 'airship' and old.armed_at is not null
     and old.status in ('authorized', 'hold') and new.status in ('missed', 'cancelled')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'mb: worker armed';
  end if;
  return new;
end $$;
drop trigger if exists market_bid_worker_close_guard on market_bids;
create trigger market_bid_worker_close_guard before update of status on market_bids
  for each row execute function market_bid_worker_close_guard();

-- ── 4. 크론(0055 + 구매 기한 재알림) ──
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
    -- 0056 낙찰 뒤 구매 기한(마감 + 24시간) 재알림: 낙찰 확인 대기(보류 worker_won)·매입 중(won)·주문 생성 뒤 미구매(ordered + 대행 paid).
    -- 마감 뒤 2·12·20시간 구간마다 1회(설계 5.3). 구간이 지나 버린 단계는 건너뛴다(크론이 멈췄다 돌아와도 한꺼번에 3번 울리지 않게)
    perform ops_emit('bid.to_buy_due', 'bid.to_buy_due:' || b.id || ':' || x.h, b.code, coalesce(b.final_price_jpy, b.worker_final_jpy, b.last_bid_jpy), 'JPY',
        '/admin/market-bids?open=' || b.id, 'market_bid', b.id::text)
      from market_bids b left join proxy_requests r on r.order_id = b.order_id
      cross join (values (2, 12), (12, 20), (20, 24)) x(h, nx)
     where ((b.status = 'hold' and b.hold_reason = 'worker_won') or b.status = 'won' or (b.status = 'ordered' and r.status = 'paid'))
       and now() >= b.ends_at + make_interval(hours => x.h) and now() < b.ends_at + make_interval(hours => x.nx);
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

commit;

-- ── 되돌리기(한 트랜잭션) ──
-- 0055 의 cron_market_bids 정의를 다시 실행한다.
-- drop trigger if exists market_bid_worker_close_guard on market_bids; drop function if exists market_bid_worker_close_guard();
-- drop function if exists market_bid_set_executor(uuid, text, text, text, boolean);
-- delete from ops_outbox where type = 'bid.to_buy_due'; 0055 의 ops_outbox_type_check(21종)으로 다시.
-- 진행 기록 kind 'executor' 가 있으면 남기고 제약만 0053 18+2종으로 되돌리지 않는다(기록 보존). 없으면 0053 제약으로 다시.