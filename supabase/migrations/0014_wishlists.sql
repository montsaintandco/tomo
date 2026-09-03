-- 찜 (메루카리 「いいね」). 본인 행만 읽고 쓰고 지운다. 개수는 함수로만 공개 (누가 찜했는지는 비공개).
create table wishlists (
  user_id uuid not null references profiles(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
create index on wishlists (listing_id);

alter table wishlists enable row level security;
create policy "own wishlist read" on wishlists for select using (user_id = auth.uid());
create policy "own wishlist add" on wishlists for insert with check (user_id = auth.uid());
create policy "own wishlist remove" on wishlists for delete using (user_id = auth.uid());

create function wishlist_count(lid uuid) returns integer
  language sql stable security definer set search_path = public as
  $$ select count(*)::integer from wishlists where listing_id = lid $$;
revoke all on function wishlist_count(uuid) from public;
grant execute on function wishlist_count(uuid) to anon, authenticated;
