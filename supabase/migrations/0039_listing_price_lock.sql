-- 0039 상품 가격 잠금 (W3, 2026-11-26)
-- 판매자가 콘솔·API로 직접 update 해도 예약중이거나 진행 중 거래(완료·취소가 아닌 거래)가 있으면 가격을 못 바꾼다.
-- 규칙은 admin_update_listing(0037)과 같다. 운영자 RPC도 같은 규칙이라 트리거는 모든 역할에 적용한다.
-- 가격 제안 수락(respond_offer, 0015)은 status = 'active' 일 때만 가격을 바꾸므로 정상 흐름은 막히지 않는다.
create or replace function guard_listing_price_lock() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.price is distinct from old.price then
    if old.status = 'reserved' or exists (
      select 1 from transactions t where t.listing_id = old.id and t.status not in ('completed', 'cancelled')) then
      raise exception 'price locked: listing is reserved or has an active transaction';
    end if;
  end if;
  return new;
end $$;
revoke all on function guard_listing_price_lock() from public, anon, authenticated;

create trigger listings_price_lock before update of price on listings
  for each row execute function guard_listing_price_lock();

-- 되돌리기:
-- drop trigger if exists listings_price_lock on listings;
-- drop function if exists guard_listing_price_lock();
