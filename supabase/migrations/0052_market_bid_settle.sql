-- 0052: 해외 마켓 경매 입찰 대행 M3 (docs/aaa/15 3장·4.2~4.5절, 0050 뒤. 0051 은 거래 임베드 수정이 먼저 썼다)
-- 운영자 수동 입찰 단계의 상태 전이·낙찰 → 대행 주문 전환·승인 해제 예약·보류·크론·이벤트·운영 조회.
-- 돈 규칙: 매입(Stripe capture)과 승인 해제(PaymentIntent cancel)는 서버(lib/market-bid.server.ts)가 한다. DB 는 판정·기록만.
--   · 낙찰 처리(market_bid_set_won)는 매입액 = market_bid_amount(낙찰가, 송료, 고정 환율, 수수료)를 계산해 저장한다.
--     낙찰가 > 상한가, 또는 매입액 > 승인액이면 거절하고 보류(hold)로 바꾼다(초과분 추가 청구 경로는 없다).
--   · 승인 해제 예약(market_bid_auths.status = releasing)은 「입찰이 안 들어간 것이 확실」(placed_at 없음) 또는
--     「유찰 확실」(운영자가 본 낙찰가 ≠ 우리 마지막 입찰액)일 때만. 그 밖은 보류.
--   · 주문 전환(market_bid_to_order)은 매입 기록(승인 행 captured) 뒤에만, 한 번만(order_id 가 있으면 그대로 돌려준다).
--     대행 주문은 기존 흐름 그대로: proxy_orders(pending_payment → paid, PI = 그 승인) + proxy_requests(requested → paid).
--     기존 트리거가 order.paid 이벤트·proxy_paid 알림을 보내고, 이후 구매·센터·발송·환불(admin_cancel_proxy)도 그대로다.
-- 모든 전이는 「지금 상태」 조건(for update + 상태 검사)이다. 운영 조작은 expected_status 가 다르면 'mb: status changed'.
begin;

-- ── 1. 이벤트 종류(0048 의 13종 + 입찰 대행 6종) ──
alter table ops_outbox drop constraint if exists ops_outbox_type_check;
alter table ops_outbox add constraint ops_outbox_type_check check (type in ('order.paid', 'order.cancel_requested', 'dispute.opened',
  'ticket.opened', 'refund.pending', 'payout.requested', 'report.opened', 'errors.spike', 'cron.failed',
  'auction.ended', 'auction.unpaid', 'auction.cancelled', 'auction.flagged',
  'bid.requested', 'bid.hold', 'bid.won', 'bid.missed', 'bid.capture_failed', 'bid.auth_expiring'));

-- 신청 상태가 바뀔 때 운영 이벤트. 보류는 여러 번 생길 수 있어 시각을 붙인다
create or replace function ops_on_market_bid() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_type text;
begin
  v_type := case new.status when 'authorized' then 'bid.requested' when 'hold' then 'bid.hold' when 'won' then 'bid.won'
    when 'missed' then 'bid.missed' when 'capture_failed' then 'bid.capture_failed' end;
  if v_type is not null and new.status is distinct from old.status then
    perform ops_emit(v_type, v_type || ':' || new.id || case when new.status = 'hold' then ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint else '' end,
      new.code, case when new.status = 'won' then new.capture_krw else new.cap_jpy end,
      case when new.status = 'won' then 'KRW' else 'JPY' end, '/admin/market-bids?open=' || new.id, 'market_bid', new.id::text);
  end if;
  return null;
end $$;
revoke all on function ops_on_market_bid() from public, anon, authenticated;
drop trigger if exists market_bids_ops_event on market_bids;
create trigger market_bids_ops_event after update of status on market_bids
  for each row execute function ops_on_market_bid();

-- ── 2. 공용 ──
-- 조작 주체: 운영자 세션 또는 서버(service_role). 고객·비운영자는 거절
create or replace function market_bid_actor_ok() returns boolean
  language sql stable security definer set search_path = public as $$
  select is_admin_user() or coalesce(auth.role(), '') = 'service_role'
$$;
revoke all on function market_bid_actor_ok() from public, anon, authenticated;

-- 잠금 + 상태 검사. p_expected 가 있으면 지금 상태와 같아야 한다(화면에서 본 상태)
create or replace function market_bid_lock(p_id uuid, p_expected text, p_allowed text[]) returns market_bids
  language plpgsql security definer set search_path = public as $$
declare v_b market_bids;
begin
  if not market_bid_actor_ok() then raise exception 'mb: admin only'; end if;
  select * into v_b from market_bids where id = p_id for update;
  if not found then raise exception 'mb: not found'; end if;
  if p_expected is not null and p_expected <> v_b.status then raise exception 'mb: status changed (%)', v_b.status; end if;
  if not (v_b.status = any (p_allowed)) then raise exception 'mb: bad transition (% → ?)', v_b.status; end if;
  return v_b;
