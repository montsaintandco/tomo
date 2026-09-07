-- 보안 보강 (2026-09-07 출시 전 감사)
-- 1) listings: 판매자가 콘솔로 bumped_at·view_count·seller_id·reserved_at을 직접 바꾸는 것을 막는다.
--    update는 허용 컬럼만, with check로 소유권 이전 차단. 끌올은 bump_listing(), 예약은 start_transaction()만.
revoke update on listings from authenticated;
grant update (title, description, price, category, trade_method, cross_border_enabled, images, condition, shipping_payer, ship_days, allow_offers, status, hidden)
  on listings to authenticated;
drop policy if exists "update own listing" on listings;
create policy "update own listing" on listings for update
  using (seller_id = auth.uid()) with check (seller_id = auth.uid());

-- 2) 푸시 구독 키(endpoint·p256dh·auth)를 대화 상대가 RPC로 읽어 앱 밖에서 임의 푸시를 보내는 경로 차단.
--    서버(service_role)만 호출하는 변형을 두고, 기존 함수는 authenticated에서 회수.
create or replace function push_targets_for(p_conversation uuid, p_sender uuid)
  returns table (endpoint text, p256dh text, auth text)
  language sql stable security definer set search_path = public as $$
  select s.endpoint, s.p256dh, s.auth from push_subscriptions s
  join conversations c on c.id = p_conversation
  where p_sender in (c.buyer_id, c.seller_id)
    and s.user_id = case when p_sender = c.buyer_id then c.seller_id else c.buyer_id end
$$;
revoke all on function push_targets_for(uuid, uuid) from public, anon, authenticated;
revoke execute on function push_targets(uuid) from authenticated;
