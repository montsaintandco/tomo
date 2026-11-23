-- 0029 콘텐츠: 홈 배너 + 공지 DB화 (2026-11-23, 미적용·미검증 — DB 일시정지 중)
-- · banners: 어드민(/admin/banners)이 관리자 세션으로 직접 쓴다. RLS 가 관리자만 통과시킨다(서비스 롤 API 없음).
--   대상 audience = 뷰어 나라(profiles.country, 게스트는 언어로 판정) KR/JP 또는 ALL.
--   기간은 반열림 [starts_at, ends_at). 어드민은 날짜(KST=JST)로 받아 시작일 0시 ~ 종료일 다음 날 0시로 저장한다.
--   링크는 사이트 안 경로('/'로 시작, '//'·역슬래시·공백 금지) 또는 https:// 만.
--   이미지: 공개 버킷 banners 안 경로(image_path, 예: KR/<uuid>.webp). 5MB·jpeg/png/webp 는 버킷 설정이 막는다.
-- · notices: /notice 가 게시된 행만 읽는다. 0건·오류면 앱이 lib/notices.ts 코드 목록으로 폴백한다.
-- 적용: 대시보드 SQL 에디터(전체가 한 트랜잭션). 다시 돌려도 되게 if not exists / drop policy if exists.
-- 검증: begin … rollback 으로만(운영에 시험 행을 남기지 않는다).

-- ── 공통: updated_at·updated_by 는 DB 가 찍는다 ─────────────────
create or replace function _content_touch() returns trigger
  language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
revoke all on function _content_touch() from public, anon, authenticated;

-- ── banners ─────────────────────────────────────────────────
create table if not exists banners (
  id          uuid primary key default gen_random_uuid(),
  audience    text not null default 'ALL'
              constraint banners_audience_check check (audience in ('KR', 'JP', 'ALL')),
  image_path  text not null
              constraint banners_image_path_check check (
                char_length(image_path) <= 300
                and image_path ~ '^[A-Za-z0-9][A-Za-z0-9/_.-]*$'
                and position('..' in image_path) = 0
              ),
  alt_ko      text not null constraint banners_alt_ko_check check (btrim(alt_ko) <> '' and char_length(alt_ko) <= 200),
  alt_ja      text not null default '' constraint banners_alt_ja_check check (char_length(alt_ja) <= 200),
  link_url    text
              constraint banners_link_url_check check (
                link_url is null or (
                  char_length(link_url) <= 1000
                  and link_url !~ '[[:space:][:cntrl:]\\]'
                  and (link_url ~ '^/([^/]|$)' or link_url ~ '^https://[^/]')
                )
              ),
  starts_at   timestamptz,
  ends_at     timestamptz,
  sort_order  integer not null default 0
              constraint banners_sort_order_check check (sort_order between -1000000 and 1000000),
  is_active   boolean not null default true,
  updated_by  uuid default auth.uid() references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint banners_period_check check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create index if not exists banners_audience_order_idx on banners (audience, sort_order);

create or replace function _banners_touch() returns trigger
  language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by); -- SQL 에디터처럼 auth.uid() 가 없으면 보낸 값을 둔다
  return new;
end $$;
revoke all on function _banners_touch() from public, anon, authenticated;
drop trigger if exists banners_touch on banners;
create trigger banners_touch before insert or update on banners
  for each row execute function _banners_touch();

alter table banners enable row level security;
revoke all on banners from anon, authenticated;
grant select on banners to anon;
grant select, insert, update, delete on banners to authenticated; -- 쓰기는 RLS 가 관리자만 통과
grant all on banners to service_role;