end $$;
revoke all on function market_bid_lock(uuid, text, text[]) from public, anon, authenticated;

create or replace function market_bid_note(p_b market_bids, p_kind text, p_extra jsonb default '{}') returns void
  language sql security definer set search_path = public as $$
  select notify(p_b.user_id, p_kind, 'market_bid', p_b.id::text,
    jsonb_build_object('code', p_b.code, 'source', p_b.source, 'source_id', p_b.source_id) || coalesce(p_extra, '{}'))
$$;
revoke all on function market_bid_note(market_bids, text, jsonb) from public, anon, authenticated;

create or replace function market_bid_log(p_action text, p_b market_bids, p_detail jsonb) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then perform log_admin_action(p_action, 'market_bid', p_b.id::text, jsonb_build_object('code', p_b.code) || p_detail); end if;
end $$;
revoke all on function market_bid_log(text, market_bids, jsonb) from public, anon, authenticated;

-- ── 3. 입찰됨·밀림·보류 ──
-- 입찰됨 기록: 운영자가 메루카리에서 우리 계정으로 넣은 뒤 금액·증빙 메모(필수)를 적는다. 밀린 뒤 다시 넣은 것도 같은 함수(rebid)
-- p_ends_at: 입찰 뒤 상품 화면에서 다시 읽은 마감(메루카리는 첫 입찰로 마감이 정해지거나 연장된다). 없으면 그대로
create or replace function market_bid_set_placed(p_id uuid, p_amount int, p_note text, p_expected text default null, p_ends_at timestamptz default null)
  returns market_bids language plpgsql security definer set search_path = public as $$
declare v_b market_bids; v_kind text;
begin
  v_b := market_bid_lock(p_id, p_expected, array['authorized', 'placed', 'outbid', 'hold']);
  if length(trim(coalesce(p_note, ''))) = 0 then raise exception 'mb: note required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'mb: bad amount'; end if;
  if p_amount > v_b.cap_jpy then raise exception 'mb: over cap'; end if;               -- 상한가를 넘겨 넣은 입찰은 기록하지 않는다(운영 실수)
  if v_b.last_bid_jpy is not null and p_amount <= v_b.last_bid_jpy then raise exception 'mb: not higher'; end if;
  if coalesce(p_ends_at, v_b.ends_at) < now() then raise exception 'mb: ended'; end if;
  if v_b.auth_id is null or not exists (select 1 from market_bid_auths where id = v_b.auth_id and status = 'authorized') then raise exception 'mb: auth not live'; end if;
  v_kind := case when v_b.placed_at is null then 'placed' else 'rebid' end;
  update market_bids set status = 'placed', last_bid_jpy = p_amount, is_top = true, placed_at = coalesce(placed_at, now()),
      ends_at = coalesce(p_ends_at, ends_at), hold_reason = null
    where id = p_id returning * into v_b;
  insert into market_bid_events (bid_id, kind, amount_jpy, evidence, actor)
    values (p_id, v_kind, p_amount, jsonb_build_object('note', left(trim(p_note), 500), 'ends_at', v_b.ends_at), auth.uid());
  perform market_bid_note(v_b, 'mb_placed', jsonb_build_object('amount', p_amount));
  perform market_bid_log('market_bid_placed', v_b, jsonb_build_object('amount', p_amount, 'note', left(trim(p_note), 300), 'kind', v_kind));
  return v_b;
end $$;

-- 밀림: 다른 입찰자가 더 높게 넣었다(p_price = 그때 현재가). 승인은 마감 결과가 확정될 때까지 유지한다
create or replace function market_bid_set_outbid(p_id uuid, p_price int, p_note text default '', p_expected text default null)
  returns market_bids language plpgsql security definer set search_path = public as $$
declare v_b market_bids;
begin
  v_b := market_bid_lock(p_id, p_expected, array['placed']);
  if p_price is null or p_price <= coalesce(v_b.last_bid_jpy, 0) then raise exception 'mb: bad amount'; end if;
  update market_bids set status = 'outbid', is_top = false where id = p_id returning * into v_b;
  insert into market_bid_events (bid_id, kind, amount_jpy, evidence, actor)
    values (p_id, 'outbid', p_price, jsonb_build_object('note', left(trim(coalesce(p_note, '')), 500)), auth.uid());
  perform market_bid_note(v_b, 'mb_outbid', jsonb_build_object('price', p_price));
  perform market_bid_log('market_bid_outbid', v_b, jsonb_build_object('price', p_price));
  return v_b;
end $$;

