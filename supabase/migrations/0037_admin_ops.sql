-- 0037 어드민 운영 (T8, docs/aaa/05-roadmap.md 「T8 어드민 운영」)
-- 1) 주문 항목(proxy_requests) 상태를 운영자가 손으로 바꾼다. 허용 전이는 표(admin_order_transitions)에 두고 그 밖은 거부한다.
--    돈이 걸린 전이(취소·완료·결제 확인)는 표에 넣을 수도 없다(check). 그 전이는 기존 버튼(0025 admin_cancel_proxy 등)으로만 한다.
-- 2) 운영자가 상품 제목·가격을 고친다. 진행 중 거래가 있으면 가격 변경을 거부한다.
-- 둘 다 log_admin_action(0025)으로 활동 기록을 남긴다. 새 표·새 함수만 추가한다(기존 객체 변경 없음).

-- ── 1. 허용 전이 표 ──
-- kind: forward = 다음 단계, correct = 잘못 누른 단계를 한 칸 되돌림(메모 필수)
create table if not exists admin_order_transitions (
  from_status proxy_status not null,
  to_status proxy_status not null,
  kind text not null check (kind in ('forward', 'correct')),
  primary key (from_status, to_status),
  -- 돈 경계: 결제 전 단계(requested·quoted·approved)와 끝 단계(completed·cancelled)는 출발·도착 어느 쪽에도 올 수 없다
  constraint admin_order_transitions_no_money check (
    from_status not in ('requested', 'quoted', 'approved', 'completed', 'cancelled')
    and to_status not in ('requested', 'quoted', 'approved', 'completed', 'cancelled'))
);
insert into admin_order_transitions (from_status, to_status, kind) values
  ('paid', 'purchasing', 'forward'),
  ('purchasing', 'center_received', 'forward'),
  ('center_received', 'shipped_international', 'forward'),
  ('shipped_international', 'delivered', 'forward'),
  ('purchasing', 'paid', 'correct'),
  ('center_received', 'purchasing', 'correct'),
  ('shipped_international', 'center_received', 'correct'),
  ('delivered', 'shipped_international', 'correct')
on conflict do nothing;
alter table admin_order_transitions enable row level security;
drop policy if exists "admin reads order transitions" on admin_order_transitions;
create policy "admin reads order transitions" on admin_order_transitions for select using (is_admin_user());
revoke insert, update, delete on admin_order_transitions from authenticated, anon;

-- ── 2. 주문 항목 상태 변경 ──
-- p_id = proxy_requests.id (고객 /order/[id]·/proxy/[id] 가 보여 주는 항목 상태). 알림은 기존 notify_proxy 트리거가 보낸다.
create or replace function admin_set_order_status(p_id uuid, p_status proxy_status, p_note text default '', p_tracking text default null)
  returns proxy_requests language plpgsql security definer set search_path = public as $$
declare v_r proxy_requests; v_from proxy_status; v_kind text; v_note text; v_order_status text;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  -- 표의 check 와 별개로 한 번 더 막는다(표가 잘못 바뀌어도 돈 경로는 열리지 않게)
  if p_status in ('cancelled', 'completed') then
    raise exception 'money transition % is not allowed here (use the cancel/refund buttons)', p_status;
  end if;
  v_note := left(trim(coalesce(p_note, '')), 500);
  select * into v_r from proxy_requests where id = p_id for update;
  if v_r.id is null then raise exception 'not found'; end if;
  v_from := v_r.status;
  select kind into v_kind from admin_order_transitions where from_status = v_from and to_status = p_status;
  if v_kind is null then raise exception 'transition % -> % is not allowed', v_from, p_status; end if;
  if v_kind = 'correct' and v_note = '' then raise exception 'note required to move back a step'; end if;
  -- 고객 취소 요청이 걸린 건은 먼저 대행 요청 화면에서 취소(환불)하거나 요청을 정리해야 한다
  if v_from = 'paid' and v_r.cancel_requested_at is not null then
    raise exception 'customer requested cancel: handle it in 대행 요청 first';
  end if;
  -- 장바구니 주문 항목은 주문이 결제 완료일 때만
  if v_r.order_id is not null then
    select status::text into v_order_status from proxy_orders where id = v_r.order_id;
    if v_order_status is distinct from 'paid' then raise exception 'order is not paid (%)', coalesce(v_order_status, 'missing'); end if;
  end if;

  update proxy_requests set status = p_status,
    intl_tracking = case when p_status = 'shipped_international'
      then coalesce(nullif(left(trim(coalesce(p_tracking, '')), 100), ''), intl_tracking) else intl_tracking end
    where id = p_id and status = v_from
    returning * into v_r;
  if not found then raise exception 'state changed concurrently'; end if;

  perform log_admin_action('order_status', 'proxy_request', p_id::text,
    jsonb_build_object('from', v_from, 'to', p_status, 'kind', v_kind, 'note', nullif(v_note, ''),
      'order_id', v_r.order_id, 'tracking', case when p_status = 'shipped_international' then v_r.intl_tracking end));
  return v_r;
