-- 판매 대금 원장 + 출금 신청 + 정산 계좌 (묶음 B, 0025 뒤 적용)
-- 규칙: 원장(seller_ledger) 합 = 잔액. 돈 테이블 직접 쓰기 revoke, SECURITY DEFINER RPC로만.
-- 적립: 거래가 completed 로 바뀌고 결제키가 있으면 sale(+, item_price - platform_fee = lib/fees.ts sellerPayout).
-- 출금: request_payout → payout_hold(−). 반려 → payout_release(+). 지급 완료는 원장 변화 없음(이미 hold).
-- 의존: 0025 log_admin_action(action, target_type, target_id, detail).

create type payout_status as enum ('requested','sent','rejected');

-- ── 정산 계좌 (통화별 1개, 본인이 직접 관리) ──
create table payout_accounts (
  user_id uuid not null references profiles(id) on delete cascade,
  currency currency_code not null,
  bank_name text not null check (char_length(bank_name) between 1 and 60),
  account_number text not null check (account_number ~ '^[0-9-]{4,40}$'),
  account_holder text not null check (char_length(account_holder) between 1 and 60),
  updated_at timestamptz not null default now(),
  primary key (user_id, currency)
);
create trigger payout_accounts_touch before update on payout_accounts
  for each row execute function touch_updated_at();
alter table payout_accounts enable row level security;
create policy "own payout accounts" on payout_accounts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admin reads payout accounts" on payout_accounts for select using (is_admin_user());
revoke all on payout_accounts from anon;
revoke truncate on payout_accounts from authenticated;

-- ── 출금 신청 (계좌는 신청 시점 스냅샷) ──
create table payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  currency currency_code not null,
  amount integer not null check (amount > 0),
  bank_name text not null,
  account_number text not null,
  account_holder text not null,
  status payout_status not null default 'requested',
  admin_note text not null default '',
  processed_by uuid references profiles(id),
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);
create unique index payouts_one_requested on payouts (user_id, currency) where status = 'requested';
create index payouts_status_idx on payouts (status, requested_at desc);
create index payouts_user_idx on payouts (user_id, requested_at desc);
alter table payouts enable row level security;
create policy "own payouts" on payouts for select using (user_id = auth.uid() or is_admin_user());
revoke insert, update, delete, truncate on payouts from authenticated, anon;

-- ── 판매자 원장 ──
create table seller_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id),
  currency currency_code not null,
  amount integer not null check (amount <> 0),
  kind text not null check (kind in ('sale','payout_hold','payout_release','adjust')),
  transaction_id uuid references transactions(id),
  payout_id uuid references payouts(id),
  memo text not null default '',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check ((kind = 'sale') = (transaction_id is not null)),
  check ((kind in ('payout_hold','payout_release')) = (payout_id is not null)),
  check (kind <> 'adjust' or char_length(btrim(memo)) > 0)
);
create unique index seller_ledger_one_sale on seller_ledger (transaction_id) where kind = 'sale';
create unique index seller_ledger_one_per_payout on seller_ledger (payout_id, kind) where payout_id is not null;
create index seller_ledger_user_idx on seller_ledger (user_id, currency, created_at desc);
alter table seller_ledger enable row level security;
create policy "own ledger" on seller_ledger for select using (user_id = auth.uid() or is_admin_user());
revoke insert, update, delete, truncate on seller_ledger from authenticated, anon;

-- 사용자·통화별 잠금 키 (출금 신청·수동 조정 직렬화)
create or replace function payout_lock(p_user uuid, p_currency currency_code) returns void
  language sql security definer set search_path = public as
  $$ select pg_advisory_xact_lock(hashtext('payout:' || p_user::text || ':' || p_currency::text)) $$;
revoke all on function payout_lock(uuid, currency_code) from public, anon, authenticated;

-- ── 적립 트리거: completed 진입 + 결제키 있음 → sale 1행 (중복은 unique 로 무시) ──
create or replace function credit_sale_on_complete() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_amount int := new.item_price - new.platform_fee;
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
     and new.stripe_payment_intent_id is not null and v_amount > 0 then
    insert into seller_ledger (user_id, currency, amount, kind, transaction_id)
      values (new.seller_id, new.currency, v_amount, 'sale', new.id)
      on conflict (transaction_id) where kind = 'sale' do nothing;
  end if;
  return new;
end $$;
revoke all on function credit_sale_on_complete() from public, anon, authenticated;
drop trigger if exists transactions_credit_sale on transactions;
create trigger transactions_credit_sale after update of status on transactions
  for each row execute function credit_sale_on_complete();

-- ── 내 잔액: 통화별 출금 가능액(원장 합) + 신청 중 금액 ──
create or replace function seller_balances()
  returns table (currency currency_code, balance bigint, pending bigint)
  language sql stable security definer set search_path = public as $$
  with b as (
    select l.currency, sum(l.amount)::bigint as balance from seller_ledger l
     where l.user_id = auth.uid() group by l.currency
  ), p as (
    select o.currency, sum(o.amount)::bigint as pending from payouts o
     where o.user_id = auth.uid() and o.status = 'requested' group by o.currency
  )
  select coalesce(b.currency, p.currency), coalesce(b.balance, 0), coalesce(p.pending, 0)
    from b full join p on p.currency = b.currency
$$;
revoke all on function seller_balances() from public, anon;
grant execute on function seller_balances() to authenticated;

