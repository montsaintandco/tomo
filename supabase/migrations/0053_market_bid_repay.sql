-- 0053: 해외 마켓 경매 입찰 대행 M6 — 매입 실패 뒤 고객 재결제(설계 15 결정 11: 48시간 안 재결제, 안 하면 입찰 정지) + 수수료 0 고정.
-- 0052 뒤. 돈 규칙:
--   · 매입 실패(capture_failed) 때 결제 기한 pay_due_at = 실패 시각 + 48시간을 적는다. 고객은 /bids/[id] 에서 새 결제창(즉시 결제)으로
--     매입액(capture_krw)과 같은 금액만 낼 수 있다(market_bid_repay_open). 결제 완료 → market_bid_repaid 가 새 승인 행(captured)을 만들고
--     won 으로 되돌린 뒤 기존 market_bid_to_order 로 대행 주문(T 번호)을 만든다. 금액·상태·창이 안 맞는 결제는 ok=false·refund=true
--     → 서버가 전액 환불한다(키 mbp_refund_<PI>).
--   · 기한 + 35분(결제창 30분이 확실히 닫힌 뒤)까지 안 내면 크론이 신청을 닫고(closed_at) 회원을 입찰 정지(market_bid_blocks)한다.
--     상품은 우리가 보유한다(운영 처리). 신청 상태는 capture_failed 그대로다.
--   · 입찰 대행 수수료는 0 으로 확정(설계 9장 2번). 0 이 아니면 주문 service_fee 와 환불 미리보기가 어긋나므로 표 제약으로 막는다.
begin;

-- ── 1. 수수료 0 고정 ──
alter table market_bid_settings drop constraint if exists market_bid_settings_fee_zero;
alter table market_bid_settings add constraint market_bid_settings_fee_zero check (fee_jpy = 0);
alter table market_bids drop constraint if exists market_bids_fee_zero;
alter table market_bids add constraint market_bids_fee_zero check (fee_jpy = 0);

-- ── 2. 칸·사건 종류 ──
alter table market_bids add column if not exists pay_due_at timestamptz, add column if not exists repay_session_id text;
create unique index if not exists market_bids_repay_session on market_bids (repay_session_id) where repay_session_id is not null;
alter table market_bid_events drop constraint if exists market_bid_events_kind_check;
alter table market_bid_events add constraint market_bid_events_kind_check check (kind in ('requested', 'authorized', 'auth_void', 'armed', 'placed',
  'outbid', 'rebid', 'hold', 'released', 'won', 'captured', 'ordered', 'lost', 'missed', 'cancelled', 'expired', 'loss_recorded', 'capture_failed',
  'repaid', 'pay_expired'));

-- ── 3. 매입 실패(0052 + 결제 기한) ──
create or replace function market_bid_capture_failed(p_id uuid, p_reason text) returns market_bids
  language plpgsql security definer set search_path = public as $$
declare v_b market_bids;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'mb: admin only'; end if;
  select * into v_b from market_bids where id = p_id for update;
  if not found then raise exception 'mb: not found'; end if;
  if v_b.status = 'capture_failed' then return v_b; end if;
  if v_b.status <> 'won' then raise exception 'mb: bad transition (% → capture_failed)', v_b.status; end if;
  update market_bids set status = 'capture_failed', fail_reason = left(coalesce(p_reason, ''), 300), pay_due_at = now() + interval '48 hours'
    where id = p_id returning * into v_b;
  update market_bid_auths set status = 'failed', release_reason = left(coalesce(p_reason, ''), 300) where id = v_b.auth_id and status = 'authorized';
  insert into market_bid_events (bid_id, kind, evidence) values (p_id, 'capture_failed', jsonb_build_object('reason', v_b.fail_reason, 'due', v_b.pay_due_at));
  perform market_bid_note(v_b, 'mb_pay_needed', jsonb_build_object('krw', v_b.capture_krw, 'due', v_b.pay_due_at));
  return v_b;
end $$;

-- ── 4. 재결제 창 연결 ──
-- 서버만(본인 확인은 서버가 고객 세션으로 신청을 읽어서 한다). 앞 창이 있으면 만료 대상으로 돌려준다
create or replace function market_bid_repay_open(p_id uuid, p_session text, p_amount_krw int) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare v_b market_bids; v_prev text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'mb: admin only'; end if;
  select * into v_b from market_bids where id = p_id for update;
  if not found then raise exception 'mb: not found'; end if;
  if v_b.status <> 'capture_failed' or v_b.closed_at is not null or v_b.pay_due_at is null or v_b.pay_due_at <= now() then
    raise exception 'mb: pay closed';
  end if;
  if p_amount_krw is distinct from v_b.capture_krw then raise exception 'mb: amount mismatch'; end if;
  v_prev := v_b.repay_session_id;
  update market_bids set repay_session_id = p_session where id = p_id;
  return jsonb_build_object('expire', case when v_prev is not null and v_prev <> p_session then jsonb_build_array(v_prev) else '[]'::jsonb end);
end $$;

