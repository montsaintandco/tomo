-- T3 신뢰·안전: 신고(reports)·차단(blocks). 근거 docs/aaa/05-roadmap.md T3, 01#4.
-- 추가만 한다(기존 표·정책은 고치지 않는다). 차단 검사는 0016 「suspended cannot …」과 같은
-- RESTRICTIVE insert 정책으로 붙여 기존 정책과 AND 로 걸린다.
-- 의존: 0016 is_admin_user()·is_suspended(), 0025 log_admin_action().

-- ── 차단 ──
create table if not exists blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
-- 반대 방향(나를 차단한 사람) 조회용. (blocker, blocked) 는 기본키가 유일 색인이다
create index if not exists blocks_blocked_blocker_idx on blocks (blocked_id, blocker_id);

alter table blocks enable row level security;
-- 내가 차단한 목록만 본다. 누가 나를 차단했는지는 안 보인다
create policy "own blocks read" on blocks for select using (blocker_id = auth.uid());
-- 쓰기는 RPC(block_user·unblock_user)만
revoke insert, update, delete on blocks from anon, authenticated;
grant select on blocks to authenticated;

-- 나와 상대 사이에 어느 쪽이든 차단이 있는지. 인자로 남의 관계를 캐물을 수 없게 auth.uid() 기준만 본다
create or replace function blocked_with(p_other uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = p_other)
       or (blocker_id = p_other and blocked_id = auth.uid()))
$$;

-- 대화 상대와 차단 관계인지(메시지 삽입 정책용)
create or replace function conversation_blocked(p_conversation uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select blocked_with(case when c.buyer_id = auth.uid() then c.seller_id else c.buyer_id end)
    from conversations c where c.id = p_conversation), false)
$$;

-- 상품 판매자와 차단 관계인지(가격제안 삽입 정책용)
create or replace function listing_blocked(p_listing uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select blocked_with(l.seller_id) from listings l where l.id = p_listing), false)
$$;

revoke all on function blocked_with(uuid) from public;
revoke all on function conversation_blocked(uuid) from public;
revoke all on function listing_blocked(uuid) from public;
grant execute on function blocked_with(uuid) to authenticated;
grant execute on function conversation_blocked(uuid) to authenticated;
grant execute on function listing_blocked(uuid) to authenticated;

-- 양방향 차단: 대화 시작·메시지·가격제안을 막는다 (RESTRICTIVE = 기존 허용 정책과 AND)
create policy "blocked cannot chat" on conversations as restrictive for insert
  with check (not blocked_with(case when buyer_id = auth.uid() then seller_id else buyer_id end));
create policy "blocked cannot message" on messages as restrictive for insert
  with check (not conversation_blocked(conversation_id));
create policy "blocked cannot offer" on offers as restrictive for insert
  with check (not listing_blocked(listing_id));

create or replace function block_user(p_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  if p_id is null or p_id = v_uid then raise exception 'cannot block self'; end if;
  if not exists (select 1 from profiles where id = p_id) then raise exception 'user not found'; end if;
  insert into blocks (blocker_id, blocked_id) values (v_uid, p_id) on conflict do nothing;
end $$;

create or replace function unblock_user(p_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  delete from blocks where blocker_id = auth.uid() and blocked_id = p_id;
end $$;

revoke all on function block_user(uuid) from public;
revoke all on function unblock_user(uuid) from public;
grant execute on function block_user(uuid) to authenticated;
grant execute on function unblock_user(uuid) to authenticated;

-- ── 신고 ──
-- target_type: listing(상품) · user(사용자) · conversation(채팅방). target_user_id 는 책임 사용자
-- (상품 판매자·사용자 본인·대화 상대). snapshot 은 접수 시점 증거(상품 제목, 상대 최근 메시지 등) —
-- 관리자는 messages 를 RLS 로 못 읽고, 대화가 지워져도 증거가 남게 한다.
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('listing', 'user', 'conversation')),
  target_id uuid not null,
  target_user_id uuid references profiles(id) on delete set null,
  reason text not null check (reason in ('spam', 'fraud', 'prohibited', 'abuse', 'other')),
  detail text not null default '' check (char_length(detail) <= 1000),
  snapshot jsonb not null default '{}',
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text not null default '',
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id) -- 같은 대상에 1인 1건
);
create index if not exists reports_status_created_idx on reports (status, created_at desc);
create index if not exists reports_reporter_created_idx on reports (reporter_id, created_at desc);

alter table reports enable row level security;
create policy "own or admin reads reports" on reports for select
  using (reporter_id = auth.uid() or is_admin_user());
revoke insert, update, delete on reports from anon, authenticated;
grant select on reports to authenticated;

