-- 0054 T4 센터 검수 기록·센터 주소 (docs/aaa/12 4장 P2·6.1 T4)
-- 1) inspections: 센터 검수 기록. 추가만 한다(고치기 = 새 기록). 센터 경유 거래(transactions) 또는 대행 요청(proxy_requests) 하나에 붙는다.
--    약관 제5조 「센터에서 상품의 외관·수량을 검수하고 기록을 남깁니다」·제8조 「센터 검수 기록을 바탕으로 조정」의 실체.
--    읽기: 운영자, 그 거래의 구매자·판매자, 그 대행 요청의 고객(읽기 전용). 쓰기: admin_record_inspection 만.
-- 2) 사진: 비공개 버킷 inspection-photos, 경로 <tx|proxy>/<대상 id>/<파일>. 화면은 서명 URL 로만 보여 준다.
-- 3) center_addresses: 판매자 센터 발송 안내에 쓰는 센터 주소. 상자 매칭은 새 코드 대신 주문 번호(TX/T)를 주소 끝에 적게 한다.
-- FK 규칙(0051): 표 쌍마다 FK 하나. inspections→transactions·proxy_requests·profiles, center_addresses→profiles 각 1개.

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references public.transactions(id) on delete cascade,
  proxy_request_id uuid references public.proxy_requests(id) on delete cascade,
  result text not null check (result in ('ok', 'issue')),
  note text not null default '' check (char_length(note) <= 2000),
  photos text[] not null default '{}' check (cardinality(photos) <= 10),
  inspector_id uuid references public.profiles(id) on delete set null,
  received boolean not null default false,          -- 이 기록과 함께 입고 처리했는가
  created_at timestamptz not null default now(),
  constraint inspections_one_target check (num_nonnulls(transaction_id, proxy_request_id) = 1),
  constraint inspections_issue_note check (result = 'ok' or char_length(btrim(note)) > 0)
);
create index inspections_tx_idx on public.inspections (transaction_id, created_at desc) where transaction_id is not null;
create index inspections_pr_idx on public.inspections (proxy_request_id, created_at desc) where proxy_request_id is not null;

alter table public.inspections enable row level security;
revoke all on public.inspections from anon, authenticated;
grant select on public.inspections to authenticated;
create policy "inspections read: admin or party" on public.inspections for select to authenticated using (
  is_admin_user()
  or exists (select 1 from transactions t where t.id = inspections.transaction_id and auth.uid() in (t.buyer_id, t.seller_id))
  or exists (select 1 from proxy_requests r where r.id = inspections.proxy_request_id and r.user_id = auth.uid())
);

-- 사진 버킷(비공개). 올리기·지우기는 운영자, 읽기는 운영자와 그 대상의 당사자
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inspection-photos', 'inspection-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "inspection photos: admin or party read" on storage.objects for select to authenticated using (
  bucket_id = 'inspection-photos' and (
    is_admin_user()
    or ((storage.foldername(name))[1] = 'tx' and exists (select 1 from transactions t
          where t.id::text = (storage.foldername(name))[2] and auth.uid() in (t.buyer_id, t.seller_id)))
    or ((storage.foldername(name))[1] = 'proxy' and exists (select 1 from proxy_requests r
          where r.id::text = (storage.foldername(name))[2] and r.user_id = auth.uid()))
  )
);
create policy "inspection photos: admin upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'inspection-photos' and is_admin_user() and (storage.foldername(name))[1] in ('tx', 'proxy')
);
create policy "inspection photos: admin delete" on storage.objects for delete to authenticated using (
  bucket_id = 'inspection-photos' and is_admin_user()
);

