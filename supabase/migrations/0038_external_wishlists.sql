-- 0038 해외 상품 찜 (aaa W1). 기존 wishlists 는 TOMO 매물(listing_id)만 담는다 — 외부 마켓 상품은 이 표에 따로 담는다.
-- 외부 상품은 언제든 사라지므로 찜할 때의 제목·가격·통화·썸네일을 스냅샷으로 둔다(마이페이지 목록이 외부 조회 없이 보인다).
-- 쓰기는 app/api/wish/external(로그인 사용자 세션)이 한다. RLS 로 본인 행만 읽고·넣고·지운다.
create table if not exists external_wishlists (
  user_id uuid not null references profiles(id) on delete cascade,
  source text not null check (source in ('mercari', 'yahoo_auction', 'yahoo_flea', 'daangn', 'joongna')),
  source_id text not null check (char_length(source_id) between 1 and 120),
  title text not null default '' check (char_length(title) <= 300),
  price integer not null default 0 check (price >= 0),
  currency text not null check (currency in ('KRW', 'JPY')),
  thumb text not null default '' check (char_length(thumb) <= 1000),
  created_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);
create index if not exists external_wishlists_user_idx on external_wishlists (user_id, created_at desc);

alter table external_wishlists enable row level security;
drop policy if exists "own external wish read" on external_wishlists;
create policy "own external wish read" on external_wishlists for select using (user_id = auth.uid());
drop policy if exists "own external wish add" on external_wishlists;
create policy "own external wish add" on external_wishlists for insert with check (user_id = auth.uid());
drop policy if exists "own external wish remove" on external_wishlists;
create policy "own external wish remove" on external_wishlists for delete using (user_id = auth.uid());
-- update 정책 없음: 스냅샷은 찜할 때 한 번만 적는다(다시 찜하면 지우고 넣는다)

-- 되돌리기:
-- drop table if exists external_wishlists;
