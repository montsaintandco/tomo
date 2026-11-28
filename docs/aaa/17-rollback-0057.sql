-- 0057 되돌리기 (적용 전 함수 정의 원문, 2026-11-27 운영 DB 에서 뽑음). 기록이 있으면 먼저 뽑아 둔다:
--   select * from tx_center_steps; select id, customs_deposit, customs_actual, ship_overage from transactions where customs_deposit > 0 or ship_overage > 0;
begin;
select cron.unschedule('tomo_center_steps');
CREATE OR REPLACE FUNCTION public.admin_cancel_transaction(p_tx_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_t transactions; v_from tx_status; v_refund uuid; v_amount int; v_listing text;
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
  v_listing := listing_after_tx_cancel(v_t.listing_id, v_t.id, v_from);
  v_amount := v_t.item_price + case when v_t.is_cross_border then v_t.intl_shipping_fee else 0 end;
  if v_t.stripe_payment_intent_id is not null and v_amount > 0 then
    insert into refunds (kind, transaction_id, user_id, payment_key, amount, currency, is_full, reason, created_by)
      values ('tx', v_t.id, v_t.buyer_id, v_t.stripe_payment_intent_id, v_amount, v_t.currency, true,
        left(trim(p_reason), 1000), auth.uid())
      on conflict do nothing
      returning id into v_refund;
  end if;
  perform log_admin_action('tx_cancel', 'transaction', v_t.id::text,
    jsonb_build_object('from', v_from, 'reason', left(trim(p_reason), 300), 'refund_id', v_refund, 'amount', v_amount,
      'currency', v_t.currency, 'listing', v_listing));
  return jsonb_build_object('refund', v_refund, 'amount', case when v_refund is null then 0 else v_amount end,
    'currency', v_t.currency, 'listing', v_listing);
end $function$;

CREATE OR REPLACE FUNCTION public.credit_sale_on_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_amount int := new.item_price - new.platform_fee;
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
     and new.stripe_payment_intent_id is not null and v_amount > 0 then
    insert into seller_ledger (user_id, currency, amount, kind, transaction_id)
      values (new.seller_id, new.currency, v_amount, 'sale', new.id)
      on conflict (transaction_id) where kind = 'sale' do nothing;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.resolve_dispute(p_tx_id uuid, p_to tx_status, p_note text)
 RETURNS transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_t transactions; v_refund uuid; v_listing text;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if p_to not in ('completed','cancelled') then raise exception 'resolution must be completed or cancelled'; end if;
  update transactions set status = p_to, dispute_resolution = left(coalesce(p_note, ''), 1000)
    where id = p_tx_id and status = 'disputed' returning * into v_t;
  if v_t.id is null then raise exception 'not in dispute'; end if;
  if p_to = 'cancelled' then
    -- 직전 상태를 모르면(0041 이전 분쟁) 보류 쪽으로 본다
    v_listing := listing_after_tx_cancel(v_t.listing_id, v_t.id, coalesce(v_t.disputed_from, 'delivered'));
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
    jsonb_strip_nulls(jsonb_build_object('note', left(coalesce(p_note, ''), 300), 'refund_id', v_refund,
      'from', v_t.disputed_from, 'listing', v_listing)));
  return v_t;
end $function$;

