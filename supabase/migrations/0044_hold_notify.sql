-- 0044 상품 보류 알림 + 운영자 견적 기록 (docs/aaa/12 A2)
-- 1) 상품이 보류(held, 0041)로 들어가거나 풀릴 때 판매자에게 인앱 알림. notify_transaction·notify_proxy(0042 정의)는 건드리지 않고 listings 에 별도 트리거를 단다.
-- 2) admin_quote_proxy: quote_proxy(0012) 를 부르고 활동 기록을 남긴다(에어쉽 어드민 브리지 견적이 기록 없이 지나가지 않게). quote_proxy 자체는 그대로.

-- ── 1. 보류 알림 ──
create or replace function notify_listing_hold() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_d jsonb;
begin
  if new.status is not distinct from old.status then return new; end if;
  v_d := jsonb_build_object('title', coalesce(new.title, ''), 'listing_id', new.id);
  if new.status = 'held' then
    perform notify(new.seller_id, 'listing_held', 'listing', new.id::text, v_d);
  elsif old.status = 'held' then
    perform notify(new.seller_id, 'listing_released', 'listing', new.id::text, v_d);
  end if;
  return new;
end $$;
revoke all on function notify_listing_hold() from public, anon, authenticated;
drop trigger if exists listings_hold_notify on listings;
create trigger listings_hold_notify after update of status on listings
  for each row execute function notify_listing_hold();

-- ── 2. 운영자 견적(기록 포함) ──
create or replace function admin_quote_proxy(p_id uuid, p_item_price int, p_fee int, p_shipping int)
  returns proxy_requests language plpgsql security definer set search_path = public as $$
declare v_from proxy_status; v_r proxy_requests;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  select status into v_from from proxy_requests where id = p_id;
  v_r := quote_proxy(p_id, p_item_price, p_fee, p_shipping);
  perform log_admin_action('proxy_quote', 'proxy_request', p_id::text,
    jsonb_build_object('from', v_from, 'item_price', p_item_price, 'fee', p_fee, 'shipping', p_shipping,
      'total', v_r.quote_total, 'order_id', v_r.order_id));
  return v_r;
end $$;
revoke all on function admin_quote_proxy(uuid, int, int, int) from public, anon;
grant execute on function admin_quote_proxy(uuid, int, int, int) to authenticated;

-- 되돌리기:
-- drop trigger if exists listings_hold_notify on listings; drop function if exists notify_listing_hold();
-- drop function if exists admin_quote_proxy(uuid, int, int, int);
