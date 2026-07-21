insert into storage.buckets (id, name, public) values ('listing-images','listing-images', true)
on conflict (id) do nothing;

create policy "anyone reads listing images" on storage.objects for select
  using (bucket_id = 'listing-images');
create policy "authenticated uploads listing images" on storage.objects for insert
  to authenticated with check (bucket_id = 'listing-images');

create policy "seller writes own listing translations" on listing_translations for insert
  with check (exists (select 1 from listings l where l.id = listing_id and l.seller_id = auth.uid()));
