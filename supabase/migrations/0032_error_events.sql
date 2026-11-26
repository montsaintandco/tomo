-- T0 관측: 서버·브라우저 오류와 CSP 위반을 한 표에 모은다. 같은 오류는 (source, digest)로 합쳐 count 만 올린다.
-- digest = Next 오류 digest, 없으면 앱이 만든 해시(lib/observe.ts errorKey). 쓰기는 서비스 롤의 record_error_event 만, 읽기는 관리자만.
-- 표가 없어도 사이트는 동작한다(lib/observe.ts 가 적재 실패를 삼킨다).
create table if not exists error_events (
  id bigint generated always as identity primary key,
  source text not null check (source in ('server', 'client', 'csp')),
  digest text not null,
  message text not null,
  stack text,
  path text,
  user_id uuid references profiles(id) on delete set null,
  count integer not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
create unique index if not exists error_events_source_digest_key on error_events (source, digest);
create index if not exists error_events_last_at_idx on error_events (last_at desc);

alter table error_events enable row level security;
-- insert·update 정책 없음: anon·authenticated 는 쓸 수 없다
drop policy if exists "admin reads error events" on error_events;
create policy "admin reads error events" on error_events for select using (is_admin_user());

-- 적재 + 합치기 + 30일 지난 행 정리. 돌려주는 값은 합친 뒤 count.
create or replace function record_error_event(
  p_source text, p_digest text, p_message text, p_stack text, p_path text, p_user uuid
) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from error_events where last_at < now() - interval '30 days';
  insert into error_events (source, digest, message, stack, path, user_id)
  values (p_source, left(p_digest, 128), left(p_message, 1000), left(p_stack, 4000), left(p_path, 300), p_user)
  on conflict (source, digest) do update
    set count = error_events.count + 1,
        last_at = now(),
        message = excluded.message,
        stack = coalesce(excluded.stack, error_events.stack),
        path = coalesce(excluded.path, error_events.path),
        user_id = coalesce(excluded.user_id, error_events.user_id)
  returning count into n;
  return n;
end $$;

revoke all on function record_error_event(text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function record_error_event(text, text, text, text, text, uuid) to service_role;

-- 되돌리기:
-- drop function if exists record_error_event(text, text, text, text, text, uuid);
-- drop table if exists error_events;
