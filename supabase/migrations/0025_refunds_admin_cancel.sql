-- 0025 환불 원장·관리자 취소·활동 기록 (설계: docs/port-plan-2026-11-23.md §3)
-- 순서: DB 상태 변경 + refunds(pending) → 앱이 토스 취소(Idempotency-Key = refunds.id) → refund_mark(service_role).
-- 토스 실패·키 없음이면 refunds 행이 pending/failed로 남아 /admin/refunds 「다시 시도」 대기열이 된다.
-- 돈 테이블(refunds, admin_actions)은 직접 쓰기 금지, SECURITY DEFINER 함수로만 쓴다.

-- ── 1. 컬럼 (함수 본문이 참조하므로 먼저) ──
alter table transactions add column if not exists paid_krw integer;      -- 토스에 실제 청구한 원화 (/api/toss/confirm이 기록)
alter table transactions add column if not exists cancel_reason text;
alter table proxy_orders add column if not exists paid_krw integer;
alter table proxy_requests add column if not exists cancel_reason text;
alter table proxy_requests add column if not exists cancel_requested_at timestamptz;   -- 고객 취소 요청 (결제 후)
alter table proxy_requests add column if not exists refund_amount integer;             -- 이 항목 취소로 약속한 환불액 (주문 통화)

-- ── 2. 관리자 활동 기록 ──
create table if not exists admin_actions (
  id bigint generated always as identity primary key,
  admin_id uuid references profiles(id),
  action text not null,
  target_type text not null,
  target_id text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists admin_actions_created_idx on admin_actions (created_at desc);
create index if not exists admin_actions_target_idx on admin_actions (target_type, target_id);
alter table admin_actions enable row level security;
create policy "admin reads actions" on admin_actions for select using (is_admin_user());
revoke insert, update, delete on admin_actions from authenticated, anon;

-- 내부 전용: 다른 SECURITY DEFINER 함수 안에서만 호출 (클라이언트 실행 권한 없음)
create or replace function log_admin_action(p_action text, p_target_type text, p_target_id text, p_detail jsonb default '{}')
  returns void language sql security definer set search_path = public as $$
  insert into admin_actions (admin_id, action, target_type, target_id, detail)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb));
$$;
revoke all on function log_admin_action(text, text, text, jsonb) from public, anon, authenticated;

-- ── 3. 환불 원장 ──
create type refund_status as enum ('pending','done','failed');
create table if not exists refunds (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('tx','proxy_order')),
  transaction_id uuid references transactions(id),
  proxy_order_id uuid references proxy_orders(id),
  proxy_request_id uuid references proxy_requests(id),
  user_id uuid not null references profiles(id),          -- 환불 받는 사람(구매자)
  payment_key text not null,                               -- 토스 paymentKey (= stripe_payment_intent_id 컬럼 값)
  amount integer not null check (amount > 0),              -- 주문/거래 통화 기준 환불액
  currency currency_code not null,
  amount_krw integer,                                      -- 실제 토스 취소 원화. 처리 전 null
  is_full boolean not null default false,                  -- true면 토스 잔액 전부 취소(cancelAmount 없이)
  reason text not null,
  status refund_status not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  constraint refunds_kind_target check (
    (kind = 'tx' and transaction_id is not null) or (kind = 'proxy_order' and proxy_order_id is not null))
);
create unique index if not exists refunds_tx_once on refunds (transaction_id) where kind = 'tx';
create unique index if not exists refunds_request_once on refunds (proxy_request_id) where proxy_request_id is not null;
create index if not exists refunds_status_idx on refunds (status, created_at);
create index if not exists refunds_order_idx on refunds (proxy_order_id);
alter table refunds enable row level security;
create policy "own or admin reads refunds" on refunds for select using (user_id = auth.uid() or is_admin_user());
revoke insert, update, delete on refunds from authenticated, anon;

-- ── 4. 대행 주문 금액 재계산 (취소되지 않은 항목만) — create_proxy_order(0020)와 같은 규칙 ──
-- 항목 가격 = proxy_requests.quote_item_price(주문 시점 상품가, 상품 통화), 주문 통화 환산은 주문의 rate로 항목별 round
create or replace function proxy_order_amount(p_order_id uuid) returns integer
  language plpgsql stable security definer set search_path = public as $$
declare v_o proxy_orders; v_sub int;
begin
  select * into v_o from proxy_orders where id = p_order_id;
  if v_o.id is null then return 0; end if;
  select coalesce(sum(case when e.currency = v_o.currency then coalesce(r.quote_item_price, e.price)
                           else round(coalesce(r.quote_item_price, e.price) * v_o.rate)::int end), 0)
    into v_sub
    from proxy_requests r join external_items e on e.id = r.external_item_id
    where r.order_id = p_order_id and r.status <> 'cancelled';
  if v_sub <= 0 then return 0; end if;
  return v_sub + v_o.intl_shipping + proxy_customs(v_sub, v_o.intl_shipping, v_o.currency);