-- 보류: 제출 여부 불명·결과 지연·검증 실패. 승인은 유지. 해제는 운영자(입찰됨·낙찰·유찰·못 넣음 중 하나)
create or replace function market_bid_hold(p_id uuid, p_reason text, p_expected text default null)
  returns market_bids language plpgsql security definer set search_path = public as $$
declare v_b market_bids;
begin
  v_b := market_bid_lock(p_id, p_expected, array['authorized', 'placed', 'outbid']);
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'mb: note required'; end if;
  update market_bids set status = 'hold', hold_reason = left(trim(p_reason), 300) where id = p_id returning * into v_b;
  insert into market_bid_events (bid_id, kind, evidence, actor) values (p_id, 'hold', jsonb_build_object('reason', v_b.hold_reason), auth.uid());
  perform market_bid_note(v_b, 'mb_hold');
  perform market_bid_log('market_bid_hold', v_b, jsonb_build_object('reason', v_b.hold_reason));
  return v_b;
end $$;

-- ── 4. 낙찰 ──
-- 낙찰가·일본 내 송료(없으면 신청 때 값) → 검사 → won + 매입액 저장. 서버가 이어서 매입(captureAuth) → market_bid_to_order.
-- 같은 낙찰가로 다시 부르면(이중 처리) 그대로 돌려준다. 검사 실패는 보류로 바꾸고 status='hold' 를 돌려준다(예외 아님: 보류가 기록되게)
create or replace function market_bid_set_won(p_id uuid, p_final int, p_ship int default null, p_note text default '', p_expected text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b market_bids; v_ship int; v_amt jsonb; v_reason text; v_auth market_bid_auths;
begin
  if not market_bid_actor_ok() then raise exception 'mb: admin only'; end if;
  select * into v_b from market_bids where id = p_id for update;
  if not found then raise exception 'mb: not found'; end if;
  if v_b.status in ('won', 'ordered', 'capture_failed') and v_b.final_price_jpy = p_final then
    return jsonb_build_object('status', v_b.status, 'again', true, 'bid_id', v_b.id, 'capture_krw', v_b.capture_krw, 'auth_id', v_b.auth_id, 'order_id', v_b.order_id);
  end if;
  v_b := market_bid_lock(p_id, p_expected, array['placed', 'outbid', 'hold']);
  if p_final is null or p_final <= 0 then raise exception 'mb: bad amount'; end if;
  if p_ship is not null and p_ship < 0 then raise exception 'mb: bad amount'; end if;
  v_ship := coalesce(p_ship, v_b.domestic_ship_jpy);
  v_amt := market_bid_amount(p_final, v_ship, v_b.rate, v_b.fee_jpy);
  select * into v_auth from market_bid_auths where id = v_b.auth_id;
  v_reason := case
    when p_final > v_b.cap_jpy then 'final over cap'
    -- 메루카리는 자동 입찰이 없어 낙찰가 = 우리 마지막 입찰액이다. 다르면 입력 실수이거나 우리 낙찰이 아니다
    when v_b.source = 'mercari' and v_b.last_bid_jpy is not null and p_final <> v_b.last_bid_jpy then 'final differs from our bid'
    when (v_amt->>'total')::int > v_b.auth_krw then 'capture over auth'
    when v_auth.id is null or v_auth.status <> 'authorized' then 'auth not live'
  end;
  if v_reason is not null then
    update market_bids set status = 'hold', hold_reason = v_reason where id = p_id returning * into v_b;
    insert into market_bid_events (bid_id, kind, amount_jpy, evidence, actor)
      values (p_id, 'hold', p_final, jsonb_build_object('reason', v_reason, 'final', p_final, 'ship', v_ship, 'capture', v_amt->'total', 'auth_krw', v_b.auth_krw), auth.uid());
    perform market_bid_note(v_b, 'mb_hold');
    perform market_bid_log('market_bid_won_rejected', v_b, jsonb_build_object('final', p_final, 'ship', v_ship, 'reason', v_reason));
    return jsonb_build_object('status', 'hold', 'reason', v_reason, 'bid_id', v_b.id, 'capture_krw', (v_amt->>'total')::int, 'auth_krw', v_b.auth_krw);
  end if;
  update market_bids set status = 'won', final_price_jpy = p_final, final_ship_jpy = v_ship, capture_breakdown = v_amt,
      capture_krw = (v_amt->>'total')::int, is_top = true, hold_reason = null
    where id = p_id returning * into v_b;
  insert into market_bid_events (bid_id, kind, amount_jpy, evidence, actor)
    values (p_id, 'won', p_final, jsonb_build_object('ship', v_ship, 'capture_krw', v_b.capture_krw, 'note', left(trim(coalesce(p_note, '')), 500)), auth.uid());
  perform market_bid_log('market_bid_won', v_b, jsonb_build_object('final', p_final, 'ship', v_ship, 'capture_krw', v_b.capture_krw, 'auth_krw', v_b.auth_krw));
  return jsonb_build_object('status', 'won', 'bid_id', v_b.id, 'capture_krw', v_b.capture_krw, 'auth_id', v_b.auth_id);
end $$;

-- 매입 실패가 확정(승인 만료·카드사 취소 — PI 가 canceled). 서버만. 고객 알림 + 운영 이벤트, 회원은 신청이 막힌다(0050 가드)
create or replace function market_bid_capture_failed(p_id uuid, p_reason text) returns market_bids
  language plpgsql security definer set search_path = public as $$
declare v_b market_bids;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'mb: admin only'; end if;
  select * into v_b from market_bids where id = p_id for update;
  if not found then raise exception 'mb: not found'; end if;
  if v_b.status = 'capture_failed' then return v_b; end if;
  if v_b.status <> 'won' then raise exception 'mb: bad transition (% → capture_failed)', v_b.status; end if;
  update market_bids set status = 'capture_failed', fail_reason = left(coalesce(p_reason, ''), 300) where id = p_id returning * into v_b;
  update market_bid_auths set status = 'failed', release_reason = left(coalesce(p_reason, ''), 300) where id = v_b.auth_id and status = 'authorized';
  insert into market_bid_events (bid_id, kind, evidence) values (p_id, 'capture_failed', jsonb_build_object('reason', v_b.fail_reason));
  perform market_bid_note(v_b, 'mb_pay_needed');
  return v_b;
end $$;

-- 매입 뒤 대행 주문 전환. 서버만. 한 번만(order_id 가 있으면 그대로). 금액·결제는 매입 기록과 같아야 한다
create or replace function market_bid_to_order(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare v_b market_bids; v_a market_bid_auths; v_o proxy_orders; v_r proxy_requests; v_br jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'mb: admin only'; end if;
  select * into v_b from market_bids where id = p_id for update;
  if not found then raise exception 'mb: not found'; end if;
  if v_b.order_id is not null then
    return jsonb_build_object('order_id', v_b.order_id, 'code', (select code from proxy_orders where id = v_b.order_id), 'again', true);
  end if;
  if v_b.status <> 'won' then raise exception 'mb: bad transition (% → ordered)', v_b.status; end if;
  select * into v_a from market_bid_auths where id = v_b.auth_id;
  if v_a.status is distinct from 'captured' or v_a.captured_krw is distinct from v_b.capture_krw then raise exception 'mb: not captured'; end if;
  v_br := v_b.capture_breakdown;
  insert into proxy_orders (user_id, currency, subtotal, intl_shipping, service_fee, total, rate, payment_method, stripe_session_id,
      ship_name, ship_phone, ship_postal, ship_address, ship_note, ship_pccc)
    values (v_b.user_id, 'KRW', (v_br->>'subtotal')::int, (v_br->>'intl_shipping')::int,
      (v_br->>'customs')::int + coalesce((v_br->>'fee')::int, 0), v_b.capture_krw, v_b.rate, 'card', v_a.stripe_session_id,
      v_b.ship_name, v_b.ship_phone, v_b.ship_postal, v_b.ship_address, v_b.ship_note, v_b.pccc)
    returning * into v_o;
  insert into proxy_requests (user_id, external_item_id, note, center, quote_item_price, order_id)
    values (v_b.user_id, v_b.external_item_id, '경매 낙찰 ' || v_b.code || ' (낙찰가 ' || v_b.final_price_jpy || '엔 + 송료 ' || v_b.final_ship_jpy || '엔)',
      'NARITA', v_b.final_price_jpy + v_b.final_ship_jpy, v_o.id)
    returning * into v_r;
  -- 기존 결제 확정과 같은 순서(mark_proxy_order_paid): 주문 paid → 항목 paid. 트리거가 order.paid 이벤트·proxy_paid 알림을 낸다
  update proxy_orders set status = 'paid', stripe_payment_intent_id = v_a.payment_intent_id, paid_krw = v_a.captured_krw
    where id = v_o.id returning * into v_o;
  update proxy_requests set status = 'paid' where id = v_r.id;
  update market_bids set status = 'ordered', order_id = v_o.id, closed_at = now() where id = p_id returning * into v_b;
  insert into market_bid_events (bid_id, kind, evidence) values (p_id, 'ordered', jsonb_build_object('order_id', v_o.id, 'order_code', v_o.code, 'krw', v_o.total));
  perform market_bid_note(v_b, 'mb_won', jsonb_build_object('order_id', v_o.id, 'order_code', v_o.code, 'krw', v_o.total));
  return jsonb_build_object('order_id', v_o.id, 'code', v_o.code, 'request_id', v_r.id, 'total', v_o.total);
end $$;

-- ── 5. 유찰·못 넣음·운영 취소 → 승인 해제 예약 ──
-- lost: 입찰은 들어갔고(placed_at) 다른 사람이 낙찰. p_final_seen = 마감 뒤 메루카리에서 본 낙찰가(경매 자체가 취소돼 낙찰자가 없으면 0).
--       우리 마지막 입찰액과 같으면 우리 낙찰일 수 있어 거절한다(낙찰 처리 또는 보류).
-- missed / cancelled: 입찰이 한 번도 안 들어간 것이 확실(placed_at 없음)할 때만.
-- 그 밖(입찰했는지 모름)은 이 함수로 해제하지 않는다 → 보류 유지.
create or replace function market_bid_release(p_id uuid, p_to text, p_reason text, p_final_seen int default null, p_expected text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b market_bids; v_rel uuid;
begin
  if p_to not in ('lost', 'missed', 'cancelled') then raise exception 'mb: bad transition (? → %)', p_to; end if;
  v_b := market_bid_lock(p_id, p_expected, case when p_to = 'lost' then array['placed', 'outbid', 'hold'] else array['authorized', 'hold'] end);
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'mb: note required'; end if;
  if p_to = 'lost' then
    if v_b.placed_at is null then raise exception 'mb: never placed (use missed)'; end if;
    if p_final_seen is null or p_final_seen < 0 then raise exception 'mb: final required'; end if;
    if p_final_seen = v_b.last_bid_jpy then raise exception 'mb: looks won'; end if;
  elsif v_b.placed_at is not null then
    raise exception 'mb: was placed';
  end if;
  update market_bid_auths set status = 'releasing', release_reason = p_to where id = v_b.auth_id and status = 'authorized' returning id into v_rel;
  update market_bids set status = p_to, closed_at = now(), fail_reason = left(trim(p_reason), 300), is_top = case when p_to = 'lost' then false else is_top end,
      final_price_jpy = case when p_to = 'lost' then p_final_seen else final_price_jpy end
    where id = p_id returning * into v_b;
  insert into market_bid_events (bid_id, kind, amount_jpy, evidence, actor)
    values (p_id, p_to, p_final_seen, jsonb_build_object('reason', v_b.fail_reason, 'auth', v_rel), auth.uid());
  perform market_bid_note(v_b, 'mb_' || p_to);
  perform market_bid_log('market_bid_' || p_to, v_b, jsonb_build_object('reason', v_b.fail_reason, 'final_seen', p_final_seen, 'release_auth_id', v_rel));
  return jsonb_build_object('status', v_b.status, 'release_auth_id', v_rel, 'bid_id', v_b.id);
end $$;

-- ── 6. 크론(1분, DB 판정만. Stripe 호출은 /api/cron/market-bids 가 releasing 승인·won 신청을 읽어서 한다) ──
-- 결제창 대기 만료 · 마감 30분 전 미입찰 자동 취소(missed, 승인 해제 예약) · 마감 + 15분 결과 없음 → 보류 · 승인 만료 24·6시간 전 이벤트
create or replace function cron_market_bids() returns jsonb
  language plpgsql security definer set search_path = public as $$
declare v jsonb; v_exp int := 0; v_missed int := 0; v_over int := 0; v_b market_bids; v_rel uuid;
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
    perform ops_emit('bid.auth_expiring', 'bid.auth_expiring:' || b.id || ':' || h, b.code, b.auth_krw, 'KRW', '/admin/market-bids?open=' || b.id, 'market_bid', b.id::text)
      from market_bids b cross join (values (24), (6)) x(h)
     where b.status in ('authorized', 'placed', 'outbid', 'hold', 'won') and b.auth_expires_at < now() + make_interval(hours => x.h);
    v := jsonb_build_object('expired', v_exp, 'missed', v_missed, 'overdue', v_over,
      'releasing', (select count(*) from market_bid_auths where status = 'releasing'),
      'won_waiting', (select count(*) from market_bids where status = 'won'));
    insert into cron_runs (job, ok, detail) values ('market_bids', true, v);
    return v;
  exception when others then
    insert into cron_runs (job, ok, detail) values ('market_bids', false, jsonb_build_object('error', left(sqlerrm, 300)));
    return jsonb_build_object('error', left(sqlerrm, 300));
  end;
end $$;

-- ── 7. 운영 조회·설정 ──
-- 탭: to_place(입찰 필요) · bidding(입찰 중·밀림) · hold(보류) · won(낙찰·매입 실패·주문 뒤 구매 필요) · ended(끝) · all
create or replace function admin_market_bids(p_tab text default 'to_place', p_q text default null, p_limit int default 50, p_offset int default 0)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_items jsonb; v_total int; v_q text := nullif(trim(coalesce(p_q, '')), '');
begin
  if not auction_admin_reader() then raise exception 'mb: admin only'; end if;
  with base as (
    select b.*, e.url, e.title, e.title_translated, e.images[1] as image, p.nickname, o.code as order_code, r.id as order_request_id, r.status::text as request_status
      from market_bids b join external_items e on e.id = b.external_item_id join profiles p on p.id = b.user_id
      left join proxy_orders o on o.id = b.order_id left join proxy_requests r on r.order_id = b.order_id
     where b.status <> 'expired' or coalesce(p_tab, 'all') = 'all'
  ), f as (
    select * from base
     where (coalesce(p_tab, 'all') = 'all'
         or (p_tab = 'to_place' and status = 'authorized')
         or (p_tab = 'bidding' and status in ('placed', 'outbid'))
         or (p_tab = 'hold' and status = 'hold')
         or (p_tab = 'won' and (status in ('won', 'capture_failed') or (status = 'ordered' and request_status = 'paid')))
         or (p_tab = 'ended' and status in ('ordered', 'lost', 'missed', 'cancelled', 'expired')))
       and (v_q is null or code = upper(v_q) or order_code = upper(v_q) or id::text = v_q or source_id = v_q
            or title ilike '%' || replace(replace(v_q, '%', ''), '_', '') || '%')
  ), page as (
    select * from f
     order by case when status in ('authorized', 'placed', 'outbid', 'hold', 'won', 'capture_failed') then 0 else 1 end,
       case when status in ('authorized', 'placed', 'outbid', 'hold') then ends_at end asc nulls last,
       coalesce(closed_at, created_at) desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  )
  select (select count(*) from f),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', x.id, 'code', x.code, 'status', x.status, 'source', x.source, 'source_id', x.source_id, 'url', x.url,
      'title', coalesce(nullif(x.title_translated, ''), x.title), 'title_original', x.title, 'image', x.image,
      'user_id', x.user_id, 'nickname', x.nickname, 'cap_jpy', x.cap_jpy, 'seen_price_jpy', x.seen_price_jpy, 'seen_bids', x.seen_bids,
      'domestic_ship_jpy', x.domestic_ship_jpy, 'last_bid_jpy', x.last_bid_jpy, 'is_top', x.is_top, 'ends_at', x.ends_at,
      'auth_krw', x.auth_krw, 'auth_expires_at', x.auth_expires_at, 'placed_at', x.placed_at, 'final_price_jpy', x.final_price_jpy,
      'final_ship_jpy', x.final_ship_jpy, 'capture_krw', x.capture_krw, 'captured_krw', x.captured_krw, 'order_id', x.order_id,
      'order_code', x.order_code, 'order_request_id', x.order_request_id, 'request_status', x.request_status,
      'hold_reason', x.hold_reason, 'fail_reason', x.fail_reason, 'created_at', x.created_at, 'updated_at', x.updated_at, 'closed_at', x.closed_at)
      order by case when x.status in ('authorized', 'placed', 'outbid', 'hold', 'won', 'capture_failed') then 0 else 1 end,
        case when x.status in ('authorized', 'placed', 'outbid', 'hold') then x.ends_at end asc nulls last,
        coalesce(x.closed_at, x.created_at) desc) from page x), '[]'::jsonb)
    into v_total, v_items;
  return jsonb_build_object('items', v_items, 'total', coalesce(v_total, 0));