end $$;
revoke all on function admin_set_order_status(uuid, proxy_status, text, text) from public, anon;
grant execute on function admin_set_order_status(uuid, proxy_status, text, text) to authenticated;

-- ── 3. 상품 제목·가격 수정 ──
-- null 이면 그 칸은 그대로. 제목 1~80자, 가격 0~100,000,000(등록 API와 같은 범위, 0 = 나눔이라 가격제안을 끈다).
-- 가격은 진행 중 거래(완료·취소가 아닌 거래)가 있거나 예약중이면 바꿀 수 없다.
-- 번역 제목 갱신은 앱(/api/admin/listings)이 한다(번역 API는 DB 밖).
create or replace function admin_update_listing(p_id uuid, p_title text, p_price int, p_note text default '')
  returns listings language plpgsql security definer set search_path = public as $$
declare v_l listings; v_title text; v_price int; v_note text; v_old_title text; v_old_price int;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  select * into v_l from listings where id = p_id for update;
  if v_l.id is null then raise exception 'not found'; end if;
  v_old_title := v_l.title; v_old_price := v_l.price;
  v_title := coalesce(nullif(trim(coalesce(p_title, '')), ''), v_l.title);
  v_price := coalesce(p_price, v_l.price);
  v_note := left(trim(coalesce(p_note, '')), 500);
  if char_length(v_title) > 80 then raise exception 'title too long (max 80)'; end if;
  if v_price < 0 or v_price > 100000000 then raise exception 'price out of range'; end if;
  if v_title = v_l.title and v_price = v_l.price then raise exception 'nothing to change'; end if;
  if v_price <> v_l.price then
    if v_l.status = 'reserved' or exists (
      select 1 from transactions t where t.listing_id = p_id and t.status not in ('completed', 'cancelled')) then
      raise exception 'listing has an active transaction: price cannot change';
    end if;
  end if;

  update listings set title = v_title, price = v_price,
    allow_offers = case when v_price = 0 then false else allow_offers end
    where id = p_id returning * into v_l;

  perform log_admin_action('listing_update', 'listing', p_id::text, jsonb_strip_nulls(jsonb_build_object(
    'note', nullif(v_note, ''),
    'title_from', case when v_title <> v_old_title then v_old_title end,
    'title', case when v_title <> v_old_title then v_title end,
    'price_from', case when v_price <> v_old_price then v_old_price end,
    'price', case when v_price <> v_old_price then v_price end)));
  return v_l;
end $$;
revoke all on function admin_update_listing(uuid, text, int, text) from public, anon;
grant execute on function admin_update_listing(uuid, text, int, text) to authenticated;

-- 되돌리기 (코드 revert 만으로 충분. 함수·표를 지워야 할 때만):
-- drop function if exists admin_update_listing(uuid, text, int, text);
-- drop function if exists admin_set_order_status(uuid, proxy_status, text, text);
-- drop table if exists admin_order_transitions;
