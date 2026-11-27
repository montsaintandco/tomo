-- 0041 운영 안전 (설계: docs/aaa/12-airship-admin-integration.md 4장 P0 · 6.1 T1)
-- 1) 상품 「보류」(held): 판매자 발송 뒤 취소·분쟁 환불된 상품은 다시 팔리지 않게 묶는다. 운영자가 반송을 확인하면 풀고, 판매자가 다시 공개한다.
-- 2) 정지된 운영자는 운영 함수·운영 읽기 권한을 잃는다(is_admin_user + 직접 is_admin 검사 자리).
-- 3) 회원 완전 삭제 전 검사(진행 거래·대행, 환불 대기, 정산 잔액, 출금 대기) + 활동 기록.
-- 4) 운영 표 직접 쓰기(배너·공지·인기 테마·환율·외부 상품·문의 답변·후기 삭제)를 활동 기록에 남긴다.
--
-- 적용 순서 주의: ① 줄(enum 값 추가)은 따로 먼저 커밋해야 한다. 같은 트랜잭션 안에서는 'held' 값을 쓸 수 없다.

-- ── ① 상품 상태 값 ──
alter type listing_status add value if not exists 'held';

-- ── ② 컬럼 ──
alter table listings add column if not exists held_at timestamptz;
alter table listings add column if not exists held_tx_id uuid references transactions(id);  -- 2026-11-27: 이 FK 가 transactions↔listings 임베드를 모호(PGRST201)하게 만들어 거래 화면이 5시간 장애. 0051 이 지운다(칸은 남김)
alter table transactions add column if not exists disputed_from tx_status;   -- 분쟁 직전 상태(물건 위치 판단용)

-- 분쟁 진입 시 직전 상태를 남긴다 (open_dispute·advance_transaction 둘 다 이 트리거로 잡힌다)
create or replace function remember_disputed_from() returns trigger
  language plpgsql set search_path = public as $$
begin
  if new.status = 'disputed' and old.status is distinct from 'disputed' then
    new.disputed_from := old.status;
  end if;
  return new;
end $$;
revoke all on function remember_disputed_from() from public, anon, authenticated;
drop trigger if exists transactions_disputed_from on transactions;
create trigger transactions_disputed_from before update of status on transactions
  for each row execute function remember_disputed_from();

-- ── ③ 정지된 운영자는 운영자가 아니다 ──
create or replace function is_admin_user() returns boolean
  language sql stable security definer set search_path = public as
  $$ select coalesce((select is_admin and not suspended from profiles where id = auth.uid()), false) $$;

-- 함수 본문에서 is_admin 을 직접 읽는 자리(advance_transaction·advance_proxy 등)를 is_admin_user() 로 바꾼다.
-- 운영 DB 의 현재 정의를 그대로 가져와 그 한 줄만 바꾼다(다른 부분은 건드리지 않음).
do $$
declare r record; v_def text; v_new text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosrc ~* 'select\s+is_admin\s+into\s+v_admin\s+from\s+profiles\s+where\s+id\s*=\s*v_uid'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_def, 'select\s+is_admin\s+into\s+v_admin\s+from\s+profiles\s+where\s+id\s*=\s*v_uid\s*;',
                            'v_admin := is_admin_user();', 'gi');
    if v_new = v_def then raise exception '0041: is_admin 치환 실패 (oid %)', r.oid; end if;
    execute v_new;
  end loop;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.prosrc ~* 'select\s+is_admin\s+into') then
    raise exception '0041: is_admin 직접 검사가 남아 있음';
  end if;
end $$;

-- 정책에서 is_admin 을 직접 읽던 자리 (0010·0011·0012)
drop policy if exists "admin reads transactions" on transactions;
create policy "admin reads transactions" on transactions for select using (is_admin_user());
drop policy if exists "admin writes external items" on external_items;
create policy "admin writes external items" on external_items for insert with check (is_admin_user());
drop policy if exists "admin updates external items" on external_items;
create policy "admin updates external items" on external_items for update using (is_admin_user());
drop policy if exists "admin reads proxy requests" on proxy_requests;
create policy "admin reads proxy requests" on proxy_requests for select using (is_admin_user());

-- ── ④ 취소·분쟁 환불 뒤 상품 상태 (한 함수) ──
-- 판매자가 아직 보내지 않았으면(결제 전·paid) 다시 판매중. 그 뒤 단계(발송·센터·배송·완료 직전)나 알 수 없으면 보류.
create or replace function listing_after_tx_cancel(p_listing uuid, p_tx uuid, p_from tx_status) returns text
  language plpgsql security definer set search_path = public as $$
begin
  if p_from in ('pending_payment','paid') then
    update listings set status = 'active', reserved_at = null, held_at = null, held_tx_id = null where id = p_listing;
    return 'active';
  end if;
  update listings set status = 'held', reserved_at = null, held_at = now(), held_tx_id = p_tx where id = p_listing;
  return 'held';