end $$;

create or replace function admin_market_bid_detail(p_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare v_b market_bids;
begin
  if not auction_admin_reader() then raise exception 'mb: admin only'; end if;
  select * into v_b from market_bids where id = p_id;
  if v_b.id is null then return null; end if;
  return jsonb_build_object(
    'bid', to_jsonb(v_b),
    'item', (select jsonb_build_object('id', e.id, 'url', e.url, 'title', e.title, 'title_translated', e.title_translated, 'image', e.images[1], 'price', e.price)
      from external_items e where e.id = v_b.external_item_id),
    'user', (select jsonb_build_object('id', p.id, 'nickname', p.nickname, 'country', p.country, 'suspended', p.suspended) from profiles p where p.id = v_b.user_id),
    'auths', (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at), '[]'::jsonb) from market_bid_auths a where a.bid_id = v_b.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id', ev.id, 'kind', ev.kind, 'amount_jpy', ev.amount_jpy, 'evidence', ev.evidence,
        'actor', (select nickname from profiles where id = ev.actor), 'at', ev.created_at) order by ev.id), '[]'::jsonb)
      from market_bid_events ev where ev.bid_id = v_b.id),
    'order', (select jsonb_build_object('id', o.id, 'code', o.code, 'status', o.status, 'total', o.total, 'paid_krw', o.paid_krw) from proxy_orders o where o.id = v_b.order_id),
    'request', (select jsonb_build_object('id', r.id, 'status', r.status) from proxy_requests r where r.order_id = v_b.order_id limit 1),
    'settings', (select to_jsonb(s) from market_bid_settings s where s.id));
