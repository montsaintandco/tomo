-- 외부 마켓 상품 스냅샷 캐시 (Plan 05 Task 2)
-- 일본: mercari(비공식 API)·yahoo_auction(파서). 한국: daangn·joongna는 예약(어드민 수동 등록으로 커버)
create table external_items (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('mercari','yahoo_auction','daangn','joongna')),
  source_id text not null,
  url text not null,
  title text not null,
  title_translated text,
  price integer not null check (price >= 0),
  currency currency_code not null,
  images text[] not null default '{}',
  seller_name text not null default '',
  status text not null default 'active' check (status in ('active','sold','stale')),
  raw jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (source, source_id)
);
create index on external_items (source, status, fetched_at desc);

alter table external_items enable row level security;
-- 공개 열람 (게스트 포함)
create policy "external items are public" on external_items for select using (true);
-- 쓰기는 서버(API 라우트의 upsert)와 admin만. authenticated 일반 유저 직접 쓰기 차단
revoke insert, update, delete on external_items from authenticated, anon;
create policy "admin writes external items" on external_items for insert
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
create policy "admin updates external items" on external_items for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
grant insert, update on external_items to authenticated; -- RLS가 admin으로 제한
