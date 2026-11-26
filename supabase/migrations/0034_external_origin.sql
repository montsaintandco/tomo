-- T3 신뢰·안전: 외부 상품 캐시 오염 막기. 근거 docs/aaa/05-roadmap.md T3, 01#5.
-- 문제: 실파싱이 실패하면 /api/proxy 가 고객이 보낸 제목·이미지·가격(스냅샷)을 external_items 에 넣고,
--       공개 select 정책이 using (true) 라 홈·검색 캐시·관리 화면 밖 어디서나 그 행이 보였다.
-- 해결: origin(live/admin/client) 열을 두고, client 행은 「그 상품으로 대행 요청·장바구니를 가진 본인」과
--       관리자만 본다. DB 에서 막으므로 홈·검색·사이트맵 코드를 고치지 않아도 전부 가려진다.
-- origin 은 트리거가 정한다(코드가 안 보내도 된다):
--   fetched_at = epoch  → client (lib/market/item.ts 가 고객 스냅샷만 epoch 로 넣는다)
--   그 밖에 client 였던 행이 실데이터로 갱신됨 → live
--   새 행을 로그인한 관리자가 직접 넣음(ExternalItemForm) → admin
-- 의존: 0011 external_items, 0012 proxy_requests, 0016 is_admin_user(), 0018 cart_items.

alter table external_items add column if not exists origin text not null default 'live';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'external_items_origin_check') then
    alter table external_items add constraint external_items_origin_check check (origin in ('live', 'admin', 'client'));
  end if;
end $$;

-- 기존 고객 스냅샷 행 백필 (트리거보다 먼저)
update external_items set origin = 'client' where fetched_at < '1970-01-02'::timestamptz and origin <> 'client';

create or replace function external_items_set_origin() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.fetched_at < '1970-01-02'::timestamptz then
    new.origin := 'client';
  elsif new.origin = 'client' then
    new.origin := 'live';
  elsif tg_op = 'INSERT' and new.origin = 'live' and auth.uid() is not null and is_admin_user() then
    new.origin := 'admin';
  end if;
  return new;
end $$;
drop trigger if exists external_items_origin on external_items;
create trigger external_items_origin before insert or update on external_items
  for each row execute function external_items_set_origin();

-- client 행을 볼 수 있는 사람: 그 상품으로 대행 요청을 낸 본인, 장바구니에 담은 본인, 관리자
create index if not exists proxy_requests_item_user_idx on proxy_requests (external_item_id, user_id);
create index if not exists cart_items_item_idx on cart_items (external_item_id);

create or replace function can_read_client_item(p_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from proxy_requests r where r.external_item_id = p_id and r.user_id = auth.uid())
    or exists (select 1 from cart_items c where c.external_item_id = p_id and c.user_id = auth.uid())
    or is_admin_user())
$$;
revoke all on function can_read_client_item(uuid) from public;
grant execute on function can_read_client_item(uuid) to anon, authenticated;

-- 공개 select 정책 교체 (옛 정책: using (true))
drop policy if exists "external items are public" on external_items;
create policy "external items are public" on external_items for select
  using (origin <> 'client' or can_read_client_item(id));

-- ── 확인 쿼리 (메인이 begin … rollback 안에서 돌린다) ──
-- 0) 적용 전에 먼저 기록: select count(*) from external_items where status = 'active' and fetched_at >= '1970-01-02';  -- = N
-- 1) 상품 피드가 그대로인지(anon):
--    set local role anon; select count(*) from external_items where status = 'active';  -- = N 이어야 함 (client 행만 빠짐)
--    select count(*) from external_items where origin = 'client';  -- anon 은 0
-- 2) 대행 요청 흐름: client 행으로 대행 요청을 낸 사용자로 전환하면 그 행이 보여야 한다.
--    reset role; set local role authenticated;
--    set local request.jwt.claims = '{"sub":"<요청자 uuid>","role":"authenticated"}';
--    select e.id, e.origin from proxy_requests r join external_items e on e.id = r.external_item_id
--      where r.user_id = '<요청자 uuid>';  -- 요청 건수와 같은 행 수, client 행 포함
--    같은 쿼리를 다른 사용자 claims 로 → client 행 0
-- 3) request_proxy·create_proxy_order 는 security definer 라 정책 영향 없음:
--    select request_proxy('<client 행 id>', '');  -- 요청자 claims 로 성공
-- 4) 트리거: update external_items set fetched_at = now() where id = '<client 행>' returning origin;  -- live
--    insert … fetched_at = to_timestamp(0) … returning origin;  -- client
-- 5) 성능: explain analyze select id from external_items where status = 'active' limit 60;  -- anon, Seq/Index 비용이 교체 전과 비슷

-- ── 되돌리기 (옛 정책 복원. 열·함수는 남겨도 무해) ──
-- drop policy if exists "external items are public" on external_items;
-- create policy "external items are public" on external_items for select using (true);
-- drop trigger if exists external_items_origin on external_items;
-- drop function if exists external_items_set_origin();
-- drop function if exists can_read_client_item(uuid);
-- drop index if exists proxy_requests_item_user_idx;
-- drop index if exists cart_items_item_idx;
-- alter table external_items drop constraint if exists external_items_origin_check;
-- alter table external_items drop column if exists origin;
