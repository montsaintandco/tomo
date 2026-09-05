-- 문의 티켓 — 지원 봇의 "상담원 연결"이 남기는 구조화된 문의 (사조: 상품 URL·옵션·수량·문의 내용 폼 → 상담원).
-- 대화(conversations)는 상품이 필수라 재사용 불가. 사용자는 자기 것만, 어드민은 전부.
create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  category text not null check (category in ('before', 'after', 'sell', 'travel')),
  item_url text,            -- 주문 전: 대상 상품 URL
  item_option text,         -- 옵션(색상·사이즈)
  quantity int,             -- 수량
  order_ref text,           -- 주문 후: 주문/거래 번호 또는 상품명
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  reply text,               -- 운영자 답변 (하나 — 이어지는 대화는 새 문의)
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists support_tickets_user_idx on support_tickets (user_id, created_at desc);
create index if not exists support_tickets_status_idx on support_tickets (status, created_at desc);

alter table support_tickets enable row level security;
create policy "own tickets" on support_tickets for select using (user_id = auth.uid() or is_admin_user());
create policy "open own ticket" on support_tickets for insert with check (user_id = auth.uid());
create policy "admin answers tickets" on support_tickets for update using (is_admin_user()) with check (is_admin_user());
create policy "suspended cannot ticket" on support_tickets as restrictive for insert with check (not is_suspended());
