-- 팩 A (당근·메루카리 흡수): 상품 상태·배송비 부담·발송 일수, 조회수, 끌어올리기, 가격제안, 나눔(가격 0)
alter table listings
  add column condition text not null default 'good' check (condition in ('new','like_new','good','fair','poor')),
  add column shipping_payer text not null default 'seller' check (shipping_payer in ('seller','buyer')),
  add column ship_days text not null default '2_3' check (ship_days in ('1_2','2_3','4_7')),
  add column allow_offers boolean not null default true,
  add column view_count integer not null default 0,
  add column bumped_at timestamptz not null default now();
update listings set bumped_at = created_at;
create index on listings (status, bumped_at desc);

-- 나눔 = 가격 0
alter table listings drop constraint listings_price_check;
alter table listings add constraint listings_price_check check (price >= 0);

-- 조회수. ponytail: 새로고침마다 +1, 중복 제거는 트래픽 생기면
create function increment_view(lid uuid) returns void
  language sql security definer set search_path = public as
  $$ update listings set view_count = view_count + 1 where id = lid $$;
revoke all on function increment_view(uuid) from public;
grant execute on function increment_view(uuid) to anon, authenticated;

-- 채팅 수 (당근의 "채팅 N") — 참여자 외엔 대화를 못 읽으므로 개수만 함수로
create function conversation_count(lid uuid) returns integer
  language sql stable security definer set search_path = public as
  $$ select count(*)::integer from conversations where listing_id = lid $$;
revoke all on function conversation_count(uuid) from public;
grant execute on function conversation_count(uuid) to anon, authenticated;

-- 끌어올리기: 셀러만, 판매중만, 48시간에 한 번
create function bump_listing(lid uuid) returns timestamptz
  language plpgsql security definer set search_path = public as $$
declare l listings;
begin
  select * into l from listings where id = lid for update;
  if l.id is null or l.seller_id <> auth.uid() then raise exception 'not seller'; end if;
  if l.status <> 'active' then raise exception 'not active'; end if;
  if l.bumped_at > now() - interval '48 hours' then raise exception 'too soon'; end if;
  update listings set bumped_at = now() where id = lid;
  return now();
end $$;
revoke all on function bump_listing(uuid) from public;
grant execute on function bump_listing(uuid) to authenticated;

-- 가격제안 (메루카리 희망가격: 3단계 할인, 익명 통보; 당근 가격제안: 판매자가 허용할 때만)
create table offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  buyer_id uuid not null references profiles(id) on delete cascade,
  price integer not null check (price > 0),
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (listing_id, buyer_id)
);
create index on offers (listing_id, status);
alter table offers enable row level security;
create policy "buyer reads own offers" on offers for select
  using (buyer_id = auth.uid());
create policy "seller reads offers on own listings" on offers for select
  using (exists (select 1 from listings l where l.id = offers.listing_id and l.seller_id = auth.uid()));
create policy "buyer makes offer" on offers for insert
  with check (
    offers.buyer_id = auth.uid()
    and exists (
      select 1 from listings l
      where l.id = offers.listing_id and l.status = 'active' and l.allow_offers
        and l.seller_id <> auth.uid() and offers.price < l.price));
create policy "buyer withdraws unaccepted offer" on offers for delete
  using (buyer_id = auth.uid() and status <> 'accepted');

-- 수락 = 상품 가격을 제안가로 내림 (원자적). 나머지 대기 제안은 자동 거절
create function respond_offer(oid uuid, accept boolean) returns offers
  language plpgsql security definer set search_path = public as $$
declare o offers; l listings;
begin
  select * into o from offers where id = oid for update;
  if o.id is null then raise exception 'no offer'; end if;
  select * into l from listings where id = o.listing_id for update;
  if l.seller_id <> auth.uid() then raise exception 'not seller'; end if;
  if o.status <> 'pending' then raise exception 'already answered'; end if;
  if accept then
    if l.status <> 'active' then raise exception 'not active'; end if;
    update listings set price = o.price where id = l.id;
    update offers set status = 'accepted' where id = oid;
    update offers set status = 'declined' where listing_id = l.id and status = 'pending' and id <> oid;
  else
    update offers set status = 'declined' where id = oid;
  end if;
  select * into o from offers where id = oid;
  return o;
end $$;
revoke all on function respond_offer(uuid, boolean) from public;
grant execute on function respond_offer(uuid, boolean) to authenticated;
