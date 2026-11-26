-- 0031 Stripe 전환(2026-11-23): 거래 결제 확정을 한 문장으로 + 결제창 시간에 맞춘 예약 유지 + 거래별 결제창(세션) id.
-- 1) mark_tx_paid: 거래 id 기준으로 pending → paid 와 PI 기록을 한 번에(그 사이 취소가 끼어들 틈이 없다). 결과 행을 돌려준다.
-- 2) release_stale_reservations: 미결제 예약 유지 10분 → 45분. Stripe 결제창은 최소 30분 열려 있고, 재결제 새 창은 거래 생성 10분 안에만 연다(앱).
--    10분이면 결제창이 열린 채 거래가 취소돼 「돈은 받고 거래는 취소」 → 자동 환불이 생긴다.
-- 3) transactions.stripe_session_id: 재결제 때 열린 창을 다시 쓰고 옛 창을 닫는다.
begin;

alter table transactions add column if not exists stripe_session_id text;

create or replace function mark_tx_paid(p_tx_id uuid, p_payment_intent_id text)
  returns transactions language plpgsql security definer set search_path = public as $$
declare v_t transactions;
begin
  update transactions set status = 'paid', stripe_payment_intent_id = p_payment_intent_id
    where id = p_tx_id and status = 'pending_payment' returning * into v_t;
  if found then
    update listings set status = 'sold' where id = v_t.listing_id;
    return v_t;
  end if;
  select * into v_t from transactions where id = p_tx_id;
  return v_t;
end $$;
revoke all on function mark_tx_paid(uuid, text) from public, anon, authenticated;

create or replace function release_stale_reservations() returns void
  language plpgsql security definer set search_path = public as $$
begin
  update transactions set status = 'cancelled'
    where status = 'pending_payment' and created_at < now() - interval '45 minutes';
  update listings set status = 'active', reserved_at = null
    where status = 'reserved' and reserved_at < now() - interval '45 minutes'
      and not exists (
        select 1 from transactions t
        where t.listing_id = listings.id
          and t.status not in ('pending_payment','cancelled'));
end $$;
revoke all on function release_stale_reservations() from public, anon, authenticated;

commit;