end $$;

-- 할 일 건수(「내 차례」·메뉴 배지)
create or replace function market_bid_ops_counts() returns jsonb
  language plpgsql stable security definer set search_path = public as $$
begin
  if not auction_admin_reader() then raise exception 'mb: admin only'; end if;
  return (select jsonb_build_object(
    'to_place', count(*) filter (where b.status = 'authorized'),
    'to_place_soon', count(*) filter (where b.status = 'authorized' and b.ends_at <= now() + interval '2 hours'),
    'bidding', count(*) filter (where b.status in ('placed', 'outbid')),
    'hold', count(*) filter (where b.status = 'hold'),
    'to_buy', count(*) filter (where b.status = 'won' or (b.status = 'ordered' and r.status = 'paid')),
    'to_buy_late', count(*) filter (where (b.status = 'won' and b.updated_at < now() - interval '10 minutes')
                                     or (b.status = 'ordered' and r.status = 'paid' and b.closed_at < now() - interval '18 hours')),
    'capture_failed', count(*) filter (where b.status = 'capture_failed'),
    'auth_expiring', count(*) filter (where b.status in ('authorized', 'placed', 'outbid', 'hold', 'won') and b.auth_expires_at < now() + interval '24 hours'))
    from market_bids b left join proxy_requests r on r.order_id = b.order_id);
