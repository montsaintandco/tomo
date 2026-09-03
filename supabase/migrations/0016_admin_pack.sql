-- 관리 팩: 상품 숨김(모더레이션)·사용자 정지·분쟁 처리·어드민 함수·탈퇴
-- 컬럼 먼저 — SQL 함수는 정의 시점에 본문을 검증한다
alter table profiles add column if not exists suspended boolean not null default false;

create or replace function is_admin_user() returns boolean
  language sql stable security definer set search_path = public as
  $$ select coalesce((select is_admin from profiles where id = auth.uid()), false) $$;
create or replace function is_suspended() returns boolean
  language sql stable security definer set search_path = public as
  $$ select coalesce((select suspended from profiles where id = auth.uid()), false) $$;

-- ── 상품 숨김: RLS로 전 쿼리에서 자동 제외 (셀러 본인·운영자는 봄) ──
alter table listings
  add column hidden boolean not null default false,
  add column hidden_by_admin boolean not null default false;
drop policy "listings are public" on listings;
create policy "listings are public" on listings for select
  using (not hidden or seller_id = auth.uid() or is_admin_user());

-- 운영자가 숨긴 상품은 셀러가 되살릴 수 없다 (트리거 — WITH CHECK는 이전 행을 못 본다)
create or replace function guard_listing_moderation() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_user() then
    if new.hidden_by_admin <> old.hidden_by_admin then raise exception 'moderation flag is admin only'; end if;
    if old.hidden_by_admin and not new.hidden then raise exception 'hidden by admin'; end if;
  end if;
  return new;
end $$;
create trigger listings_moderation_guard before update on listings
  for each row execute function guard_listing_moderation();

create or replace function admin_set_listing_hidden(p_id uuid, p_hidden boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  update listings set hidden = p_hidden, hidden_by_admin = p_hidden where id = p_id;
end $$;
revoke all on function admin_set_listing_hidden(uuid, boolean) from public;
grant execute on function admin_set_listing_hidden(uuid, boolean) to authenticated;

-- ── 사용자 정지: 글쓰기 전부 차단 (RESTRICTIVE 정책 = 기존 정책과 AND) ──
create policy "suspended cannot list" on listings as restrictive for insert with check (not is_suspended());
create policy "suspended cannot chat" on conversations as restrictive for insert with check (not is_suspended());
create policy "suspended cannot message" on messages as restrictive for insert with check (not is_suspended());
create policy "suspended cannot offer" on offers as restrictive for insert with check (not is_suspended());

create or replace function admin_set_user(p_id uuid, p_suspended boolean, p_admin boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if p_id = auth.uid() and not p_admin then raise exception 'cannot demote yourself'; end if;
  update profiles set suspended = p_suspended, is_admin = p_admin where id = p_id;
  if p_suspended then update listings set hidden = true, hidden_by_admin = true where seller_id = p_id and status = 'active'; end if;
end $$;
revoke all on function admin_set_user(uuid, boolean, boolean) from public;
grant execute on function admin_set_user(uuid, boolean, boolean) to authenticated;

-- ── 탈퇴 = 비활성화 (auth 삭제는 service_role 필요, 거래 이력 보존) ──
create or replace function deactivate_my_account(p_label text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  update profiles set suspended = true, nickname = p_label where id = auth.uid();
  update listings set hidden = true where seller_id = auth.uid();
end $$;
revoke all on function deactivate_my_account(text) from public;
grant execute on function deactivate_my_account(text) to authenticated;

-- ── 분쟁: 당사자가 결제 후 어느 단계에서든 열고, 운영자가 정산/환불로 닫는다 ──
alter table transactions add column dispute_reason text, add column dispute_resolution text;

create or replace function open_dispute(p_tx_id uuid, p_reason text) returns transactions
  language plpgsql security definer set search_path = public as $$
declare v_t transactions; v_uid uuid := auth.uid();
begin
  select * into v_t from transactions where id = p_tx_id;
  if v_t.id is null then raise exception 'tx not found'; end if;
  if v_uid not in (v_t.buyer_id, v_t.seller_id) then raise exception 'not a party'; end if;
  if v_t.status not in ('paid','shipped','shipped_to_center','center_received','shipped_international','delivered')
    then raise exception 'cannot dispute in state %', v_t.status; end if;
  update transactions set status = 'disputed', dispute_reason = left(coalesce(p_reason, ''), 1000)
    where id = p_tx_id returning * into v_t;
  return v_t;
end $$;
revoke all on function open_dispute(uuid, text) from public;
grant execute on function open_dispute(uuid, text) to authenticated;

create or replace function resolve_dispute(p_tx_id uuid, p_to tx_status, p_note text) returns transactions
  language plpgsql security definer set search_path = public as $$
declare v_t transactions;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if p_to not in ('completed','cancelled') then raise exception 'resolution must be completed or cancelled'; end if;
  update transactions set status = p_to, dispute_resolution = left(coalesce(p_note, ''), 1000)
    where id = p_tx_id and status = 'disputed' returning * into v_t;
  if v_t.id is null then raise exception 'not in dispute'; end if;
  -- 환불 취소면 물건은 판매자에게 남는다 → 다시 판매중
  if p_to = 'cancelled' then update listings set status = 'active', reserved_at = null where id = v_t.listing_id; end if;
  return v_t;
end $$;
revoke all on function resolve_dispute(uuid, tx_status, text) from public;
grant execute on function resolve_dispute(uuid, tx_status, text) to authenticated;

-- 운영자: 분쟁 거래 열람 (당사자 정책에 추가)
create policy "admin reads transactions" on transactions for select using (is_admin_user());

-- ── 후기·환율·외부상품 운영 권한 ──
create policy "admin deletes reviews" on reviews for delete using (is_admin_user());
create policy "admin updates rates" on exchange_rates for update using (is_admin_user()) with check (is_admin_user());
create policy "admin deletes external items" on external_items for delete using (is_admin_user());