-- 검수 기록 하나. p_kind = tx|proxy. p_receive = true 면 입고 처리(거래 shipped_to_center→center_received, 대행 purchasing→center_received)를 같은 트랜잭션에서 한다.
-- 사진은 이미 버킷에 올라간 경로만 받는다(없는 파일을 가리키는 기록을 막는다).
create or replace function public.admin_record_inspection(
  p_kind text, p_target uuid, p_result text, p_note text default '', p_photos text[] default '{}', p_receive boolean default false
) returns public.inspections
language plpgsql security definer set search_path = public as $$
declare
  v_note text := left(btrim(coalesce(p_note, '')), 2000);
  v_photos text[] := coalesce(p_photos, '{}');
  v_status text;
  v_tx transactions;
  v_pr proxy_requests;
  v_row inspections;
  v_p text;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if p_result is null or p_result not in ('ok', 'issue') then raise exception 'result must be ok|issue'; end if;
  if p_result = 'issue' and v_note = '' then raise exception 'note required for issue'; end if;
  if cardinality(v_photos) > 10 then raise exception 'too many photos (max 10)'; end if;
  if (select count(distinct x) from unnest(v_photos) x) <> cardinality(v_photos) then raise exception 'duplicate photo'; end if;

  if p_kind = 'tx' then
    select * into v_tx from transactions where id = p_target for update;
    if v_tx.id is null then raise exception 'not found'; end if;
    if not v_tx.is_cross_border or v_tx.meetup then raise exception 'not a center transaction'; end if;
    v_status := v_tx.status::text;
    if v_status in ('pending_payment', 'paid', 'shipped') then raise exception 'not at center yet (%)', v_status; end if;
    if p_receive then
      if v_status <> 'shipped_to_center' then raise exception 'receive needs shipped_to_center (now %)', v_status; end if;
      perform advance_transaction(p_target, 'center_received'::tx_status, null);
    end if;
  elsif p_kind = 'proxy' then
    select * into v_pr from proxy_requests where id = p_target for update;
    if v_pr.id is null then raise exception 'not found'; end if;
    v_status := v_pr.status::text;
    if v_status in ('requested', 'quoted', 'approved', 'paid') then raise exception 'not at center yet (%)', v_status; end if;
    if p_receive then
      if v_status <> 'purchasing' then raise exception 'receive needs purchasing (now %)', v_status; end if;
      perform admin_set_order_status(p_target, 'center_received'::proxy_status, '', null);
    end if;
  else
    raise exception 'kind must be tx|proxy';
  end if;

  foreach v_p in array v_photos loop
    if v_p !~ ('^' || p_kind || '/' || p_target::text || '/[A-Za-z0-9._-]{1,80}$') then raise exception 'bad photo path: %', v_p; end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'inspection-photos' and o.name = v_p) then
      raise exception 'photo not uploaded: %', v_p;
    end if;
  end loop;

  insert into inspections (transaction_id, proxy_request_id, result, note, photos, inspector_id, received)
  values (case when p_kind = 'tx' then p_target end, case when p_kind = 'proxy' then p_target end,
          p_result, v_note, v_photos, auth.uid(), p_receive)
  returning * into v_row;

  perform log_admin_action('inspection', case when p_kind = 'tx' then 'transaction' else 'proxy_request' end, p_target::text,
    jsonb_build_object('inspection_id', v_row.id, 'result', p_result, 'photos', cardinality(v_photos), 'received', p_receive, 'status', v_status));
  return v_row;
end $$;
revoke all on function public.admin_record_inspection(text, uuid, text, text, text[], boolean) from public, anon;
grant execute on function public.admin_record_inspection(text, uuid, text, text, text[], boolean) to authenticated, service_role;

-- 센터 주소(판매자 발송 안내). 값은 에어쉽 ops_settings.center_addresses(같은 창고, 설계 5장 결정 11)에서 옮겼다(2026-11-27).
create table public.center_addresses (
  center center_code primary key,
  recipient text not null default 'TOMO' check (char_length(recipient) between 1 and 80),
  postal text check (postal is null or char_length(postal) <= 20),
  address text not null check (char_length(address) between 1 and 300),
  phone text check (phone is null or char_length(phone) <= 30),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
alter table public.center_addresses enable row level security;
revoke all on public.center_addresses from anon, authenticated;
grant select on public.center_addresses to authenticated;
create policy "center addresses: signed-in read" on public.center_addresses for select to authenticated using (true);

insert into public.center_addresses (center, recipient, postal, address) values
  ('NARITA', 'TOMO', '286-0221', '千葉県富里市七栄649-114 建物内109'),
  ('SEOUL', 'TOMO', null, '서울시 금천구 가산디지털2로 35 잔카드림타워 907')
on conflict (center) do nothing;

create or replace function public.admin_set_center_address(
  p_center center_code, p_recipient text, p_postal text, p_address text, p_phone text
) returns public.center_addresses
language plpgsql security definer set search_path = public as $$
declare v_old center_addresses; v_row center_addresses;
begin
  if not is_admin_user() then raise exception 'admin only'; end if;
  if nullif(btrim(coalesce(p_address, '')), '') is null then raise exception 'address required'; end if;
  select * into v_old from center_addresses where center = p_center;
  insert into center_addresses (center, recipient, postal, address, phone, updated_at, updated_by)
  values (p_center, coalesce(nullif(btrim(p_recipient), ''), 'TOMO'), nullif(btrim(coalesce(p_postal, '')), ''), btrim(p_address),
          nullif(btrim(coalesce(p_phone, '')), ''), now(), auth.uid())
  on conflict (center) do update set recipient = excluded.recipient, postal = excluded.postal, address = excluded.address,
    phone = excluded.phone, updated_at = now(), updated_by = auth.uid()
  returning * into v_row;
  perform log_admin_action('center_address', 'center', p_center::text,
    jsonb_build_object('before', to_jsonb(v_old) - 'updated_by', 'after', to_jsonb(v_row) - 'updated_by'));
  return v_row;
end $$;
revoke all on function public.admin_set_center_address(center_code, text, text, text, text) from public, anon;
grant execute on function public.admin_set_center_address(center_code, text, text, text, text) to authenticated, service_role;

-- 되돌리기(기록이 있으면 먼저 목록을 뽑아 둔다: select * from inspections; 버킷 파일은 대시보드에서 지운다):
-- drop function if exists public.admin_set_center_address(center_code, text, text, text, text);
-- drop table if exists public.center_addresses;
-- drop function if exists public.admin_record_inspection(text, uuid, text, text, text[], boolean);
-- drop policy if exists "inspection photos: admin or party read" on storage.objects;
-- drop policy if exists "inspection photos: admin upload" on storage.objects;
-- drop policy if exists "inspection photos: admin delete" on storage.objects;
-- delete from storage.buckets where id = 'inspection-photos';   -- 파일이 남아 있으면 실패한다
-- drop table if exists public.inspections;