end $$;

-- 설정 변경(접수 스위치·한도). 운영자만(돈 권한은 운영 API 가 따로 본다). 실행자(executor)는 W2 에서
create or replace function admin_market_bid_settings(p jsonb) returns market_bid_settings
  language plpgsql security definer set search_path = public as $$
declare v_s market_bid_settings; v_old jsonb;
  ok_int boolean := true;
begin
  if not is_admin_user() then raise exception 'mb: admin only'; end if;
  select * into v_s from market_bid_settings where id for update;
  v_old := to_jsonb(v_s);
  if p ? 'accepting' then v_s.accepting := (p->>'accepting')::boolean; end if;
  if p ? 'cap_max_jpy' then v_s.cap_max_jpy := (p->>'cap_max_jpy')::int; ok_int := ok_int and v_s.cap_max_jpy between 100 and 1000000; end if;
  if p ? 'max_open' then v_s.max_open := (p->>'max_open')::int; ok_int := ok_int and v_s.max_open between 0 and 1000; end if;
  if p ? 'max_open_per_user' then v_s.max_open_per_user := (p->>'max_open_per_user')::int; ok_int := ok_int and v_s.max_open_per_user between 0 and 100; end if;
  if p ? 'daily_cap_jpy' then v_s.daily_cap_jpy := (p->>'daily_cap_jpy')::int; ok_int := ok_int and v_s.daily_cap_jpy between 0 and 100000000; end if;
  if p ? 'min_lead_minutes' then v_s.min_lead_minutes := (p->>'min_lead_minutes')::int; ok_int := ok_int and v_s.min_lead_minutes between 60 and 10080; end if;
  if p ? 'max_lead_hours' then v_s.max_lead_hours := (p->>'max_lead_hours')::int; ok_int := ok_int and v_s.max_lead_hours between 1 and 120; end if;
  if not ok_int then raise exception 'mb: bad setting'; end if;
  update market_bid_settings set accepting = v_s.accepting, cap_max_jpy = v_s.cap_max_jpy, max_open = v_s.max_open,
      max_open_per_user = v_s.max_open_per_user, daily_cap_jpy = v_s.daily_cap_jpy, min_lead_minutes = v_s.min_lead_minutes,
      max_lead_hours = v_s.max_lead_hours, updated_at = now(), updated_by = auth.uid()
    where id returning * into v_s;
  perform log_admin_action('market_bid_settings', 'market_bid_settings', 'settings', jsonb_build_object('before', v_old - 'updated_at' - 'updated_by', 'after', to_jsonb(v_s) - 'updated_at' - 'updated_by'));
  return v_s;
