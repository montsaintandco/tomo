-- 주소록·탈퇴 차단 (2026-11-23 이식 묶음 C). 0025~0027 뒤에 적용한다.
-- 미적용·미검증(DB 일시정지). 재개 후 begin … rollback 으로 먼저 확인.

-- ── 1. 주소록: 1인 최대 10개, 기본 1개, 한국 통관부호(P+12자리)는 여기에만(profiles 에 두지 않는다) ──
create table if not exists addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  label text not null default '' check (char_length(label) <= 30),
  name text not null check (char_length(trim(name)) between 1 and 60),
  phone text not null check (char_length(trim(phone)) between 1 and 30),
  postal text not null check (char_length(trim(postal)) between 1 and 12),
  address text not null check (char_length(trim(address)) between 1 and 300),
  note text not null default '' check (char_length(note) <= 300),
  pccc text check (pccc is null or pccc ~ '^P[0-9]{12}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists addresses_user_idx on addresses (user_id, created_at);
create unique index if not exists addresses_one_default on addresses (user_id) where is_default;

alter table addresses enable row level security;
create policy "own addresses" on addresses for select using (user_id = auth.uid() or is_admin_user());
create policy "add own address" on addresses for insert with check (user_id = auth.uid());
create policy "edit own address" on addresses for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own address" on addresses for delete using (user_id = auth.uid());
grant select, insert, update, delete on addresses to authenticated;

create or replace function guard_address_limit() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from addresses where user_id = new.user_id) >= 10 then raise exception 'address limit'; end if;
  return new;
end $$;
drop trigger if exists addresses_limit on addresses;
create trigger addresses_limit before insert on addresses for each row execute function guard_address_limit();
revoke all on function guard_address_limit() from public, anon, authenticated;

-- 백필: 기존 배송지(profiles.ship_*)가 있는 회원 → 기본 배송지 1행
insert into addresses (user_id, name, phone, postal, address, note, is_default)
select p.id, trim(p.ship_name), trim(p.ship_phone), trim(p.ship_postal), trim(p.ship_address), coalesce(p.ship_note, ''), true
from profiles p
where coalesce(trim(p.ship_name), '') <> '' and coalesce(trim(p.ship_phone), '') <> ''
  and coalesce(trim(p.ship_postal), '') <> '' and coalesce(trim(p.ship_address), '') <> ''
  and p.deleted_at is null
  and not exists (select 1 from addresses a where a.user_id = p.id);

-- 주문의 통관부호 스냅샷
alter table proxy_orders add column if not exists ship_pccc text;

-- 기본 배송지 변경 + profiles.ship_* 복사(create_proxy_order 와 같은 칸)
create or replace function set_default_address(p_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare a addresses; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  select * into a from addresses where id = p_id and user_id = v_uid for update;
  if a.id is null then raise exception 'not found'; end if;
  update addresses set is_default = false where user_id = v_uid and is_default and id <> p_id;
  update addresses set is_default = true where id = p_id;
  update profiles set ship_name = a.name, ship_phone = a.phone, ship_postal = a.postal,
    ship_address = a.address, ship_note = a.note where id = v_uid;
end $$;
revoke all on function set_default_address(uuid) from public;
grant execute on function set_default_address(uuid) to authenticated;

-- 결제 전 내 주문에 배송지의 통관부호를 찍는다
create or replace function attach_order_pccc(p_order_id uuid, p_address_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_pccc text;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  select pccc into v_pccc from addresses where id = p_address_id and user_id = v_uid;
  if v_pccc is null then raise exception 'pccc required'; end if;
  update proxy_orders set ship_pccc = v_pccc
    where id = p_order_id and user_id = v_uid and status = 'pending_payment';
  if not found then raise exception 'order not payable'; end if;
end $$;
revoke all on function attach_order_pccc(uuid, uuid) from public;
grant execute on function attach_order_pccc(uuid, uuid) to authenticated;

-- ── 2. 탈퇴 차단 사유: [{code, n}] — 빈 배열이면 탈퇴 가능. 앱이 code → i18n my.block.<code> ──
create or replace function account_blockers() returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_out jsonb := '[]'::jsonb; v_n int;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  select count(*) into v_n from transactions
    where (buyer_id = v_uid or seller_id = v_uid) and status not in ('pending_payment', 'completed', 'cancelled');
  if v_n > 0 then v_out := v_out || jsonb_build_object('code', 'tx', 'n', v_n); end if;

  select count(*) into v_n from proxy_requests
    where user_id = v_uid and status in ('approved', 'paid', 'purchasing', 'center_received', 'shipped_international', 'delivered');
  if v_n > 0 then v_out := v_out || jsonb_build_object('code', 'proxy', 'n', v_n); end if;

  -- 0025·0026 테이블은 있을 때만 본다
  if to_regclass('public.refunds') is not null then
    execute 'select count(*) from refunds where user_id = $1 and status::text <> ''done''' into v_n using v_uid;
    if v_n > 0 then v_out := v_out || jsonb_build_object('code', 'refund', 'n', v_n); end if;
  end if;
  if to_regclass('public.seller_ledger') is not null then
    execute 'select count(*) from (select currency from seller_ledger where user_id = $1 group by currency having sum(amount) <> 0) s'
      into v_n using v_uid;
    if v_n > 0 then v_out := v_out || jsonb_build_object('code', 'balance', 'n', v_n); end if;
  end if;
  if to_regclass('public.payouts') is not null then
    execute 'select count(*) from payouts where user_id = $1 and status::text = ''requested''' into v_n using v_uid;
    if v_n > 0 then v_out := v_out || jsonb_build_object('code', 'payout', 'n', v_n); end if;
  end if;
  return v_out;
end $$;
revoke all on function account_blockers() from public;
grant execute on function account_blockers() to authenticated;

-- 탈퇴 재정의(시그니처 유지): 차단 사유가 있으면 'blocked'. 없으면 기존 처리 + 결제 전 대행·대기 주문·대기 제안 정리
create or replace function deactivate_my_account(p_label text) returns void
  language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  if jsonb_array_length(account_blockers()) > 0 then raise exception 'blocked'; end if;
  update profiles set suspended = true, nickname = p_label where id = v_uid;
  update listings set hidden = true where seller_id = v_uid;
  update proxy_requests set status = 'cancelled' where user_id = v_uid and status in ('requested', 'quoted');
  update proxy_orders set status = 'cancelled' where user_id = v_uid and status = 'pending_payment';
  delete from offers where buyer_id = v_uid and status = 'pending';
  update offers set status = 'declined'
    where status = 'pending' and listing_id in (select id from listings where seller_id = v_uid);
end $$;
revoke all on function deactivate_my_account(text) from public;
grant execute on function deactivate_my_account(text) to authenticated;

-- ── 3. 배송지 공개 차단 ──
-- 0002 "profiles are public"(select using true) + 표 단위 select 권한 때문에 profiles.ship_*(이름·전화·주소)를
-- anon 키로 누구나 읽을 수 있었다(2026-11-23 확인). 열 단위 select 로 바꿔 ship_* 를 뺀다.
-- 본인 배송지는 addresses(RLS 본인)에서 읽는다. 앱의 profiles 조회 열은 아래 목록 안에 있다(2026-11-23 grep).
-- tests/cart-rls.test.ts 의 profiles.ship_name 직접 조회는 이 뒤로 실패하므로 addresses 조회로 바꿔야 한다.
revoke select on profiles from anon, authenticated;
grant select (id, nickname, country, region, language, trust_temp, is_admin, created_at, suspended, deleted_at)
  on profiles to anon, authenticated;