drop policy if exists "banners public read" on banners;
create policy "banners public read" on banners for select to anon, authenticated
  using (is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
drop policy if exists "banners admin read" on banners;
create policy "banners admin read" on banners for select to authenticated using (is_admin_user());
drop policy if exists "banners admin insert" on banners;
create policy "banners admin insert" on banners for insert to authenticated with check (is_admin_user());
drop policy if exists "banners admin update" on banners;
create policy "banners admin update" on banners for update to authenticated
  using (is_admin_user()) with check (is_admin_user());
drop policy if exists "banners admin delete" on banners;
create policy "banners admin delete" on banners for delete to authenticated using (is_admin_user());

-- ── notices ─────────────────────────────────────────────────
create table if not exists notices (
  id            uuid primary key default gen_random_uuid(),
  published_on  date not null default current_date,
  title_ko      text not null constraint notices_title_ko_check check (btrim(title_ko) <> '' and char_length(title_ko) <= 200),
  title_ja      text not null constraint notices_title_ja_check check (btrim(title_ja) <> '' and char_length(title_ja) <= 200),
  body_ko       text not null constraint notices_body_ko_check check (char_length(body_ko) <= 10000),
  body_ja       text not null constraint notices_body_ja_check check (char_length(body_ja) <= 10000),
  pinned        boolean not null default false,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists notices_list_idx on notices (pinned desc, published_on desc);

drop trigger if exists notices_touch on notices;
create trigger notices_touch before update on notices
  for each row execute function _content_touch();

alter table notices enable row level security;
revoke all on notices from anon, authenticated;
grant select on notices to anon;
grant select, insert, update, delete on notices to authenticated;
grant all on notices to service_role;

drop policy if exists "notices public read" on notices;
create policy "notices public read" on notices for select to anon, authenticated using (is_published);
drop policy if exists "notices admin read" on notices;
create policy "notices admin read" on notices for select to authenticated using (is_admin_user());
drop policy if exists "notices admin insert" on notices;
create policy "notices admin insert" on notices for insert to authenticated with check (is_admin_user());
drop policy if exists "notices admin update" on notices;
create policy "notices admin update" on notices for update to authenticated
  using (is_admin_user()) with check (is_admin_user());
drop policy if exists "notices admin delete" on notices;
create policy "notices admin delete" on notices for delete to authenticated using (is_admin_user());

-- 시드: lib/notices.ts 의 코드 공지 1건 (같은 제목이 있으면 넣지 않는다)
insert into notices (published_on, title_ko, title_ja, body_ko, body_ja)
select date '2026-09-04',
  '장바구니·1회 결제 도입',
  'カート・1回決済を導入',
  E'해외 마켓 상품을 장바구니에 담아 한 번에 주문할 수 있어요. 상품 가격·국제 배송비·통관·대행 수수료를 합한 금액을 주문 시 1회 결제하며, 2차 결제는 없습니다.\n거주 국가는 마이페이지 → 프로필 편집에서 바꿀 수 있어요.',
  E'海外マーケットの商品をカートに入れてまとめて注文できます。商品価格・国際配送費・通関・代行手数料を合わせた金額を注文時に1回決済し、追加請求はありません。\n居住国はマイページ → プロフィール編集で変更できます。'
where not exists (select 1 from notices where title_ko = '장바구니·1회 결제 도입');

-- ── Storage: 공개 버킷 banners (읽기는 공개 URL, 쓰기는 관리자) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('banners', 'banners', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 업서트는 insert+select+update, 삭제(remove)도 select 로 대상을 먼저 찾는다. 공개 URL 로 읽으니 목록 조회는 관리자만
drop policy if exists "banners objects admin select" on storage.objects;
create policy "banners objects admin select" on storage.objects for select to authenticated
  using (bucket_id = 'banners' and public.is_admin_user());
drop policy if exists "banners objects admin insert" on storage.objects;
create policy "banners objects admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'banners' and public.is_admin_user());
drop policy if exists "banners objects admin update" on storage.objects;
create policy "banners objects admin update" on storage.objects for update to authenticated
  using (bucket_id = 'banners' and public.is_admin_user()) with check (bucket_id = 'banners' and public.is_admin_user());
drop policy if exists "banners objects admin delete" on storage.objects;
create policy "banners objects admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'banners' and public.is_admin_user());

notify pgrst, 'reload schema';