end $$;
revoke all on function proxy_order_amount(uuid) from public, anon, authenticated;

-- ── 5. 분쟁 처리 재정의 (시그니처 유지): 환불 취소 + 결제키 있으면 refunds pending ──
create or replace function resolve_dispute(p_tx_id uuid, p_to tx_status, p_note text) returns transactions
  language plpgsql security definer set search_path = public as $$
declare v_t transactions; v_refund uuid;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if p_to not in ('completed','cancelled') then raise exception 'resolution must be completed or cancelled'; end if;
  update transactions set status = p_to, dispute_resolution = left(coalesce(p_note, ''), 1000)
    where id = p_tx_id and status = 'disputed' returning * into v_t;
  if v_t.id is null then raise exception 'not in dispute'; end if;
  if p_to = 'cancelled' then
    -- 환불 취소면 물건은 판매자에게 남는다 → 다시 판매중
    update listings set status = 'active', reserved_at = null where id = v_t.listing_id;
    if v_t.stripe_payment_intent_id is not null then
      insert into refunds (kind, transaction_id, user_id, payment_key, amount, currency, is_full, reason, created_by)
        values ('tx', v_t.id, v_t.buyer_id, v_t.stripe_payment_intent_id,
          v_t.item_price + case when v_t.is_cross_border then v_t.intl_shipping_fee else 0 end,
          v_t.currency, true, coalesce(nullif(trim(p_note), ''), '분쟁 환불'), auth.uid())
        on conflict do nothing
        returning id into v_refund;
    end if;
  end if;
  perform log_admin_action('dispute_' || p_to::text, 'transaction', v_t.id::text,
    jsonb_build_object('note', left(coalesce(p_note, ''), 300), 'refund_id', v_refund));
  return v_t;
end $$;
revoke all on function resolve_dispute(uuid, tx_status, text) from public;
grant execute on function resolve_dispute(uuid, tx_status, text) to authenticated;

-- ── 6. 관리자 거래 취소 (결제 후, 판매자 발송 전·센터 단계) ──
create or replace function admin_cancel_transaction(p_tx_id uuid, p_reason text) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare v_t transactions; v_from tx_status; v_refund uuid; v_amount int;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'reason required'; end if;
  select * into v_t from transactions where id = p_tx_id for update;
  if v_t.id is null then raise exception 'tx not found'; end if;
  v_from := v_t.status;
  if v_from not in ('paid','shipped_to_center','center_received') then
    raise exception 'cannot cancel in state %', v_from;
  end if;
  update transactions set status = 'cancelled', cancel_reason = left(trim(p_reason), 1000)
    where id = p_tx_id and status = v_from returning * into v_t;
  if not found then raise exception 'state changed concurrently'; end if;
  -- 판매자가 아직 보내지 않았을 때(paid)만 다시 판매중. 센터에 있는 물건은 운영자가 반송 처리
  if v_from = 'paid' then
    update listings set status = 'active', reserved_at = null where id = v_t.listing_id;
  end if;
  v_amount := v_t.item_price + case when v_t.is_cross_border then v_t.intl_shipping_fee else 0 end;
  if v_t.stripe_payment_intent_id is not null and v_amount > 0 then
    insert into refunds (kind, transaction_id, user_id, payment_key, amount, currency, is_full, reason, created_by)
      values ('tx', v_t.id, v_t.buyer_id, v_t.stripe_payment_intent_id, v_amount, v_t.currency, true,
        left(trim(p_reason), 1000), auth.uid())
      on conflict do nothing
      returning id into v_refund;
  end if;
  perform log_admin_action('tx_cancel', 'transaction', v_t.id::text,
    jsonb_build_object('from', v_from, 'reason', left(trim(p_reason), 300), 'refund_id', v_refund, 'amount', v_amount, 'currency', v_t.currency));
  return jsonb_build_object('refund', v_refund, 'amount', case when v_refund is null then 0 else v_amount end, 'currency', v_t.currency);
end $$;
revoke all on function admin_cancel_transaction(uuid, text) from public;
grant execute on function admin_cancel_transaction(uuid, text) to authenticated;

-- ── 7. 관리자 강제 구매확정 (delivered → completed) ──
create or replace function admin_complete_transaction(p_tx_id uuid, p_note text) returns transactions
  language plpgsql security definer set search_path = public as $$
declare v_t transactions;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  update transactions set status = 'completed' where id = p_tx_id and status = 'delivered' returning * into v_t;
  if v_t.id is null then raise exception 'not in delivered state'; end if;
  perform log_admin_action('tx_force_complete', 'transaction', v_t.id::text, jsonb_build_object('note', left(coalesce(p_note, ''), 300)));
  return v_t;
