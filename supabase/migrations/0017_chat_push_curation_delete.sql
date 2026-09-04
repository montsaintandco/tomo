-- 0017: 채팅 이미지 · 읽음/안읽음 · 웹푸시 구독 · 인기 큐레이션 DB화 · 계정 완전 삭제 준비
-- 컬럼/테이블 먼저, 함수는 나중 (SQL 함수는 정의 시점에 본문을 검증한다)

-- ── 1. 채팅 이미지 ──
alter table messages add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('chat-images', 'chat-images', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
  on conflict (id) do nothing;

-- 경로: <conversation_id>/<user_id>/<uuid>.<ext> — 대화 참여자만 읽고, 본인 폴더에만 쓴다
create policy "chat images: participants read" on storage.objects for select to authenticated
  using (bucket_id = 'chat-images' and exists (
    select 1 from conversations c
    where c.id::text = (storage.foldername(name))[1] and auth.uid() in (c.buyer_id, c.seller_id)));
create policy "chat images: participants upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-images'
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (select 1 from conversations c
      where c.id::text = (storage.foldername(name))[1] and auth.uid() in (c.buyer_id, c.seller_id)));
create policy "chat images: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-images' and (storage.foldername(name))[2] = auth.uid()::text);

-- ── 2. 읽음 상태 ──
create table conversation_reads (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
alter table conversation_reads enable row level security;
create policy "own reads" on conversation_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 3. 웹푸시 구독 ──
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
create policy "own subscriptions" on push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 4. 인기 큐레이션 ──
create table trending_themes (
  id uuid primary key default gen_random_uuid(),
  country country_code not null,            -- 이 테마를 보는 뷰어의 나라 (KR 뷰어 → 일본 마켓)
  key text not null unique,
  label text not null,
  label_ja text not null,
  term text not null,                       -- 마켓 언어 검색어
  sources text[] not null,
  sort_order int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table trending_themes enable row level security;
create policy "themes are public" on trending_themes for select using (active or is_admin_user());
create policy "admin writes themes" on trending_themes for insert to authenticated with check (is_admin_user());
create policy "admin updates themes" on trending_themes for update to authenticated using (is_admin_user());
create policy "admin deletes themes" on trending_themes for delete to authenticated using (is_admin_user());

insert into trending_themes (country, key, label, label_ja, term, sources, sort_order) values
  ('KR','pokemon-card','포켓몬카드','ポケモンカード','ポケモンカード','{mercari,yahoo_auction}',1),
  ('KR','film-camera','필름카메라','フィルムカメラ','フィルムカメラ','{mercari,yahoo_auction}',2),
  ('KR','ghibli','지브리 굿즈','ジブリ グッズ','ジブリ グッズ','{mercari,yahoo_auction}',3),
  ('KR','sanrio','산리오','サンリオ','サンリオ','{mercari,yahoo_auction}',4),
  ('KR','seiko-vintage','세이코 빈티지 시계','セイコー ヴィンテージ','セイコー 腕時計 ヴィンテージ','{mercari,yahoo_auction}',5),
  ('KR','anime-figure','애니 피규어','アニメ フィギュア','アニメ フィギュア','{mercari,yahoo_auction}',6),
  ('JP','kpop-photocard','K-pop 포토카드','K-POP トレカ','포토카드','{daangn,joongna}',1),
  ('JP','k-beauty','한국 화장품','韓国コスメ','화장품','{daangn,joongna}',2),
  ('JP','camping','캠핑용품','キャンプ用品','캠핑용품','{daangn,joongna}',3),
  ('JP','galaxy','갤럭시','Galaxy','갤럭시','{daangn,joongna}',4),
  ('JP','hanbok','한복·전통 소품','韓服・伝統小物','한복','{daangn,joongna}',5)
  on conflict (key) do nothing;

-- ── 5. 계정 완전 삭제 준비 ──
-- auth.users 삭제가 프로필로 cascade 되면 상품·거래·메시지 FK가 막는다.
-- FK를 끊고 익명화된 유령 프로필을 남긴다 (탈퇴해도 거래 기록은 남아요).
alter table profiles drop constraint if exists profiles_id_fkey;
alter table profiles add column if not exists deleted_at timestamptz;

-- ── 함수 ──
-- 내 안읽음 총합 (내비 점) — 내가 참여한 대화에서 상대가 보낸, 마지막 읽음 이후 메시지 수
create or replace function unread_count() returns int
  language sql stable security definer set search_path = public as $$
  select count(*)::int from messages m
  join conversations c on c.id = m.conversation_id
  left join conversation_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
  where auth.uid() in (c.buyer_id, c.seller_id)
    and m.sender_id <> auth.uid()
    and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
$$;
revoke all on function unread_count() from public;
grant execute on function unread_count() to authenticated;

-- 대화별 안읽음 (채팅 목록 배지)
create or replace function unread_by_conversation() returns table (conversation_id uuid, n int)
  language sql stable security definer set search_path = public as $$
  select c.id, count(m.id)::int from conversations c
  left join conversation_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
  join messages m on m.conversation_id = c.id and m.sender_id <> auth.uid()
    and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
  where auth.uid() in (c.buyer_id, c.seller_id)
  group by c.id
$$;
revoke all on function unread_by_conversation() from public;
grant execute on function unread_by_conversation() to authenticated;

-- 상대방 푸시 구독 — 호출자가 대화 참여자일 때만, 상대의 구독만 (service_role 없이 발송 가능)
create or replace function push_targets(p_conversation uuid)
  returns table (endpoint text, p256dh text, auth text)
  language sql stable security definer set search_path = public as $$
  select s.endpoint, s.p256dh, s.auth from push_subscriptions s
  join conversations c on c.id = p_conversation
  where auth.uid() in (c.buyer_id, c.seller_id)
    and s.user_id = case when auth.uid() = c.buyer_id then c.seller_id else c.buyer_id end
$$;
revoke all on function push_targets(uuid) from public;
grant execute on function push_targets(uuid) to authenticated;
