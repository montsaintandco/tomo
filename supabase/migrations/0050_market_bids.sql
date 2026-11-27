-- 0050: 해외 마켓 경매 입찰 대행 M1 (docs/aaa/15-market-auction-proxy.md 4장·7장)
-- 표 5개(market_bid_settings·market_bids·market_bid_auths·market_bid_events·market_bid_blocks), MB 번호,
-- 신청·결제창 연결·승인·취소·만료·승인 해제/매입 기록 함수, 가드. 입찰됨·낙찰·주문 전환·크론은 M3(다음 번호).
-- 이름: 「신청」 = 고객이 낸 한 건(market_bids), 「승인」 = 카드 사전 승인(market_bid_auths, Stripe manual capture),
--       「매입」 = 승인 금액 청구(capture), 「해제」 = 승인 취소(PaymentIntent cancel).
-- 돈 규칙: 금액은 DB 가 계산한다(market_bid_amount). 서버는 마켓에서 다시 읽은 사실(현재가·입찰 수·마감·송료)만 넘긴다.
--          신청 함수는 service_role 만 부른다(고객이 마감·현재가를 꾸며 직접 부르지 못하게).
-- 1차 범위: 한국 회원(KRW 결제)만, 메루카리만(설정 sources). 기본값은 Ren 확정(2026-11-27) 그대로.

create sequence if not exists market_bid_code_seq;