end $$;

-- 고객 사건 기록(본인만, 고객용 종류만, 증빙·운영자 정보 없음). 신청 상세 /bids/[id]
create or replace function my_market_bid_events(p_id uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', ev.kind, 'amount_jpy', ev.amount_jpy, 'at', ev.created_at) order by ev.id), '[]'::jsonb)
    from market_bid_events ev join market_bids b on b.id = ev.bid_id
   where ev.bid_id = p_id and b.user_id = auth.uid()
     and ev.kind in ('requested', 'authorized', 'placed', 'rebid', 'outbid', 'hold', 'won', 'ordered', 'lost', 'missed', 'cancelled', 'expired', 'released', 'capture_failed')
$$;

-- 입찰 신청 고객도 그 상품(고객 입력 행, origin=client)을 읽는다(신청 상세·마이페이지 제목·사진). 0034 정의 + market_bids 한 줄
create or replace function can_read_client_item(p_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from proxy_requests r where r.external_item_id = p_id and r.user_id = auth.uid())
    or exists (select 1 from cart_items c where c.external_item_id = p_id and c.user_id = auth.uid())
    or exists (select 1 from market_bids b where b.external_item_id = p_id and b.user_id = auth.uid())
    or is_admin_user())
$$;

revoke all on function market_bid_set_placed(uuid, int, text, text, timestamptz) from public, anon;
revoke all on function market_bid_set_outbid(uuid, int, text, text) from public, anon;
revoke all on function market_bid_hold(uuid, text, text) from public, anon;
revoke all on function market_bid_set_won(uuid, int, int, text, text) from public, anon;
revoke all on function market_bid_release(uuid, text, text, int, text) from public, anon;
revoke all on function market_bid_capture_failed(uuid, text) from public, anon, authenticated;
revoke all on function market_bid_to_order(uuid) from public, anon, authenticated;
revoke all on function cron_market_bids() from public, anon, authenticated;
revoke all on function admin_market_bids(text, text, int, int) from public, anon;
revoke all on function admin_market_bid_detail(uuid) from public, anon;
revoke all on function market_bid_ops_counts() from public, anon;
revoke all on function admin_market_bid_settings(jsonb) from public, anon;
revoke all on function my_market_bid_events(uuid) from public, anon;
grant execute on function market_bid_set_placed(uuid, int, text, text, timestamptz) to authenticated, service_role;
grant execute on function market_bid_set_outbid(uuid, int, text, text) to authenticated, service_role;
grant execute on function market_bid_hold(uuid, text, text) to authenticated, service_role;
grant execute on function market_bid_set_won(uuid, int, int, text, text) to authenticated, service_role;
grant execute on function market_bid_release(uuid, text, text, int, text) to authenticated, service_role;
grant execute on function market_bid_capture_failed(uuid, text) to service_role;
grant execute on function market_bid_to_order(uuid) to service_role;
grant execute on function cron_market_bids() to service_role;
grant execute on function admin_market_bids(text, text, int, int) to authenticated, service_role;
grant execute on function admin_market_bid_detail(uuid) to authenticated, service_role;
grant execute on function market_bid_ops_counts() to authenticated, service_role;
grant execute on function admin_market_bid_settings(jsonb) to authenticated;
grant execute on function my_market_bid_events(uuid) to authenticated;