-- ── 출금 신청: 잠금 → 계좌·신청 중·잔액 확인 → payouts + payout_hold(−) ──
create or replace function request_payout(p_currency currency_code, p_amount int) returns payouts
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_acc payout_accounts;
  v_balance bigint;
  v_p payouts;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid amount'; end if;
  perform payout_lock(v_uid, p_currency);

  select * into v_acc from payout_accounts where user_id = v_uid and currency = p_currency;
  if v_acc.user_id is null then raise exception 'no payout account'; end if;
  if exists (select 1 from payouts where user_id = v_uid and currency = p_currency and status = 'requested')
    then raise exception 'payout already requested'; end if;

  select coalesce(sum(amount), 0) into v_balance from seller_ledger where user_id = v_uid and currency = p_currency;
  if p_amount > v_balance then raise exception 'insufficient balance'; end if;

  insert into payouts (user_id, currency, amount, bank_name, account_number, account_holder)
    values (v_uid, p_currency, p_amount, v_acc.bank_name, v_acc.account_number, v_acc.account_holder)
    returning * into v_p;
  insert into seller_ledger (user_id, currency, amount, kind, payout_id, created_by)
    values (v_uid, p_currency, -p_amount, 'payout_hold', v_p.id, v_uid);
  return v_p;
end $$;
revoke all on function request_payout(currency_code, int) from public, anon;
grant execute on function request_payout(currency_code, int) to authenticated;

-- ── 관리자 처리: 지급 완료(sent) 또는 반려(rejected, 사유 필수 → payout_release(+)) ──
create or replace function admin_process_payout(p_id uuid, p_sent boolean, p_note text) returns payouts
  language plpgsql security definer set search_path = public as $$
declare v_p payouts; v_note text := left(btrim(coalesce(p_note, '')), 500);
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if not p_sent and v_note = '' then raise exception 'reject reason required'; end if;
  select * into v_p from payouts where id = p_id for update;
  if v_p.id is null or v_p.status <> 'requested' then raise exception 'payout not requested'; end if;

  update payouts set status = case when p_sent then 'sent'::payout_status else 'rejected'::payout_status end,
         admin_note = v_note, processed_by = auth.uid(), processed_at = now()
    where id = p_id returning * into v_p;
  if not p_sent then
    insert into seller_ledger (user_id, currency, amount, kind, payout_id, memo, created_by)
      values (v_p.user_id, v_p.currency, v_p.amount, 'payout_release', v_p.id, v_note, auth.uid());
  end if;
  perform log_admin_action(case when p_sent then 'payout_sent' else 'payout_rejected' end, 'payout', p_id::text,
    jsonb_build_object('user_id', v_p.user_id, 'currency', v_p.currency, 'amount', v_p.amount, 'note', v_note));
  return v_p;
end $$;
revoke all on function admin_process_payout(uuid, boolean, text) from public, anon;
grant execute on function admin_process_payout(uuid, boolean, text) to authenticated;

-- ── 관리자 수동 조정: 메모 필수, 결과 잔액은 0 미만 금지 ──
create or replace function admin_adjust_seller_ledger(p_user uuid, p_currency currency_code, p_amount int, p_memo text)
  returns seller_ledger language plpgsql security definer set search_path = public as $$
declare v_memo text := left(btrim(coalesce(p_memo, '')), 500); v_balance bigint; v_l seller_ledger;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'invalid amount'; end if;
  if v_memo = '' then raise exception 'memo required'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'user not found'; end if;
  perform payout_lock(p_user, p_currency);

  select coalesce(sum(amount), 0) into v_balance from seller_ledger where user_id = p_user and currency = p_currency;
  if v_balance + p_amount < 0 then raise exception 'balance would be negative'; end if;

  insert into seller_ledger (user_id, currency, amount, kind, memo, created_by)
    values (p_user, p_currency, p_amount, 'adjust', v_memo, auth.uid()) returning * into v_l;
  perform log_admin_action('ledger_adjust', 'user', p_user::text,
    jsonb_build_object('currency', p_currency, 'amount', p_amount, 'memo', v_memo, 'ledger_id', v_l.id));
  return v_l;
end $$;
revoke all on function admin_adjust_seller_ledger(uuid, currency_code, int, text) from public, anon;
grant execute on function admin_adjust_seller_ledger(uuid, currency_code, int, text) to authenticated;

-- ── 미지급 합계: 통화별 출금 가능 잔액 합 + 신청 중 합 + 잔액 보유 회원 수 ──
create or replace function admin_seller_liability()
  returns table (currency currency_code, balance bigint, pending bigint, users bigint)
  language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  return query
  with per_user as (
    select l.currency, l.user_id, sum(l.amount)::bigint as bal from seller_ledger l group by l.currency, l.user_id
  ), b as (
    select u.currency, sum(u.bal)::bigint as balance, count(*) filter (where u.bal <> 0)::bigint as users
      from per_user u group by u.currency
  ), p as (
    select o.currency, sum(o.amount)::bigint as pending from payouts o where o.status = 'requested' group by o.currency
  )
  select coalesce(b.currency, p.currency), coalesce(b.balance, 0::bigint), coalesce(p.pending, 0::bigint), coalesce(b.users, 0::bigint)
    from b full join p on p.currency = b.currency;
end $$;
revoke all on function admin_seller_liability() from public, anon;
grant execute on function admin_seller_liability() to authenticated;
