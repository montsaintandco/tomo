-- 참여자가 대화를 지울 수 있게 (messages는 FK cascade로 함께 삭제).
-- 이게 없으면 대화가 걸린 상품은 셀러가 지울 수 없다 (conversations.listing_id FK가 non-cascade).
create policy "participant deletes conversation" on conversations for delete
  using (auth.uid() in (buyer_id, seller_id));