commit;

-- ── 크론 등록(트랜잭션 밖, 따로 실행) ──
-- DB 판정은 pg_cron 이 직접(웹 서버가 죽어도 마감 30분 전 자동 취소가 돈다). Stripe 호출(승인 해제·매입 재시도)은 웹 경로.
do $$ begin
  if to_regnamespace('cron') is null then raise notice 'cron 스키마 없음 — 예약 건너뜀'; return; end if;
  perform cron.schedule('tomo_market_bids', '* * * * *', 'select public.cron_market_bids()');
  perform cron.schedule('tomo_market_bids_stripe', '* * * * *', $job$
    select net.http_post(
      url := 'https://tomo.airship.click/api/cron/market-bids',
      headers := jsonb_build_object('content-type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tomo_cron_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 20000)
  $job$);
end $$;

-- ── 되돌리기(이 순서로) ──
-- select cron.unschedule('tomo_market_bids_stripe'); select cron.unschedule('tomo_market_bids');
-- can_read_client_item: 0034 정의로 다시(market_bids 줄 빼기).
-- drop function if exists my_market_bid_events(uuid); drop function if exists admin_market_bid_settings(jsonb);
-- drop function if exists market_bid_ops_counts(); drop function if exists admin_market_bid_detail(uuid); drop function if exists admin_market_bids(text, text, int, int);
-- drop function if exists cron_market_bids(); drop function if exists market_bid_release(uuid, text, text, int, text);
-- drop function if exists market_bid_to_order(uuid); drop function if exists market_bid_capture_failed(uuid, text);
-- drop function if exists market_bid_set_won(uuid, int, int, text, text); drop function if exists market_bid_hold(uuid, text, text);
-- drop function if exists market_bid_set_outbid(uuid, int, text, text); drop function if exists market_bid_set_placed(uuid, int, text, text, timestamptz);
-- drop function if exists market_bid_log(text, market_bids, jsonb); drop function if exists market_bid_note(market_bids, text, jsonb);
-- drop function if exists market_bid_lock(uuid, text, text[]); drop function if exists market_bid_actor_ok();
-- drop trigger if exists market_bids_ops_event on market_bids; drop function if exists ops_on_market_bid();
-- ops_outbox_type_check: 0048 의 13종으로 다시(bid.* 행을 먼저 지운다).
