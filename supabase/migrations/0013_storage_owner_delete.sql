-- 고아 이미지 정리: 업로더 본인 폴더(auth.uid()/...)의 객체만 삭제 허용.
-- sell 플로우가 리스팅 생성 실패 시 방금 올린 이미지를 즉시 지울 수 있게 한다.
create policy "owner deletes own listing images" on storage.objects for delete
  to authenticated
  using (bucket_id = 'listing-images' and (storage.foldername(name))[1] = auth.uid()::text);
