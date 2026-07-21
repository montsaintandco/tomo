update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
where id = 'listing-images';

drop policy "authenticated uploads listing images" on storage.objects;
create policy "authenticated uploads listing images" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'listing-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "delete own listing" on listings for delete
  using (seller_id = auth.uid());