-- 접수: 대상 존재·본인 아님·참여자 확인, 분당 5건·하루 30건, 같은 대상은 기존 건을 돌려준다(멱등)
create or replace function report_target(p_type text, p_id uuid, p_reason text, p_detail text default '')
  returns reports language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_user uuid; v_snap jsonb := '{}'; v_r reports;
  v_c conversations;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  if p_type not in ('listing', 'user', 'conversation') then raise exception 'invalid target'; end if;
  if p_reason not in ('spam', 'fraud', 'prohibited', 'abuse', 'other') then raise exception 'invalid reason'; end if;

  select * into v_r from reports where reporter_id = v_uid and target_type = p_type and target_id = p_id;
  if found then return v_r; end if;

  if (select count(*) from reports where reporter_id = v_uid and created_at > now() - interval '1 minute') >= 5
     or (select count(*) from reports where reporter_id = v_uid and created_at > now() - interval '1 day') >= 30
  then raise exception 'too many reports'; end if;

  if p_type = 'listing' then
    select l.seller_id, jsonb_build_object('title', l.title, 'price', l.price, 'currency', l.currency)
      into v_user, v_snap from listings l where l.id = p_id;
    if v_user is null then raise exception 'target not found'; end if;
  elsif p_type = 'user' then
    select p.id, jsonb_build_object('nickname', p.nickname) into v_user, v_snap from profiles p where p.id = p_id;
    if v_user is null then raise exception 'target not found'; end if;
  else
    select * into v_c from conversations where id = p_id;
    if v_c.id is null or v_uid not in (v_c.buyer_id, v_c.seller_id) then raise exception 'target not found'; end if;
    v_user := case when v_c.buyer_id = v_uid then v_c.seller_id else v_c.buyer_id end;
    select jsonb_build_object('listing_id', v_c.listing_id, 'messages', coalesce(jsonb_agg(jsonb_build_object(
        'body', left(m.body, 500), 'image', m.image_path is not null, 'at', m.created_at) order by m.created_at), '[]'))
      into v_snap
      from (select * from messages where conversation_id = p_id and sender_id = v_user
            order by created_at desc limit 20) m;
  end if;
  if v_user = v_uid then raise exception 'cannot report self'; end if;

  insert into reports (reporter_id, target_type, target_id, target_user_id, reason, detail, snapshot)
    values (v_uid, p_type, p_id, v_user, p_reason, left(coalesce(p_detail, ''), 1000), coalesce(v_snap, '{}'))
    on conflict (reporter_id, target_type, target_id) do nothing
    returning * into v_r;
  if v_r.id is null then
    select * into v_r from reports where reporter_id = v_uid and target_type = p_type and target_id = p_id;
  end if;
  return v_r;
end $$;

-- 처리: 관리자만, resolved/dismissed, 활동 기록을 남긴다
create or replace function admin_resolve_report(p_id uuid, p_status text, p_note text default '')
  returns reports language plpgsql security definer set search_path = public as $$
declare v_r reports;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if p_status not in ('resolved', 'dismissed', 'open') then raise exception 'invalid status'; end if;
  update reports set status = p_status,
      resolved_by = case when p_status = 'open' then null else auth.uid() end,
      resolved_at = case when p_status = 'open' then null else now() end,
      resolution_note = left(coalesce(p_note, ''), 500)
    where id = p_id returning * into v_r;
  if v_r.id is null then raise exception 'not found'; end if;
  perform log_admin_action('report_' || p_status, 'report', p_id::text,
    jsonb_build_object('target_type', v_r.target_type, 'target_id', v_r.target_id, 'note', left(coalesce(p_note, ''), 300)));
  return v_r;
end $$;

revoke all on function report_target(text, uuid, text, text) from public;
revoke all on function admin_resolve_report(uuid, text, text) from public;
grant execute on function report_target(text, uuid, text, text) to authenticated;
grant execute on function admin_resolve_report(uuid, text, text) to authenticated;

-- ── 확인 쿼리 (메인이 begin … rollback 안에서 돌린다) ──
-- 1) 정상 흐름이 그대로인지: 차단이 없으면 RESTRICTIVE 정책은 참이다.
--    set local role authenticated; set local request.jwt.claims = '{"sub":"<bob uuid>","role":"authenticated"}';
--    insert into conversations (listing_id, buyer_id, seller_id) values ('<alice 상품>', '<bob>', '<alice>'); -- 성공해야 함
--    insert into messages (conversation_id, sender_id, body, source_language) values ('<위 대화>', '<bob>', 'hi', 'ko'); -- 성공
-- 2) 차단 뒤 막히는지: select block_user('<alice>');  → 위 메시지 insert 가 42501(RLS) 로 실패해야 함.
--    alice 쪽에서 보내도 실패해야 함(양방향).
-- 3) 신고: select report_target('listing', '<alice 상품>', 'spam', ''); 두 번 불러도 행이 1개.
--    select count(*) from reports;  -- 신고자 본인은 1, 다른 일반 사용자는 0
-- 4) select admin_resolve_report('<id>', 'resolved', '');  → 일반 사용자는 'admin only'.

-- ── 되돌리기 (필요할 때만, 메인이 실행) ──
-- drop policy if exists "blocked cannot chat" on conversations;
-- drop policy if exists "blocked cannot message" on messages;
-- drop policy if exists "blocked cannot offer" on offers;
-- drop function if exists admin_resolve_report(uuid, text, text);
-- drop function if exists report_target(text, uuid, text, text);
-- drop function if exists block_user(uuid);
-- drop function if exists unblock_user(uuid);
-- drop function if exists listing_blocked(uuid);
-- drop function if exists conversation_blocked(uuid);
-- drop function if exists blocked_with(uuid);
-- drop table if exists reports;
-- drop table if exists blocks;