end $$;
revoke all on function listing_after_tx_cancel(uuid, uuid, tx_status) from public, anon, authenticated;

-- 분쟁 처리 (시그니처 유지, 0025 + 보류 규칙)
create or replace function resolve_dispute(p_tx_id uuid, p_to tx_status, p_note text) returns transactions
  language plpgsql security definer set search_path = public as $$
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
end $$;
revoke all on function resolve_dispute(uuid, tx_status, text) from public;
grant execute on function resolve_dispute(uuid, tx_status, text) to authenticated;

-- 운영자 거래 취소 (시그니처 유지, 0025 + 보류 규칙: 센터 단계면 보류)
create or replace function admin_cancel_transaction(p_tx_id uuid, p_reason text) returns jsonb
  language plpgsql security definer set search_path = public as $$
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
end $$;
revoke all on function admin_cancel_transaction(uuid, text) from public;
grant execute on function admin_cancel_transaction(uuid, text) to authenticated;

-- 보류 상태는 운영자만 넣고 뺀다 (판매자의 상태 버튼·콘솔 직접 수정 차단). 서버(service_role, auth.uid() 없음)는 통과.
create or replace function guard_listing_hold() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and (old.status = 'held' or new.status = 'held')
     and auth.uid() is not null and not is_admin_user() then
    raise exception 'listing on hold';
  end if;
  return new;
end $$;
revoke all on function guard_listing_hold() from public, anon, authenticated;
drop trigger if exists listings_hold_guard on listings;
create trigger listings_hold_guard before update of status on listings
  for each row execute function guard_listing_hold();

-- 보류 해제: 운영자가 반송(또는 판매자 회수)을 확인 → 판매중 + 판매자 숨김. 판매자가 「보이기」를 눌러 다시 판다.
create or replace function admin_release_listing_hold(p_id uuid, p_note text) returns listings
  language plpgsql security definer set search_path = public as $$
declare v_l listings; v_tx uuid;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if length(trim(coalesce(p_note, ''))) = 0 then raise exception 'note required'; end if;
  select held_tx_id into v_tx from listings where id = p_id;
  update listings set status = 'active', hidden = true, reserved_at = null, held_at = null, held_tx_id = null
    where id = p_id and status = 'held' returning * into v_l;
  if v_l.id is null then raise exception 'not on hold'; end if;
  perform log_admin_action('listing_release', 'listing', p_id::text,
    jsonb_strip_nulls(jsonb_build_object('note', left(trim(p_note), 300), 'tx', v_tx)));
  return v_l;
end $$;
revoke all on function admin_release_listing_hold(uuid, text) from public;
grant execute on function admin_release_listing_hold(uuid, text) to authenticated;

-- ── ⑤ 회원 완전 삭제 검사 ──
-- 막는 것: 진행 중 거래(완료·취소 아님)·대행 요청, 환불 대기·실패, 출금 신청 중, 정산 잔액(0 아님), 운영자 계정, 본인.
create or replace function user_delete_blockers(p_user uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'admin', (select nullif(is_admin, false) from profiles where id = p_user),
    'transactions', (select nullif(count(*), 0) from transactions
                      where (buyer_id = p_user or seller_id = p_user) and status not in ('completed','cancelled')),
    'proxy_requests', (select nullif(count(*), 0) from proxy_requests
                        where user_id = p_user and status not in ('completed','cancelled')),
    'refunds', (select nullif(count(*), 0) from refunds where user_id = p_user and status in ('pending','failed')),
    'payouts', (select nullif(count(*), 0) from payouts where user_id = p_user and status = 'requested'),
    'balance', (select jsonb_object_agg(currency, s) from (
                  select currency, sum(amount) s from seller_ledger where user_id = p_user
                  group by currency having sum(amount) <> 0) b)
  ));
$$;
revoke all on function user_delete_blockers(uuid) from public, anon, authenticated;