CREATE OR REPLACE FUNCTION public.start_auction_transaction(p_auction uuid)
 RETURNS transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_a auctions; v_l listings; v_tx transactions; v_country country_code;
  v_cross boolean; v_center center_code;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  perform release_stale_reservations();
  select * into v_a from auctions where id = p_auction for update;   -- 같은 낙찰의 거래 열기를 한 줄로
  if v_a.id is null then raise exception 'auction not found'; end if;
  if v_a.winner_id is distinct from v_uid then raise exception 'not winner'; end if;
  if v_a.status <> 'awaiting_payment' then raise exception 'auction not payable'; end if;
  -- 이미 열린 결제 대기 거래가 있으면 그것을 돌려준다(결제창 재사용은 /api/checkout 규칙)
  select * into v_tx from transactions
    where listing_id = v_a.listing_id and buyer_id = v_uid and status = 'pending_payment' and created_at >= v_a.closed_at
    order by created_at desc limit 1;
  if found then return v_tx; end if;
  if clock_timestamp() >= v_a.pay_due_at then raise exception 'payment window closed'; end if;
  if exists (select 1 from transactions where listing_id = v_a.listing_id and status not in ('cancelled', 'completed')) then
    raise exception 'listing not available';
  end if;
  select * into v_l from listings where id = v_a.listing_id for update;
  if v_l.status <> 'reserved' then raise exception 'listing not available'; end if;

  select country into v_country from profiles where id = v_uid;
  v_cross := v_l.cross_border_enabled and v_l.country <> v_country;
  v_center := case when v_cross then (case v_l.country when 'JP' then 'NARITA'::center_code else 'SEOUL'::center_code end) else null end;
  insert into transactions (listing_id, buyer_id, seller_id, status, is_cross_border, center, meetup,
      item_price, intl_shipping_fee, platform_fee, currency)
    values (v_a.listing_id, v_uid, v_a.seller_id, 'pending_payment', v_cross, v_center, false,
      v_a.final_price,
      case when v_cross then (case when v_a.currency = 'KRW' then 8000 else 900 end) else 0 end,
      floor(v_a.final_price * 0.10)::int, v_a.currency)
    returning * into v_tx;

  perform set_config('tomo.auction', '1', true);
  update listings set reserved_at = now() where id = v_a.listing_id;
  update auctions set tx_id = v_tx.id where id = p_auction;
  perform set_config('tomo.auction', '', true);
  return v_tx;
end $function$;

CREATE OR REPLACE FUNCTION public.start_transaction(p_listing_id uuid, p_intl_shipping_fee integer DEFAULT 0, p_meetup boolean DEFAULT false)
 RETURNS transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

drop trigger if exists transactions_center_step on public.transactions;
drop function if exists public.tx_center_step_on_paid();
drop function if exists public.admin_set_center_step(uuid, text, text);
drop function if exists public.cron_center_steps();
drop function if exists public.tx_center_ref(uuid);
drop table if exists public.tx_center_steps;
drop function if exists public.admin_settle_customs(uuid, int, text);
drop function if exists public.admin_set_measured_weight(uuid, numeric);
drop function if exists public.tx_refundable(transactions);
drop function if exists public.tx_charge_base(transactions);
drop index if exists public.refunds_tx_customs_once;
drop index if exists public.refunds_tx_once;
create unique index refunds_tx_once on public.refunds (transaction_id) where kind = 'tx';   -- 부분 환불 행이 있으면 실패한다(먼저 정리)
alter table public.ops_outbox drop constraint ops_outbox_type_check;
alter table public.ops_outbox add constraint ops_outbox_type_check check (type = any (array['order.paid', 'order.cancel_requested',
  'dispute.opened', 'ticket.opened', 'refund.pending', 'payout.requested', 'report.opened', 'errors.spike', 'cron.failed',
  'auction.ended', 'auction.unpaid', 'auction.cancelled', 'auction.flagged', 'bid.requested', 'bid.hold', 'bid.won', 'bid.missed',
  'bid.capture_failed', 'bid.auth_expiring', 'bid.to_place_due', 'bid.worker_down', 'bid.to_buy_due']::text[]));   -- center.* 행이 있으면 먼저 지운다
alter table public.transactions drop column customs_deposit, drop column customs_actual, drop column customs_shortfall,
  drop column customs_settled_at, drop column ship_weight_kg, drop column measured_weight_kg, drop column ship_overage;
drop trigger if exists listings_require_weight on public.listings;
drop function if exists public.listing_require_weight();
alter table public.listings drop column ship_weight_kg;
drop function if exists public.listing_quote(uuid);
drop function if exists public.direct_intl_fee(country_code, currency_code, numeric);
drop function if exists public.direct_customs_deposit(country_code, currency_code, int);
drop function if exists public.customs_min_krw();
drop function if exists public.intl_ship_bands();
drop function if exists public.intl_ship_fee_krw(numeric);
drop function if exists public.admin_set_ship_rate(numeric, int);
drop function if exists public.admin_set_ship_markup(numeric);
drop table if exists public.intl_ship_rates;
drop table if exists public.intl_ship_settings;
commit;
