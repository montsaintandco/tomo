alter table profiles enable row level security;
alter table listings enable row level security;
alter table listing_translations enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table transactions enable row level security;
alter table exchange_rates enable row level security;
alter table reviews enable row level security;

create policy "profiles are public" on profiles for select using (true);
create policy "insert own profile" on profiles for insert with check (id = auth.uid());
create policy "update own profile" on profiles for update using (id = auth.uid());

create policy "listings are public" on listings for select using (true);
create policy "insert own listing" on listings for insert with check (seller_id = auth.uid());
create policy "update own listing" on listings for update using (seller_id = auth.uid());

create policy "translations are public" on listing_translations for select using (true);

create policy "participants read conversations" on conversations for select
  using (auth.uid() in (buyer_id, seller_id));
create policy "buyer starts conversation" on conversations for insert
  with check (buyer_id = auth.uid());

create policy "participants read messages" on messages for select
  using (exists (select 1 from conversations c
    where c.id = conversation_id and auth.uid() in (c.buyer_id, c.seller_id)));
create policy "participants send messages" on messages for insert
  with check (sender_id = auth.uid() and exists (select 1 from conversations c
    where c.id = conversation_id and auth.uid() in (c.buyer_id, c.seller_id)));

create policy "parties read transactions" on transactions for select
  using (auth.uid() in (buyer_id, seller_id));

create policy "rates are public" on exchange_rates for select using (true);

create policy "reviews are public" on reviews for select using (true);
create policy "reviewer writes own review" on reviews for insert
  with check (reviewer_id = auth.uid() and exists (select 1 from transactions t
    where t.id = transaction_id and auth.uid() in (t.buyer_id, t.seller_id)));
