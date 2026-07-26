-- 센터 운영자(admin)는 거래 당사자가 아니어도 거래를 조회할 수 있어야 함(/admin/center).
-- 상태 전이는 여전히 advance_transaction(admin 검증)만 경유.
create policy "admin reads transactions" on transactions for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
