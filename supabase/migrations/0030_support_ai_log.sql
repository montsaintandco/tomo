-- 지원 봇 AI 답변 사용 로그 — 질문·답·모델·성공 여부. 서버(app/api/support-ai)가 서비스 롤로 insert, 관리자만 조회.
-- 표가 없어도 AI 답변은 동작한다(로그만 건너뜀). IP 는 sha256 앞 16자리만 저장.
create table if not exists support_ai_log (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete set null,
  ip_hash text not null,
  lang text not null check (lang in ('ko', 'ja')),
  model text not null,
  question text not null,
  answer text not null default '',
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists support_ai_log_created_idx on support_ai_log (created_at desc);

alter table support_ai_log enable row level security;
-- insert 정책 없음: anon·authenticated 는 쓸 수 없고 서비스 롤(RLS 우회)만 쓴다
drop policy if exists "admin reads ai log" on support_ai_log;
create policy "admin reads ai log" on support_ai_log for select using (is_admin_user());