-- 운영자가 부른다: 검사 → 통과하면 익명화·정지·상품 숨김·푸시 삭제 + 기록. auth 계정 삭제는 서버(service_role)가 이어서 한다.
create or replace function admin_prepare_user_delete(p_user uuid) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare v_b jsonb;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if p_user = auth.uid() then raise exception 'cannot delete yourself'; end if;
  perform 1 from profiles where id = p_user for update;
  if not found then raise exception 'user not found'; end if;
  v_b := user_delete_blockers(p_user);
  if v_b <> '{}'::jsonb then
    perform log_admin_action('user_delete_blocked', 'user', p_user::text, v_b);
    return jsonb_build_object('ok', false, 'blockers', v_b);
  end if;
  update profiles set suspended = true, nickname = '탈퇴한 사용자', deleted_at = now() where id = p_user;
  update listings set hidden = true where seller_id = p_user;
  delete from push_subscriptions where user_id = p_user;
  perform log_admin_action('user_delete', 'user', p_user::text, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function admin_prepare_user_delete(uuid) from public;
grant execute on function admin_prepare_user_delete(uuid) to authenticated;

-- ── ⑥ 운영 표 직접 쓰기 기록 (운영자 세션만. 서버·크론(service_role)과 일반 회원 쓰기는 기록하지 않는다) ──
create or replace function log_ops_write() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_new jsonb; v_old jsonb; v_row jsonb; v_fields text[]; v_detail jsonb;
begin
  if auth.uid() is null or not is_admin_user() then return null; end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  v_row := coalesce(v_new, v_old);
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_fields from jsonb_object_keys(v_new) k
      where k not in ('updated_at') and (v_new -> k) is distinct from (v_old -> k);
    if v_fields is null then return null; end if;
  end if;
  v_detail := jsonb_strip_nulls(jsonb_build_object(
    'fields', case when v_fields is null then null else array_to_string(v_fields, ', ') end,
    'title', left(coalesce(v_row ->> 'title', v_row ->> 'label', ''), 80),
    'rate_from', case when tg_table_name = 'exchange_rates' and tg_op = 'UPDATE' then v_old -> 'rate' end,
    'rate', case when tg_table_name = 'exchange_rates' then v_row -> 'rate' end,
    'status', case when tg_table_name = 'support_tickets' then v_row ->> 'status' end,
    'rating', case when tg_table_name = 'reviews' then v_row -> 'rating' end,
    'comment', case when tg_table_name = 'reviews' then left(v_row ->> 'comment', 200) end,
    'reviewer', case when tg_table_name = 'reviews' then v_row ->> 'reviewer_id' end
  ));
  if v_detail ->> 'title' = '' then v_detail := v_detail - 'title'; end if;
  perform log_admin_action(tg_table_name || '_' || lower(tg_op), tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'pair', '?'), v_detail);
  return null;
end $$;
revoke all on function log_ops_write() from public, anon, authenticated;

drop trigger if exists banners_ops_log on banners;
create trigger banners_ops_log after insert or update or delete on banners for each row execute function log_ops_write();
drop trigger if exists notices_ops_log on notices;
create trigger notices_ops_log after insert or update or delete on notices for each row execute function log_ops_write();
drop trigger if exists trending_themes_ops_log on trending_themes;
create trigger trending_themes_ops_log after insert or update or delete on trending_themes for each row execute function log_ops_write();
drop trigger if exists exchange_rates_ops_log on exchange_rates;
create trigger exchange_rates_ops_log after insert or update or delete on exchange_rates for each row execute function log_ops_write();
drop trigger if exists external_items_ops_log on external_items;
create trigger external_items_ops_log after insert or update or delete on external_items for each row execute function log_ops_write();
drop trigger if exists support_tickets_ops_log on support_tickets;
create trigger support_tickets_ops_log after update on support_tickets for each row execute function log_ops_write();
drop trigger if exists reviews_ops_log on reviews;
create trigger reviews_ops_log after delete on reviews for each row execute function log_ops_write();

-- ── 되돌리기 (필요할 때만, 순서대로) ──
-- 0) 보류 상품 목록을 먼저 뽑는다: select id, title, seller_id, held_at, held_tx_id from listings where status = 'held';
--    보류 상품을 판매중으로 돌릴지 판매완료로 둘지 정한 뒤 update 한다(enum 값 'held' 자체는 지울 수 없어 남긴다).
-- drop trigger if exists banners_ops_log on banners; drop trigger if exists notices_ops_log on notices;
-- drop trigger if exists trending_themes_ops_log on trending_themes; drop trigger if exists exchange_rates_ops_log on exchange_rates;
-- drop trigger if exists external_items_ops_log on external_items; drop trigger if exists support_tickets_ops_log on support_tickets;
-- drop trigger if exists reviews_ops_log on reviews; drop function if exists log_ops_write();
-- drop function if exists admin_prepare_user_delete(uuid); drop function if exists user_delete_blockers(uuid);
-- drop trigger if exists listings_hold_guard on listings; drop function if exists guard_listing_hold();
-- drop function if exists admin_release_listing_hold(uuid, text);
-- resolve_dispute·admin_cancel_transaction: 0025 의 정의를 다시 실행한다(이후 listing_after_tx_cancel 삭제).
-- is_admin_user: 0016 정의로 되돌린다. advance_* 의 v_admin := is_admin_user() 는 그대로 둬도 정지 검사만 빠진다.
-- drop trigger if exists transactions_disputed_from on transactions; drop function if exists remember_disputed_from();
-- 컬럼(listings.held_at·held_tx_id, transactions.disputed_from)은 남겨도 해가 없다.