-- 설정(한 행). 접수는 꺼진 채로 시작한다(M6 리허설 뒤 켠다)
create table if not exists market_bid_settings (
  id boolean primary key default true check (id),
  accepting boolean not null default false,          -- 접수 스위치
  sources text[] not null default '{mercari}',       -- 지원 마켓
  cap_max_jpy int not null default 30000,            -- 상한가 최대
  max_open int not null default 5,                   -- 전체 진행 건수
  max_open_per_user int not null default 1,          -- 고객당 진행 건수
  daily_cap_jpy int not null default 100000,         -- 하루(서울 날짜) 신청 상한가 합
  min_lead_minutes int not null default 180,         -- 마감 임박 거절(수동 단계 3시간)
  max_lead_hours int not null default 96,            -- 마감까지 남은 시간 상한
  auth_margin_hours int not null default 12,         -- 마감 + 여유 <= 승인 유효 시각
  pending_minutes int not null default 45,           -- 결제창 대기 유지
  fee_jpy int not null default 0,                    -- 입찰 대행 수수료(낙찰 때만)
  executor text not null default 'manual' check (executor in ('manual', 'airship')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into market_bid_settings (id) values (true) on conflict do nothing;

-- 입찰 정지 회원(낙찰 뒤 재결제 미이행 등, M3 이 채운다). 운영자만
create table if not exists market_bid_blocks (
  user_id uuid primary key references profiles(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists market_bids (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default order_code('MB', nextval('market_bid_code_seq')),
  user_id uuid not null references profiles(id),
  request_id uuid not null,
  external_item_id uuid not null references external_items(id),
  source text not null check (source in ('mercari', 'yahoo_auction')),
  source_id text not null,
  status text not null default 'pending_auth' check (status in (
    'pending_auth', 'authorized', 'placed', 'outbid', 'hold', 'won', 'ordered', 'lost', 'cancelled', 'missed', 'expired', 'capture_failed')),
  cap_jpy int not null check (cap_jpy > 0),
  domestic_ship_jpy int not null default 0 check (domestic_ship_jpy >= 0),  -- 신청 때 확인한 일본 내 송료
  seen_price_jpy int not null check (seen_price_jpy >= 0),                  -- 신청 때 서버가 읽은 현재가
  seen_bids int not null default 0,
  ends_at timestamptz not null,
  currency currency_code not null default 'KRW',
  rate numeric not null check (rate > 0),          -- 신청 시점 JPY_KRW(고정, 매입도 이 값)
  fee_jpy int not null default 0,
  auth_breakdown jsonb not null,                   -- market_bid_amount(상한가) 결과
  auth_krw int not null check (auth_krw > 0),      -- 최대 결제액(승인액)
  auth_id uuid,                                    -- 지금 살아 있는 승인 행
  auth_expires_at timestamptz,                     -- Stripe capture_before(정본)
  authorized_at timestamptz,
  executor text not null default 'manual' check (executor in ('manual', 'airship')),
  executor_ref text, armed_at timestamptz, placed_at timestamptz, last_bid_jpy int, is_top boolean,
  final_price_jpy int, final_ship_jpy int, capture_breakdown jsonb, capture_krw int, captured_krw int,
  order_id uuid references proxy_orders(id),
  hold_reason text, fail_reason text,
  ship_name text not null, ship_phone text not null, ship_postal text not null, ship_address text not null,
  ship_note text not null default '', pccc text, address_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (user_id, request_id)
);
-- 고객·상품당 진행 중 한 건, 상품당 승인된 진행 건 한 건(먼저 승인된 사람)
create unique index if not exists market_bids_open_user_item on market_bids (user_id, external_item_id)
  where status in ('pending_auth', 'authorized', 'placed', 'outbid', 'hold', 'won', 'capture_failed');
create unique index if not exists market_bids_live_item on market_bids (external_item_id)
  where status in ('authorized', 'placed', 'outbid', 'hold', 'won', 'capture_failed');
create index if not exists market_bids_status on market_bids (status, ends_at);
create index if not exists market_bids_user on market_bids (user_id, created_at desc);

create table if not exists market_bid_auths (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null references market_bids(id),
  stripe_session_id text not null unique,
  payment_intent_id text unique,
  amount_krw int not null check (amount_krw > 0),
  status text not null default 'pending' check (status in ('pending', 'authorized', 'captured', 'releasing', 'released', 'superseded', 'failed')),
  capture_before timestamptz,
  captured_krw int,
  release_reason text,
  created_at timestamptz not null default now(),
  authorized_at timestamptz, captured_at timestamptz, released_at timestamptz
);
create index if not exists market_bid_auths_bid on market_bid_auths (bid_id);
create index if not exists market_bid_auths_releasing on market_bid_auths (status) where status = 'releasing';
alter table market_bids add constraint market_bids_auth_fk foreign key (auth_id) references market_bid_auths(id);

create table if not exists market_bid_events (
  id bigserial primary key,
  bid_id uuid not null references market_bids(id),
  kind text not null check (kind in ('requested', 'authorized', 'auth_void', 'armed', 'placed', 'outbid', 'rebid', 'hold', 'released',
    'won', 'captured', 'ordered', 'lost', 'missed', 'cancelled', 'expired', 'loss_recorded', 'capture_failed')),
  amount_jpy int,
  evidence jsonb not null default '{}',
  actor uuid,
  created_at timestamptz not null default now()
);
create index if not exists market_bid_events_bid on market_bid_events (bid_id, id);

-- 권한: 읽기는 본인·운영자(신청), 운영자(나머지). 쓰기는 함수만
alter table market_bid_settings enable row level security;
alter table market_bid_blocks enable row level security;
alter table market_bids enable row level security;
alter table market_bid_auths enable row level security;
alter table market_bid_events enable row level security;
drop policy if exists "mb settings read" on market_bid_settings;
create policy "mb settings read" on market_bid_settings for select using (true);
drop policy if exists "mb blocks admin" on market_bid_blocks;
create policy "mb blocks admin" on market_bid_blocks for select using (is_admin_user());
drop policy if exists "mb own or admin" on market_bids;
create policy "mb own or admin" on market_bids for select using (user_id = auth.uid() or is_admin_user());
drop policy if exists "mb auths admin" on market_bid_auths;
create policy "mb auths admin" on market_bid_auths for select using (is_admin_user());
drop policy if exists "mb events admin" on market_bid_events;
create policy "mb events admin" on market_bid_events for select using (is_admin_user());
revoke insert, update, delete on market_bid_settings, market_bid_blocks, market_bids, market_bid_auths, market_bid_events from anon, authenticated;
revoke all on market_bid_settings, market_bid_blocks, market_bids, market_bid_auths, market_bid_events from anon;
grant select on market_bid_settings, market_bids, market_bid_auths, market_bid_events, market_bid_blocks to authenticated;

create or replace function market_bids_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists market_bids_touch on market_bids;
create trigger market_bids_touch before update on market_bids for each row execute function market_bids_touch();

-- 결제액 계산(정본). 대행 주문(create_proxy_order·proxy_customs·lib/fees.ts proxyOrderTotal)과 같은 규칙:
-- 소계 = round((가격 + 일본 내 송료) × 환율), 국제배송 8,000원(주문당 1회), 통관 예상 = proxy_customs, 수수료 = round(수수료엔 × 환율).
-- 신청(상한가)과 매입(낙찰가) 모두 이 함수로 계산한다(M3). lib/market-bid.ts marketBidAmount 와 같아야 한다(단위 테스트).
create or replace function market_bid_amount(p_price_jpy int, p_ship_jpy int, p_rate numeric, p_fee_jpy int)
returns jsonb language sql immutable set search_path = public as $$
  with s as (select round((p_price_jpy + p_ship_jpy) * p_rate)::int sub, 8000 ship, round(coalesce(p_fee_jpy, 0) * p_rate)::int fee)
  select jsonb_build_object('subtotal', sub, 'intl_shipping', ship, 'customs', proxy_customs(sub, ship, 'KRW'), 'fee', fee,
    'total', sub + ship + proxy_customs(sub, ship, 'KRW') + fee) from s
$$;

-- 진행 중으로 세는 상태(신청 가드). 결제창 대기는 유지 시간 안의 것만
create or replace function market_bid_counts_open(p_status text, p_created timestamptz, p_pending_minutes int)
returns boolean language sql stable as $$
  select p_status in ('authorized', 'placed', 'outbid', 'hold', 'won', 'capture_failed')
      or (p_status = 'pending_auth' and p_created > now() - make_interval(mins => p_pending_minutes))
$$;

-- 신청. service_role(서버)만. 서버가 마켓을 방금 다시 읽은 값(p_seen_price·p_bids·p_ends_at·p_ship_jpy)을 넘긴다.
-- p_ship_jpy null = 송료를 알 수 없음(착불·미정) → 거절. 같은 (회원, request_id) 는 같은 행을 돌려준다.
-- 오류 문구(영문 키워드)는 lib/market-bid.ts MB_ERRORS 와 1:1.
create or replace function request_market_bid(
  p_user uuid, p_request_id uuid, p_external_item_id uuid, p_cap_jpy int,
  p_seen_price int, p_bids int, p_ends_at timestamptz, p_ship_jpy int,
  p_ship_name text, p_ship_phone text, p_ship_postal text, p_ship_address text, p_ship_note text,
  p_pccc text, p_address_id uuid
) returns market_bids language plpgsql security definer set search_path = public as $$
declare
  v_set market_bid_settings; v_prof profiles; v_item external_items; v_b market_bids; v_rate numeric; v_amt jsonb;
  v_min int; v_n int; v_day timestamptz;
begin
  if p_user is null or p_request_id is null then raise exception 'mb: bad request'; end if;
  -- 같은 회원의 동시 신청을 줄 세운다(건수·하루 상한 검사 경합 방지). 상품 단위 경합은 유일 색인이 막는다
  perform pg_advisory_xact_lock(hashtext('market_bid_request'));
  select * into v_b from market_bids where user_id = p_user and request_id = p_request_id;
  if found then return v_b; end if;                               -- 멱등

  select * into v_set from market_bid_settings where id;
  if not coalesce(v_set.accepting, false) then raise exception 'mb: not accepting'; end if;
  select * into v_prof from profiles where id = p_user;
  if not found or v_prof.deleted_at is not null then raise exception 'mb: unauthorized'; end if;
  if v_prof.suspended or exists (select 1 from market_bid_blocks where user_id = p_user)
     or exists (select 1 from market_bids where user_id = p_user and status = 'capture_failed') then raise exception 'mb: blocked'; end if;
  if v_prof.country <> 'KR' then raise exception 'mb: country'; end if;   -- 1차: 원화 결제 회원만

  select * into v_item from external_items where id = p_external_item_id;
  if not found then raise exception 'mb: item'; end if;
  if v_item.source <> all (v_set.sources) then raise exception 'mb: source'; end if;
  if p_ship_jpy is null or p_ship_jpy < 0 then raise exception 'mb: shipping unknown'; end if;
  if p_seen_price is null or p_seen_price <= 0 or p_bids is null or p_bids < 0 then raise exception 'mb: bad request'; end if;
  if p_ends_at is null or p_ends_at < now() + make_interval(mins => v_set.min_lead_minutes) then raise exception 'mb: ending soon'; end if;
  if p_ends_at > now() + make_interval(hours => v_set.max_lead_hours) then raise exception 'mb: too early'; end if;

  -- 상한가: 메루카리 = 입찰 0건이면 시작가부터, 있으면 현재가 + 100엔
  v_min := case when p_bids > 0 then p_seen_price + 100 else p_seen_price end;
  if p_cap_jpy is null or p_cap_jpy < v_min then raise exception 'mb: cap too low'; end if;
  if p_cap_jpy > v_set.cap_max_jpy then raise exception 'mb: cap too high'; end if;

  if length(trim(coalesce(p_ship_name, ''))) = 0 or length(trim(coalesce(p_ship_phone, ''))) = 0
     or length(trim(coalesce(p_ship_postal, ''))) = 0 or length(trim(coalesce(p_ship_address, ''))) = 0 then raise exception 'mb: address required'; end if;
  if upper(coalesce(p_pccc, '')) !~ '^P[0-9]{12}$' then raise exception 'mb: pccc required'; end if;

  -- 같은 상품: 다른 회원이 먼저 승인됐으면 거절. 본인이 이미 진행 중이면 거절(결제창 대기는 새 신청으로 바꾼다)
  if exists (select 1 from market_bids where external_item_id = p_external_item_id and user_id <> p_user
             and status in ('authorized', 'placed', 'outbid', 'hold', 'won', 'capture_failed')) then raise exception 'mb: item taken'; end if;
  if exists (select 1 from market_bids where external_item_id = p_external_item_id and user_id = p_user
             and status in ('authorized', 'placed', 'outbid', 'hold', 'won', 'capture_failed')) then raise exception 'mb: already requested'; end if;
  update market_bids set status = 'expired', closed_at = now()
    where user_id = p_user and external_item_id = p_external_item_id and status = 'pending_auth';

  select count(*) into v_n from market_bids where user_id = p_user and market_bid_counts_open(status, created_at, v_set.pending_minutes);
  if v_n >= v_set.max_open_per_user then raise exception 'mb: user limit'; end if;
  select count(*) into v_n from market_bids where market_bid_counts_open(status, created_at, v_set.pending_minutes);
  if v_n >= v_set.max_open then raise exception 'mb: full'; end if;
  v_day := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  if (select coalesce(sum(cap_jpy), 0) from market_bids where created_at >= v_day
        and (market_bid_counts_open(status, created_at, v_set.pending_minutes) or status in ('ordered', 'lost')))
     + p_cap_jpy > v_set.daily_cap_jpy then raise exception 'mb: daily limit'; end if;

  select rate into v_rate from exchange_rates where pair = 'JPY_KRW';
  if v_rate is null or v_rate <= 0 then raise exception 'mb: rate missing'; end if;
  v_amt := market_bid_amount(p_cap_jpy, p_ship_jpy, v_rate, v_set.fee_jpy);

  insert into market_bids (user_id, request_id, external_item_id, source, source_id, cap_jpy, domestic_ship_jpy, seen_price_jpy, seen_bids,
      ends_at, rate, fee_jpy, auth_breakdown, auth_krw, executor,
      ship_name, ship_phone, ship_postal, ship_address, ship_note, pccc, address_id)
    values (p_user, p_request_id, p_external_item_id, v_item.source, v_item.source_id, p_cap_jpy, p_ship_jpy, p_seen_price, p_bids,
      p_ends_at, v_rate, v_set.fee_jpy, v_amt, (v_amt->>'total')::int, v_set.executor,
      trim(p_ship_name), trim(p_ship_phone), trim(p_ship_postal), trim(p_ship_address), left(coalesce(p_ship_note, ''), 300), upper(p_pccc), p_address_id)
    returning * into v_b;
  insert into market_bid_events (bid_id, kind, amount_jpy, evidence, actor)
    values (v_b.id, 'requested', p_cap_jpy, jsonb_build_object('seen_price', p_seen_price, 'bids', p_bids, 'ends_at', p_ends_at, 'ship', p_ship_jpy, 'rate', v_rate), p_user);
  return v_b;
end $$;

-- 결제창 연결. service_role. 신청이 결제창 대기일 때만. 앞 결제창이 있으면 superseded 로 바꾸고 그 세션 id 를 돌려준다(서버가 만료시킨다)
create or replace function market_bid_attach_session(p_bid uuid, p_session text, p_amount_krw int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b market_bids; v_prev text[];
begin
  select * into v_b from market_bids where id = p_bid for update;
  if not found or v_b.status <> 'pending_auth' then raise exception 'mb: not pending'; end if;
  if p_amount_krw is distinct from v_b.auth_krw then raise exception 'mb: amount mismatch'; end if;
  with u as (update market_bid_auths set status = 'superseded' where bid_id = p_bid and status = 'pending' returning stripe_session_id)
    select coalesce(array_agg(stripe_session_id), '{}') into v_prev from u;
  insert into market_bid_auths (bid_id, stripe_session_id, amount_krw) values (p_bid, p_session, p_amount_krw);
  return jsonb_build_object('expire', to_jsonb(v_prev));
end $$;

-- 승인 확인(웹훅·복귀). service_role. 결과 ok=false 면 서버가 그 승인을 바로 해제한다(release_auth_id).
-- 승인이 유효해지는 조건: 신청이 아직 결제창 대기, 금액 일치, 마감 + 여유 <= capture_before, 같은 상품에 먼저 승인된 다른 신청 없음.
create or replace function market_bid_authorized(p_session text, p_payment_intent text, p_amount_krw int, p_capture_before timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_a market_bid_auths; v_b market_bids; v_set market_bid_settings; v_reason text;
begin
  select * into v_a from market_bid_auths where stripe_session_id = p_session for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not found'); end if;   -- 우리 행이 없으면 해제하지 않는다(서버가 기록)
  select * into v_b from market_bids where id = v_a.bid_id for update;
  perform pg_advisory_xact_lock(hashtext('market_bid_item:' || v_b.external_item_id::text));   -- 같은 상품 동시 승인 줄 세우기
  if v_a.status in ('authorized', 'captured') and v_a.payment_intent_id = p_payment_intent then
    return jsonb_build_object('ok', true, 'bid_id', v_b.id, 'auth_id', v_a.id, 'code', v_b.code, 'again', true);   -- 재진입
  end if;
  if v_a.status in ('releasing', 'released') then
    return jsonb_build_object('ok', false, 'bid_id', v_b.id, 'auth_id', v_a.id, 'release_auth_id', v_a.id, 'reason', coalesce(v_a.release_reason, 'released'));
  end if;
  select * into v_set from market_bid_settings where id;
  v_reason := case
    when v_a.status <> 'pending' then 'stale session'
    when v_b.status <> 'pending_auth' then 'bid ' || v_b.status
    when p_amount_krw is distinct from v_a.amount_krw then 'amount'
    when p_capture_before is null or v_b.ends_at + make_interval(hours => v_set.auth_margin_hours) > p_capture_before then 'auth window'
    when exists (select 1 from market_bids x where x.external_item_id = v_b.external_item_id and x.id <> v_b.id
                 and x.status in ('authorized', 'placed', 'outbid', 'hold', 'won', 'capture_failed')) then 'item taken'
  end;
  update market_bid_auths set payment_intent_id = p_payment_intent, capture_before = p_capture_before, authorized_at = now(),
      status = case when v_reason is null then 'authorized' else 'releasing' end, release_reason = v_reason
    where id = v_a.id;
  if v_reason is not null then
    insert into market_bid_events (bid_id, kind, evidence) values (v_b.id, 'auth_void', jsonb_build_object('reason', v_reason, 'pi', p_payment_intent));
    -- 옛 결제창(새 창으로 바뀜)의 승인은 해제만 한다. 신청은 새 창으로 계속 진행된다
    if v_reason = 'stale session' and v_b.status = 'pending_auth' then
      return jsonb_build_object('ok', false, 'bid_id', v_b.id, 'auth_id', v_a.id, 'release_auth_id', v_a.id, 'reason', v_reason);
    end if;
    -- 결제창 대기였던 신청은 닫는다(이미 만료·취소된 신청은 그대로)
    if v_b.status = 'pending_auth' then
      update market_bids set status = 'cancelled', fail_reason = v_reason, closed_at = now() where id = v_b.id;
      update market_bid_auths set status = 'superseded' where bid_id = v_b.id and status = 'pending';
    end if;
    perform notify(v_b.user_id, 'mb_auth_void', 'market_bid', v_b.id::text,
      jsonb_build_object('code', v_b.code, 'source', v_b.source, 'source_id', v_b.source_id, 'reason', v_reason));
    return jsonb_build_object('ok', false, 'bid_id', v_b.id, 'auth_id', v_a.id, 'release_auth_id', v_a.id, 'reason', v_reason);
  end if;
  update market_bids set status = 'authorized', auth_id = v_a.id, auth_expires_at = p_capture_before, authorized_at = now() where id = v_b.id;
  insert into market_bid_events (bid_id, kind, evidence) values (v_b.id, 'authorized', jsonb_build_object('pi', p_payment_intent, 'krw', p_amount_krw, 'capture_before', p_capture_before));
  perform notify(v_b.user_id, 'mb_authorized', 'market_bid', v_b.id::text,
    jsonb_build_object('code', v_b.code, 'source', v_b.source, 'source_id', v_b.source_id, 'krw', v_b.auth_krw));
  return jsonb_build_object('ok', true, 'bid_id', v_b.id, 'auth_id', v_a.id, 'code', v_b.code);
end $$;

-- 고객 취소(본인, 입찰 전만) 또는 운영자. 결제창 대기 → cancelled(결제창 만료 대상 돌려줌), 승인됨 → cancelled + 승인 해제 대기
create or replace function cancel_market_bid(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b market_bids; v_uid uuid := auth.uid(); v_rel uuid; v_exp text[];
begin
  select * into v_b from market_bids where id = p_id for update;
  if not found then raise exception 'mb: not found'; end if;
  if not (v_b.user_id = v_uid or is_admin_user() or auth.role() = 'service_role') then raise exception 'mb: not found'; end if;
  if v_b.status = 'cancelled' then return jsonb_build_object('status', 'cancelled', 'again', true); end if;  -- 멱등
  if v_b.status not in ('pending_auth', 'authorized') then raise exception 'mb: not cancellable'; end if;
  with u as (update market_bid_auths set status = 'superseded' where bid_id = p_id and status = 'pending' returning stripe_session_id)
    select coalesce(array_agg(stripe_session_id), '{}') into v_exp from u;
  if v_b.status = 'authorized' then
    update market_bid_auths set status = 'releasing', release_reason = 'cancelled' where id = v_b.auth_id and status = 'authorized' returning id into v_rel;
  end if;
  update market_bids set status = 'cancelled', closed_at = now(), fail_reason = 'cancelled' where id = p_id;
  insert into market_bid_events (bid_id, kind, actor) values (p_id, 'cancelled', v_uid);
  if v_b.status = 'authorized' then
    perform notify(v_b.user_id, 'mb_cancelled', 'market_bid', v_b.id::text, jsonb_build_object('code', v_b.code, 'source', v_b.source, 'source_id', v_b.source_id));
  end if;
  return jsonb_build_object('status', 'cancelled', 'release_auth_id', v_rel, 'expire', to_jsonb(v_exp));
end $$;

-- 결제창 대기 만료(M3 크론이 부른다). service_role. 만료된 신청에 늦게 온 승인은 market_bid_authorized 가 해제로 돌린다
create or replace function market_bid_expire_pending()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int; v_min int;
begin
  select pending_minutes into v_min from market_bid_settings where id;
  with x as (update market_bids set status = 'expired', closed_at = now()
             where status = 'pending_auth' and created_at <= now() - make_interval(mins => v_min) returning id)
  insert into market_bid_events (bid_id, kind) select id, 'expired' from x;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Stripe 승인 해제 완료 기록. service_role. releasing → released(멱등)
create or replace function market_bid_auth_released(p_auth uuid)
returns market_bid_auths language plpgsql security definer set search_path = public as $$
declare v_a market_bid_auths;
begin
  update market_bid_auths set status = 'released', released_at = now() where id = p_auth and status = 'releasing' returning * into v_a;
  if not found then select * into v_a from market_bid_auths where id = p_auth; end if;
  if v_a.id is null then raise exception 'mb: auth not found'; end if;
  if v_a.status = 'released' and v_a.released_at is not null then
    insert into market_bid_events (bid_id, kind, evidence)
      select v_a.bid_id, 'released', jsonb_build_object('auth', v_a.id, 'pi', v_a.payment_intent_id, 'reason', v_a.release_reason)
      where not exists (select 1 from market_bid_events where bid_id = v_a.bid_id and kind = 'released' and evidence->>'auth' = v_a.id::text);
  end if;
  return v_a;
end $$;

-- Stripe 매입 완료 기록. service_role. authorized → captured(멱등). 신청 상태 전이(won → ordered)는 M3 함수가 한다
create or replace function market_bid_auth_captured(p_auth uuid, p_captured_krw int)
returns market_bid_auths language plpgsql security definer set search_path = public as $$
declare v_a market_bid_auths;
begin
  select * into v_a from market_bid_auths where id = p_auth for update;
  if not found then raise exception 'mb: auth not found'; end if;
  if v_a.status = 'captured' then return v_a; end if;
  if v_a.status <> 'authorized' then raise exception 'mb: auth not capturable'; end if;
  if p_captured_krw is null or p_captured_krw <= 0 or p_captured_krw > v_a.amount_krw then raise exception 'mb: capture amount'; end if;
  update market_bid_auths set status = 'captured', captured_krw = p_captured_krw, captured_at = now() where id = p_auth returning * into v_a;
  update market_bids set captured_krw = p_captured_krw where id = v_a.bid_id;
  insert into market_bid_events (bid_id, kind, evidence) values (v_a.bid_id, 'captured', jsonb_build_object('auth', p_auth, 'krw', p_captured_krw));
  return v_a;
end $$;

revoke all on function request_market_bid(uuid, uuid, uuid, int, int, int, timestamptz, int, text, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function market_bid_attach_session(uuid, text, int) from public, anon, authenticated;
revoke all on function market_bid_authorized(text, text, int, timestamptz) from public, anon, authenticated;
revoke all on function market_bid_expire_pending() from public, anon, authenticated;
revoke all on function market_bid_auth_released(uuid) from public, anon, authenticated;
revoke all on function market_bid_auth_captured(uuid, int) from public, anon, authenticated;
revoke all on function cancel_market_bid(uuid) from public, anon;
grant execute on function request_market_bid(uuid, uuid, uuid, int, int, int, timestamptz, int, text, text, text, text, text, text, uuid) to service_role;
grant execute on function market_bid_attach_session(uuid, text, int) to service_role;
grant execute on function market_bid_authorized(text, text, int, timestamptz) to service_role;
grant execute on function market_bid_expire_pending() to service_role;
grant execute on function market_bid_auth_released(uuid) to service_role;
grant execute on function market_bid_auth_captured(uuid, int) to service_role;
grant execute on function cancel_market_bid(uuid) to authenticated, service_role;

-- 되돌리기(M3 객체가 없을 때, 이 순서로):
-- drop function if exists market_bid_auth_captured(uuid, int); drop function if exists market_bid_auth_released(uuid);
-- drop function if exists market_bid_expire_pending(); drop function if exists cancel_market_bid(uuid);
-- drop function if exists market_bid_authorized(text, text, int, timestamptz); drop function if exists market_bid_attach_session(uuid, text, int);
-- drop function if exists request_market_bid(uuid, uuid, uuid, int, int, int, timestamptz, int, text, text, text, text, text, text, uuid);
-- drop function if exists market_bid_counts_open(text, timestamptz, int); drop function if exists market_bid_amount(int, int, numeric, int);
-- delete from notifications where kind like 'mb\_%';
-- drop table if exists market_bid_events; alter table market_bids drop constraint if exists market_bids_auth_fk;
-- drop table if exists market_bid_auths; drop table if exists market_bids; drop table if exists market_bid_blocks;
-- drop table if exists market_bid_settings; drop function if exists market_bids_touch(); drop sequence if exists market_bid_code_seq;