end $$;
revoke all on function admin_complete_transaction(uuid, text) from public;
grant execute on function admin_complete_transaction(uuid, text) to authenticated;

-- ── 8. 관리자 대행 취소 (항목 단위, 결제분 부분 환불) ──
-- 환불액 기본값 = 취소 전 주문 금액 − 남은 항목으로 재계산한 금액. 남은 항목이 없으면 미환불 잔액 전부.
-- 상한 = 주문 total − 이미 잡힌 환불 합(pending·failed 포함 — 모두 갚을 돈). p_refund_amount로 상한 안에서 수정 가능(0 = 환불 없음)
create or replace function admin_cancel_proxy(p_id uuid, p_reason text, p_refund_amount int default null) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  v_r proxy_requests; v_o proxy_orders; v_reason text; v_from proxy_status;
  v_before int; v_after int; v_refunded int; v_cap int; v_default int; v_amount int;
  v_left int; v_full boolean; v_refund uuid;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  select * into v_r from proxy_requests where id = p_id;
  if v_r.id is null then raise exception 'not found'; end if;
  -- 같은 주문의 취소를 직렬화 (부분 환불 합계가 겹치지 않게)
  if v_r.order_id is not null then
    select * into v_o from proxy_orders where id = v_r.order_id for update;
  end if;
  select * into v_r from proxy_requests where id = p_id for update;
  v_from := v_r.status;
  if v_from in ('completed','cancelled') then raise exception 'cannot cancel in state %', v_from; end if;
  v_reason := left(nullif(trim(coalesce(nullif(trim(p_reason), ''), v_r.cancel_reason, '')), ''), 1000);
  if v_reason is null then raise exception 'reason required'; end if;

  v_before := case when v_o.id is null then 0 else proxy_order_amount(v_o.id) end;
  update proxy_requests set status = 'cancelled', cancel_reason = v_reason where id = p_id and status = v_from;
  if not found then raise exception 'state changed concurrently'; end if;

  -- 결제된 주문이 아니면 환불 없음
  if v_o.id is null or v_o.status <> 'paid' or v_o.stripe_payment_intent_id is null then
    perform log_admin_action('proxy_cancel', 'proxy_request', p_id::text,
      jsonb_build_object('from', v_from, 'reason', left(v_reason, 300), 'refund', null));
    return jsonb_build_object('refund', null, 'amount', 0);
  end if;

  v_after := proxy_order_amount(v_o.id);
  select coalesce(sum(amount), 0) into v_refunded from refunds where proxy_order_id = v_o.id;
  v_cap := greatest(v_o.total - v_refunded, 0);
  select count(*) into v_left from proxy_requests where order_id = v_o.id and status <> 'cancelled';
  v_default := case when v_left = 0 then v_cap else least(greatest(v_before - v_after, 0), v_cap) end;
  v_amount := coalesce(p_refund_amount, v_default);
  if v_amount < 0 or v_amount > v_cap then raise exception 'refund amount out of range (0..%)', v_cap; end if;
  v_full := v_amount > 0 and v_amount = v_cap;

  update proxy_requests set refund_amount = v_amount where id = p_id;
  if v_amount > 0 then
    insert into refunds (kind, proxy_order_id, proxy_request_id, user_id, payment_key, amount, currency, is_full, reason, created_by)
      values ('proxy_order', v_o.id, p_id, v_o.user_id, v_o.stripe_payment_intent_id, v_amount, v_o.currency, v_full, v_reason, auth.uid())
      returning id into v_refund;
  end if;
  if v_left = 0 then update proxy_orders set status = 'cancelled' where id = v_o.id; end if;

  perform log_admin_action('proxy_cancel', 'proxy_request', p_id::text,
    jsonb_build_object('from', v_from, 'reason', left(v_reason, 300), 'order_id', v_o.id, 'refund_id', v_refund,
      'amount', v_amount, 'default', v_default, 'cap', v_cap, 'currency', v_o.currency));
  return jsonb_build_object('refund', v_refund, 'amount', v_amount, 'default', v_default, 'cap', v_cap,
    'currency', v_o.currency, 'is_full', v_full);
end $$;
revoke all on function admin_cancel_proxy(uuid, text, int) from public;
grant execute on function admin_cancel_proxy(uuid, text, int) to authenticated;

-- ── 9. 고객 취소 요청 (결제 후 paid 단계만, 운영자가 승인·환불) ──
create or replace function request_proxy_cancel(p_id uuid, p_reason text) returns proxy_requests
  language plpgsql security definer set search_path = public as $$
