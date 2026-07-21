-- 발신자 언어 저장 (번역 방향·말풍선 색 판정). 테이블은 비어 있지만 안전하게 default 후 제거
alter table messages add column source_language text not null default 'ko'
  check (source_language in ('ko','ja'));
alter table messages alter column source_language drop default;

-- 대화 생성 정책 강화: seller_id는 해당 상품의 실제 판매자여야 하고, 본인 상품에는 채팅 불가
drop policy "buyer starts conversation" on conversations;
create policy "buyer starts conversation" on conversations for insert
  with check (
    buyer_id = auth.uid()
    and buyer_id <> seller_id
    and exists (select 1 from listings l where l.id = listing_id and l.seller_id = seller_id)
  );

-- Realtime: messages INSERT 이벤트 발행 (구독은 RLS로 참여자만)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table messages;
  end if;
end $$;
