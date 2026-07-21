-- 0006의 "buyer starts conversation" 정책 결함 수정.
-- 서브쿼리 안 unqualified `seller_id`가 `listings l`의 컬럼으로 바인딩되어
-- EXISTS 절이 `l.seller_id = l.seller_id`(항상 참)로 해석됐음 → 상품 실제 판매자
-- 검증이 무력화. conversations 컬럼을 명시적으로 한정하여 바로잡는다.
drop policy "buyer starts conversation" on conversations;
create policy "buyer starts conversation" on conversations for insert
  with check (
    buyer_id = auth.uid()
    and buyer_id <> seller_id
    and exists (
      select 1 from listings l
      where l.id = conversations.listing_id
        and l.seller_id = conversations.seller_id
    )
  );