-- ── 5. 재결제 확정(웹훅·복귀가 같이 부른다, 멱등) ──
create or replace function market_bid_repaid(p_session text, p_payment_intent text, p_amount_krw int) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare v_b market_bids; v_auth uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'mb: admin only'; end if;
  -- 재진입: 이 결제로 이미 주문이 생겼다
  select b.* into v_b from market_bid_auths a join market_bids b on b.id = a.bid_id
   where a.payment_intent_id = p_payment_intent and a.status = 'captured' for update of b;
  if found then
    return jsonb_build_object('ok', true, 'again', true, 'bid_id', v_b.id) || market_bid_to_order(v_b.id);
  end if;
  select * into v_b from market_bids where repay_session_id = p_session for update;
  if not found then return jsonb_build_object('ok', false, 'refund', true, 'reason', 'not found'); end if;
  if v_b.status <> 'capture_failed' or v_b.closed_at is not null then
    return jsonb_build_object('ok', false, 'refund', true, 'reason', 'closed', 'bid_id', v_b.id);
  end if;
  if p_amount_krw is distinct from v_b.capture_krw then
    return jsonb_build_object('ok', false, 'refund', true, 'reason', 'amount', 'bid_id', v_b.id);
  end if;
  insert into market_bid_auths (bid_id, stripe_session_id, payment_intent_id, amount_krw, status, captured_krw, authorized_at, captured_at)
    values (v_b.id, p_session, p_payment_intent, p_amount_krw, 'captured', p_amount_krw, now(), now()) returning id into v_auth;
  update market_bids set auth_id = v_auth, status = 'won', pay_due_at = null, captured_krw = p_amount_krw where id = v_b.id;
  insert into market_bid_events (bid_id, kind, evidence) values (v_b.id, 'repaid', jsonb_build_object('krw', p_amount_krw, 'payment_intent', p_payment_intent));
  return jsonb_build_object('ok', true, 'bid_id', v_b.id) || market_bid_to_order(v_b.id);
end $$;

-- ── 6. 크론(0052 + 재결제 기한 지남 → 닫기·입찰 정지) ──
create or replace function cron_market_bids() returns jsonb
  language plpgsql security definer set search_path = public as $$
declare v jsonb; v_exp int := 0; v_missed int := 0; v_over int := 0; v_unpaid int := 0; v_b market_bids; v_rel uuid;
begin
  begin
    v_exp := market_bid_expire_pending();
    for v_b in select * from market_bids where status = 'authorized' and executor = 'manual' and ends_at <= now() + interval '30 minutes'
               order by ends_at for update skip locked loop
      update market_bid_auths set status = 'releasing', release_reason = 'missed' where id = v_b.auth_id and status = 'authorized' returning id into v_rel;
      update market_bids set status = 'missed', closed_at = now(), fail_reason = 'not placed 30 minutes before end' where id = v_b.id and status = 'authorized' returning * into v_b;
      insert into market_bid_events (bid_id, kind, evidence) values (v_b.id, 'missed', jsonb_build_object('reason', 'auto: not placed 30 minutes before end', 'auth', v_rel));
      perform market_bid_note(v_b, 'mb_missed');
      v_missed := v_missed + 1;
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
    perform ops_emit('bid.auth_expiring', 'bid.auth_expiring:' || b.id || ':' || h, b.code, b.auth_krw, 'KRW', '/admin/market-bids?open=' || b.id, 'market_bid', b.id::text)
      from market_bids b cross join (values (24), (6)) x(h)
     where b.status in ('authorized', 'placed', 'outbid', 'hold', 'won') and b.auth_expires_at < now() + make_interval(hours => x.h);
    v := jsonb_build_object('expired', v_exp, 'missed', v_missed, 'overdue', v_over, 'unpaid', v_unpaid,
      'releasing', (select count(*) from market_bid_auths where status = 'releasing'),
      'won_waiting', (select count(*) from market_bids where status = 'won'));
    insert into cron_runs (job, ok, detail) values ('market_bids', true, v);
    return v;
  exception when others then
    insert into cron_runs (job, ok, detail) values ('market_bids', false, jsonb_build_object('error', left(sqlerrm, 300)));
    return jsonb_build_object('error', left(sqlerrm, 300));
  end;
end $$;

-- ── 7. 고객 사건 기록(0052 + repaid·pay_expired) ──
create or replace function my_market_bid_events(p_id uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', ev.kind, 'amount_jpy', ev.amount_jpy, 'at', ev.created_at) order by ev.id), '[]'::jsonb)
    from market_bid_events ev join market_bids b on b.id = ev.bid_id
   where ev.bid_id = p_id and b.user_id = auth.uid()
     and ev.kind in ('requested', 'authorized', 'placed', 'rebid', 'outbid', 'hold', 'won', 'ordered', 'lost', 'missed', 'cancelled', 'expired', 'released',
       'capture_failed', 'repaid', 'pay_expired')
$$;

revoke all on function market_bid_repay_open(uuid, text, int) from public, anon, authenticated;
revoke all on function market_bid_repaid(text, text, int) from public, anon, authenticated;
grant execute on function market_bid_repay_open(uuid, text, int) to service_role;
grant execute on function market_bid_repaid(text, text, int) to service_role;

commit;

-- ── 되돌리기(이 순서로, 한 트랜잭션) ──
-- 0052 의 market_bid_capture_failed · cron_market_bids · my_market_bid_events 정의를 다시 실행한다.
-- drop function if exists market_bid_repaid(text, text, int); drop function if exists market_bid_repay_open(uuid, text, int);
-- delete from market_bid_events where kind in ('repaid', 'pay_expired');
-- alter table market_bid_events drop constraint market_bid_events_kind_check; 0050 의 18종 제약으로 다시.
-- drop index if exists market_bids_repay_session; alter table market_bids drop column if exists repay_session_id, drop column if exists pay_due_at;
-- alter table market_bids drop constraint if exists market_bids_fee_zero; alter table market_bid_settings drop constraint if exists market_bid_settings_fee_zero;