declare v_r proxy_requests;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'reason required'; end if;
  update proxy_requests set cancel_reason = left(trim(p_reason), 1000), cancel_requested_at = coalesce(cancel_requested_at, now())
    where id = p_id and user_id = auth.uid() and status = 'paid'
    returning * into v_r;
  if v_r.id is null then raise exception 'cannot request cancel'; end if;
  return v_r;
end $$;
revoke all on function request_proxy_cancel(uuid, text) from public;
grant execute on function request_proxy_cancel(uuid, text) to authenticated;

-- ── 10. 환불 결과 기록 (서버 service_role 전용) ──
create or replace function refund_mark(p_id uuid, p_ok boolean, p_error text, p_amount_krw int) returns refunds
  language plpgsql security definer set search_path = public as $$
declare v_f refunds;
begin
  update refunds set
    status = case when p_ok then 'done'::refund_status else 'failed'::refund_status end,
    attempts = attempts + 1,
    last_error = case when p_ok then null else left(coalesce(p_error, ''), 500) end,
    amount_krw = case when p_ok then coalesce(p_amount_krw, amount_krw) else amount_krw end,
    done_at = case when p_ok then now() else null end
    where id = p_id and status <> 'done'
    returning * into v_f;
  if v_f.id is null then select * into v_f from refunds where id = p_id; end if;   -- 이미 완료(멱등)
  return v_f;
end $$;
revoke all on function refund_mark(uuid, boolean, text, int) from public, anon, authenticated;

-- ── 11. 결제 후 대행 취소는 admin_cancel_proxy로만 (환불 없이 취소되는 길 차단). 나머지는 0012와 동일 ──
create or replace function advance_proxy(p_id uuid, p_to proxy_status, p_tracking text default null)
  returns proxy_requests language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_admin boolean := false; v_r proxy_requests;
  v_from proxy_status; v_owner boolean; v_ok boolean := false;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  select * into v_r from proxy_requests where id = p_id;
  if v_r is null then raise exception 'not found'; end if;
  select is_admin into v_admin from profiles where id = v_uid;
  v_admin := coalesce(v_admin, false);
  v_owner := v_r.user_id = v_uid;
  if not v_owner and not v_admin then raise exception 'not authorized'; end if;
  v_from := v_r.status;

  v_ok :=
       (v_owner and v_from = 'quoted'    and p_to = 'approved')
    or (v_owner and v_from = 'delivered' and p_to = 'completed')
    or (v_owner and v_from in ('requested','quoted','approved') and p_to = 'cancelled')
    or (v_admin and v_from = 'approved'             and p_to = 'paid')
    or (v_admin and v_from = 'paid'                 and p_to = 'purchasing')
    or (v_admin and v_from = 'purchasing'           and p_to = 'center_received')
    or (v_admin and v_from = 'center_received'      and p_to = 'shipped_international')
    or (v_admin and v_from = 'shipped_international' and p_to = 'delivered')
    or (v_admin and v_from in ('requested','quoted','approved') and p_to = 'cancelled');

  if not v_ok then raise exception 'illegal proxy transition % -> % (결제 후 취소는 admin_cancel_proxy)', v_from, p_to; end if;

  update proxy_requests set status = p_to,
    intl_tracking = case when p_to = 'shipped_international'
      then coalesce(p_tracking, intl_tracking) else intl_tracking end
    where id = p_id and status = v_from
    returning * into v_r;
  if not found then raise exception 'state changed concurrently'; end if;
  return v_r;
end $$;
revoke execute on function advance_proxy(uuid, proxy_status, text) from public;
grant execute on function advance_proxy(uuid, proxy_status, text) to authenticated;

-- ── 12. 정지·숨김도 활동 기록에 남긴다 (시그니처·동작은 0016과 동일 + 로그) ──
create or replace function admin_set_user(p_id uuid, p_suspended boolean, p_admin boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if p_id = auth.uid() and not p_admin then raise exception 'cannot demote yourself'; end if;
  update profiles set suspended = p_suspended, is_admin = p_admin where id = p_id;
  if p_suspended then update listings set hidden = true, hidden_by_admin = true where seller_id = p_id and status = 'active'; end if;
  perform log_admin_action('user_set', 'user', p_id::text, jsonb_build_object('suspended', p_suspended, 'admin', p_admin));
end $$;
revoke all on function admin_set_user(uuid, boolean, boolean) from public;
grant execute on function admin_set_user(uuid, boolean, boolean) to authenticated;

create or replace function admin_set_listing_hidden(p_id uuid, p_hidden boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  update listings set hidden = p_hidden, hidden_by_admin = p_hidden where id = p_id;
  perform log_admin_action('listing_hidden', 'listing', p_id::text, jsonb_build_object('hidden', p_hidden));
end $$;
revoke all on function admin_set_listing_hidden(uuid, boolean) from public;
grant execute on function admin_set_listing_hidden(uuid, boolean) to authenticated;
